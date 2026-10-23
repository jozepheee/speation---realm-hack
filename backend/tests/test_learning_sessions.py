import asyncio,uuid,io,wave,math,struct
from copy import deepcopy
import httpx,pytest,models
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from database import Base,get_db
from auth.router import router as auth_router
from learners.router import router as learners_router
from learners import learning_sessions as sessions,learning_demonstrations as demos,ai_care_reports as reports
from models.care import SpeechRecording
from models.learner import AccountRole,ClinicianAssignment
from models.learning import LearningSession

def test_saved_story_listening_demonstrations_and_report_evidence_are_learner_scoped(monkeypatch):
 stored={}
 def retain(data):key=str(uuid.uuid4());stored[key]=data;return key
 monkeypatch.setattr(demos.storage,'retain',retain);monkeypatch.setattr(demos.storage,'read',lambda key:stored[key])
 async def run():
  engine=create_async_engine('sqlite+aiosqlite:///:memory:')
  async with engine.begin() as connection:await connection.run_sync(Base.metadata.create_all)
  factory=async_sessionmaker(engine,expire_on_commit=False)
  async def database():
   async with factory() as db:yield db
  app=FastAPI();app.include_router(auth_router,prefix='/auth')
  for router in [learners_router,sessions.router,demos.router,reports.router]:app.include_router(router)
  app.dependency_overrides[get_db]=database
  try:
   async with httpx.AsyncClient(transport=httpx.ASGITransport(app),base_url='http://test') as client:
    accounts=[]
    for _ in range(3):
     account=(await client.post('/auth/register',json={'name':'Fixture','email':f'{uuid.uuid4()}@example.com','password':'isolated-fixture-password'})).json()
     accounts.append((uuid.UUID(account['user']['id']),{'Authorization':'Bearer '+account['access_token']}))
    owner,headers=accounts[0];clinician,clinical=accounts[1];_,outside=accounts[2]
    learner=(await client.post('/learners',headers=headers,json={'display_name':'Fixture','age':9,'language':'en','relationship':'guardian','consent':{'practice_allowed':True,'retain_audio_allowed':True,'cloud_processing_allowed':True,'policy_version':'2026-10-14-v1','authorized_to_consent':True}})).json()
    identifier=uuid.UUID(learner['id']);base=f'/learners/{identifier}'
    async with factory() as db:
     db.add_all([AccountRole(user_id=clinician,role='clinician'),ClinicianAssignment(learner_id=identifier,clinician_id=clinician,assigned_by=owner)]);await db.commit()
    payload={'request_id':str(uuid.uuid4()),'kind':'listening','pair_id':'s-sh'}
    assert (await client.post(base+'/learning-sessions',headers=outside,json=payload)).status_code==404
    response=await client.post(base+'/learning-sessions',headers=headers,json=payload);assert response.status_code==201,response.text
    value=response.json();sid=value['id'];path=f'/learning-sessions/{sid}'
    assert (await client.post(base+'/learning-sessions',headers=headers,json=payload)).json()['id']==sid
    assert (await client.post(base+'/learning-sessions',headers=headers,json={**payload,'pair_id':'k-t'})).status_code==409
    assert (await client.get(path,headers=clinical)).status_code==200
    assert (await client.get(path,headers=outside)).status_code==404
    for index,expected in enumerate(value['content']['rounds']):
     event={'request_id':str(uuid.uuid4()),'action':'answer','index':index,'choice':expected}
     assert (await client.post(path+'/events',headers=clinical,json=event)).status_code==404
     answer=await client.post(path+'/events',headers=headers,json=event);assert answer.status_code==200,answer.text
     assert (await client.post(path+'/events',headers=headers,json=event)).json()==answer.json()
    assert answer.json()['completed'] and answer.json()['listening']=={'correct':4,'total':4}
    assert answer.json()['pronunciation_score'] is None
    story={'title':'The useful key','scenes':[{'narration':'We find a locked door.','sentence':'I have the key.','question':'What could happen next?', 'visual':{'setting':'home','characters':['friend'],'objects':['key','door'],'caption':'A key and a door.'}} for _ in range(3)]}
    start_story={'request_id':str(uuid.uuid4()),'kind':'story','target':'key','story':story}
    started=(await client.post(base+'/learning-sessions',headers=headers,json=start_story)).json()
    # Simulate a start recorded before optional animation fields were introduced.
    async with factory() as db:
     legacy=await db.get(LearningSession,uuid.UUID(started['id']));content=deepcopy(legacy.content)
     for scene in content['start_request']['story']['scenes']:scene['visual'].pop('shots',None)
     legacy.content=content;await db.commit()
    replayed=await client.post(base+'/learning-sessions',headers=headers,json=start_story)
    assert replayed.status_code==201 and replayed.json()['id']==started['id']
    spath=f'/learning-sessions/{started["id"]}/events'
    for index in range(3):
     async with factory() as db:
      recording=SpeechRecording(learner_id=identifier,submitted_by=owner,attempt_id=uuid.uuid4(),language='en',task='sentence',expected_text='I have the key.',duration_seconds=1,quality={},audio_sha256='0'*64)
      db.add(recording);await db.commit();rid=str(recording.id)
     completed=await client.post(spath,headers=headers,json={'request_id':str(uuid.uuid4()),'action':'scene','index':index,'recording_id':rid});assert completed.status_code==200,completed.text
    assert completed.json()['completed'] and len(completed.json()['events'])==3
    async with factory() as db:
     evidence,metrics,_=await reports.snapshot(db,identifier)
     assert metrics['learning_sessions']==2 and metrics['completed_learning_sessions']==2
     assert metrics['listening_choices']['total']==4
     assert len([item for item in evidence if item['source']=='learning_activity'])==2
    # New lessons keep aided listening, independent speech and modelling separate.
    new=(await client.post(base+'/learning-sessions',headers=headers,json={'request_id':str(uuid.uuid4()),'kind':'listening','pair_id':'g-b','lesson_version':2})).json()
    newpath=f'/learning-sessions/{new["id"]}/events'
    assert len(new['content']['rounds'])==6
    first={'request_id':str(uuid.uuid4()),'action':'answer','index':0,'choice':new['content']['rounds'][0]}
    assert (await client.post(newpath,headers=headers,json=first)).status_code==409
    familiar={'request_id':str(uuid.uuid4()),'action':'familiarized'}
    assert (await client.post(newpath,headers=headers,json=familiar)).status_code==200
    for index,expected in enumerate(new['content']['rounds']):
     r=await client.post(newpath,headers=headers,json={'request_id':str(uuid.uuid4()),'action':'answer','index':index,'choice':expected,'replays':2 if index==0 else 1})
     assert r.status_code==200,r.text
    assert r.json()['completed'] and r.json()['listening']['independent_correct']==5 and r.json()['listening']['supported_choices']==1
    model=(await client.post(base+'/learning-sessions',headers=headers,json={'request_id':str(uuid.uuid4()),'kind':'model','target':'green','lesson_version':2})).json()
    modelpath=f'/learning-sessions/{model["id"]}/events'
    watched={'request_id':str(uuid.uuid4()),'action':'model_watch','model_source':'maya'}
    assert (await client.post(modelpath,headers=outside,json=watched)).status_code==404
    assert (await client.post(modelpath,headers=headers,json=watched)).status_code==200
    assert (await client.post(modelpath,headers=headers,json={**watched,'request_id':str(uuid.uuid4()),'model_source':'clinician'})).status_code==422
    async with factory() as db:
     fresh=SpeechRecording(learner_id=identifier,submitted_by=owner,attempt_id=uuid.uuid4(),language='en',task='word',expected_text='green',duration_seconds=1,quality={},audio_sha256='1'*64)
     db.add(fresh);await db.commit();fresh_id=str(fresh.id)
    retry={'request_id':str(uuid.uuid4()),'action':'practice_attempt','recording_id':fresh_id,'expected_text':'green','phase':'word'}
    attempt=await client.post(modelpath,headers=headers,json=retry);assert attempt.status_code==200,attempt.text
    assert (await client.post(modelpath,headers=headers,json=retry)).json()==attempt.json()
    assert (await client.post(modelpath,headers=headers,json={**retry,'request_id':str(uuid.uuid4())})).status_code==409
    assert (await client.post(modelpath,headers=headers,json={'request_id':str(uuid.uuid4()),'action':'model_complete'})).json()['completed']
    async with factory() as db:
     evidence,metrics,_=await reports.snapshot(db,identifier)
     assert any(item.get('model_steps') for item in evidence if item['source']=='learning_activity')
     assert any(item.get('supported_choices')==1 for item in evidence if item['source']=='learning_activity')
    audio=io.BytesIO()
    with wave.open(audio,'wb') as wav:
     wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b''.join(struct.pack('<h',int(6000*math.sin(2*math.pi*220*i/16000))) for i in range(16000)))
    form={'target':'key','adult_permission':'true'};files={'media':('example.wav',audio.getvalue(),'audio/wav')}
    denied=await client.post(base+'/demonstrations',headers=headers,data={**form,'adult_permission':'false'},files=files)
    assert denied.status_code==422
    created=await client.post(base+'/demonstrations',headers=headers,data=form,files=files);assert created.status_code==201,created.text
    did=created.json()['id'];assert created.json()['status']=='family_example'
    assert (await client.get(f'/demonstrations/{did}/media',headers=outside)).status_code==404
    served=await client.get(f'/demonstrations/{did}/media',headers=clinical);assert served.content==audio.getvalue()
    assert served.headers['cache-control']=='private, no-store'
    assert (await client.put(f'/demonstrations/{did}/review',headers=headers,json={'approved':True})).status_code==403
    approved=await client.put(f'/demonstrations/{did}/review',headers=clinical,json={'approved':True});assert approved.json()['status']=='clinician_approved'
    assert len((await client.get(base+'/demonstrations?target=key',headers=headers)).json())==1
    assert (await client.delete(f'/demonstrations/{did}',headers=headers)).status_code==200
    assert (await client.get(f'/demonstrations/{did}/media',headers=headers)).status_code==404
  finally:await engine.dispose()
 asyncio.run(run())
