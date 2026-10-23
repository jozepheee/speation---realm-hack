"""Software-only workflow fixtures; providers and audio are synthetic."""
import asyncio,io,json,uuid,wave
from datetime import datetime,timedelta,timezone
import httpx,pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
import models
from database import Base,get_db
from auth.router import router as auth_router
from learners.router import router as learners_router
from learners import speech_coaching,translation_router
from learners.message_practice import message_words,practice_sentence
from models.care import SpeechRecording,AcousticProposal
from models.speech_workflow import MessageTranslation
from models.learning import LearningDemonstration


def test_message_words_keep_indic_marks_and_sentence_selection():
    assert message_words('ഇന്ന് മഴ പെയ്യുന്നു. മഴ!')==['ഇന്ന്','മഴ','പെയ്യുന്നു']
    assert message_words('आज बारिश होती है।')==['आज','बारिश','होती','है']
    assert message_words("I don't want rain.")==['I',"don't",'want','rain']
    assert practice_sentence('Hello. Today rain falls. Goodbye.','rain')=='Today rain falls.'
    assert message_words('Rain rain RAIN.')==['Rain']

def test_only_current_supported_words_are_ranked_by_reviewed_goal_then_recurrence():
    from types import SimpleNamespace
    from learners.message_practice import prioritize_supported_words
    words=['school','sun','assessment']
    result=prioritize_supported_words(words,[SimpleNamespace(practice_word='sun'),SimpleNamespace(practice_word='unsupported')],
        [{'word':'assessment','recording_ids':['1','2','3']},{'word':'unsupported','recording_ids':['4','5','6','7']}])
    assert result==['sun','assessment','school'] and 'unsupported' not in result


@pytest.mark.parametrize('raw,expected',[
    ('എനിക്ക് എനിക്ക് എറണാകുളം വരെ പോകണം പോകണം','എനിക്ക് എറണാകുളം വരെ പോകണം'),
    ('मुझे मुझे घर जाना जाना है।','मुझे घर जाना है।'),
    ('I I want to go go.','I want to go.'),
    ('Rain rain RAIN!','Rain!'),
    ('Go. Go home.','Go. Go home.'),
    ('I think that I can go.','I think that I can go.'),
])
def test_message_drafts_remove_adjacent_repeats_only(raw,expected):
    assert translation_router.message_draft(raw)==expected


@pytest.mark.parametrize('language,word,message',[('en','rain','Today rain falls.'),('hi','बारिश','आज बारिश होती है।'),('ml','മഴ','ഇന്ന് മഴ പെയ്യുന്നു.')])
def test_confirmed_audio_scan_word_sentence_retry_and_saved_resume(monkeypatch,language,word,message):
    from config import settings
    monkeypatch.setattr(settings,'OPENROUTER_KEY','software-fixture')
    output=io.BytesIO()
    with wave.open(output,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000);audio.writeframes(b'\0\0'*32000)
    monkeypatch.setattr(speech_coaching.storage,'read',lambda key:output.getvalue())
    monkeypatch.setattr(speech_coaching,'target_reference',lambda text,lang:{'words':[{'word':w,'variants':[['m','a']],'syllables':[w]} for w in message_words(text)]})
    calls=[]
    async def analyze(clip,context):
        calls.append(context.copy())
        assert clip[:4]==b'RIFF' and context['language']==language
        return speech_coaching.CoachingResponse(state='tentative_observation',summary='Explicit software fixture',concerns=[
            speech_coaching.PracticeConcern(word=word,expected_phone='m',produced_phone=None,category='uncertain',observation='Software fixture only',uncertainty='Not real speech assessment',practice_tip='Fixture teaching',start_seconds=0,end_seconds=1)]),'fixture-only',None,None
    monkeypatch.setattr(speech_coaching,'analyze_audio',analyze)
    async def run():
        engine=create_async_engine('sqlite+aiosqlite:///:memory:')
        async with engine.begin() as connection:await connection.run_sync(Base.metadata.create_all)
        factory=async_sessionmaker(engine,expire_on_commit=False)
        async def database():
            async with factory() as db:yield db
        app=FastAPI();app.include_router(auth_router,prefix='/auth');app.include_router(learners_router);app.include_router(translation_router.router)
        app.dependency_overrides[get_db]=database
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app),base_url='http://test') as client:
                users=[];headers=[]
                for name in ['owner','outsider']:
                    response=await client.post('/auth/register',json={'name':name,'email':f'{name}-{uuid.uuid4().hex}@example.com','password':'isolated-password-only'})
                    assert response.status_code==200,response.text
                    users.append(uuid.UUID(response.json()['user']['id']));headers.append({'Authorization':'Bearer '+response.json()['access_token']})
                response=await client.post('/learners',headers=headers[0],json={'display_name':'Software fixture','age':21,'relationship':'self','language':'en','consent':{'practice_allowed':True,'cloud_processing_allowed':True,'retain_audio_allowed':True,'policy_version':'2026-10-14-v1','authorized_to_consent':True}})
                learner=uuid.UUID(response.json()['id'])
                async with factory() as db:
                    original=SpeechRecording(learner_id=learner,submitted_by=users[0],attempt_id=uuid.uuid4(),language=language,task='conversation',expected_text='',transcript='ORIGINAL SOFTWARE RECOGNITION',words=[],duration_seconds=2,quality={},audio_sha256='1'*64,storage_key='fixture')
                    db.add(original);await db.flush()
                    translation=MessageTranslation(learner_id=learner,recording_id=original.id,request_id=uuid.uuid4(),proposed_by=users[0],candidates=[message],provenance={'language':language,'source':'software_fixture'})
                    db.add(translation);await db.commit();identifier=translation.id;record_id=original.id
                path=f'/translations/{identifier}'
                assert (await client.post(path+'/practice-feedback',headers=headers[0],json={})).status_code==409
                response=await client.post(path+'/confirm',headers=headers[0],json={'text':message,'confirms_intended_message':True})
                assert response.status_code==200,response.text
                assert (await client.post(path+'/practice-feedback',headers=headers[1],json={})).status_code==404
                response=await client.post(path+'/practice-feedback',headers=headers[0],json={})
                assert response.status_code==200,response.text
                assert response.json()['suggested_words']==[word] and word in response.json()['available_words']
                assert calls[0]['expected_text']==message and calls[0]['confirmed_intended_message']
                assert (await client.post(path+'/practice-feedback',headers=headers[0],json={})).json()['id']==response.json()['id']
                assert len(calls)==1
                assert (await client.post(path+'/practice-words',headers=headers[0],json={'word':'not-in-this-message'})).status_code==422
                async with factory() as db:
                    approved=LearningDemonstration(learner_id=learner,author_id=users[0],target=word,storage_key='approved-fixture',media_type='video/webm',status='clinician_approved')
                    rejected=LearningDemonstration(learner_id=learner,author_id=users[0],target=word,storage_key='rejected-fixture',media_type='video/webm',status='needs_revision')
                    db.add_all([approved,rejected]);await db.commit();approved_id=str(approved.id)
                target=await client.post(path+'/practice-words',headers=headers[0],json={'word':word})
                assert target.status_code==200 and target.json()['language']==language
                assert target.json()['sentence']==message
                assert target.json()['target_sound']=='m'
                assert target.json()['demonstration']['id']==approved_id
                # Navigation/self-report is durable, idempotent and never establishes correctness.
                event_payload={'request_id':str(uuid.uuid4()),'word':word,'phase':'word','action':'ready','source_proposal_id':response.json()['id'],'self_check':'ready'}
                # This fixture has uncertain acoustic evidence: no corrective tongue prompt is allowed.
                assert (await client.post(path+'/correction-events',headers=headers[0],json=event_payload)).status_code==422
                async with factory() as db:
                    proposal=await db.get(AcousticProposal,uuid.UUID(response.json()['id']))
                    proposal.content={**proposal.content,'concerns':[{**proposal.content['concerns'][0],'category':'substitution','produced_phone':'b'}]}
                    await db.commit()
                assert (await client.post(path+'/correction-events',headers=headers[1],json=event_payload)).status_code==404
                ready=await client.post(path+'/correction-events',headers=headers[0],json=event_payload)
                assert ready.status_code==200,ready.text
                assert (await client.post(path+'/correction-events',headers=headers[0],json=event_payload)).json()==ready.json()
                assert (await client.post(path+'/correction-events',headers=headers[0],json={**event_payload,'action':'skip'})).status_code==409
                assert 'correctness' in ready.json()['interpretation']
                saved=(await client.get(f'/learners/{learner}/message-practice',headers=headers[0])).json()
                assert saved[0]['words'][0]['word']==word
                assert (await client.get(f'/learners/{learner}/message-practice',headers=headers[1])).status_code==404
                async with factory() as db:
                    attempt=SpeechRecording(learner_id=learner,submitted_by=users[0],attempt_id=uuid.uuid4(),language=language,task='word',expected_text=word,transcript=word,words=[],duration_seconds=2,quality={},audio_sha256='2'*64,storage_key='fixture')
                    db.add(attempt);await db.commit();attempt_id=attempt.id
                payload={'recording_id':str(attempt_id),'word':word,'phase':'word','correction_event_id':ready.json()['id']}
                assert (await client.post(path+'/practice-attempts',headers=headers[1],json=payload)).status_code==404
                result=await client.post(path+'/practice-attempts',headers=headers[0],json=payload)
                assert result.status_code==200,result.text
                assert result.json()['content']['correction_self_check']['id']==ready.json()['id']
                assert (await client.post(path+'/practice-attempts',headers=headers[0],json=payload)).json()['id']==result.json()['id']
                assert (await client.post(path+'/practice-attempts',headers=headers[0],json={**payload,'correction_event_id':None})).status_code==409
                skipped=await client.post(path+'/correction-events',headers=headers[0],json={'request_id':str(uuid.uuid4()),'word':word,'phase':'word','action':'skip'})
                assert skipped.status_code==200 and skipped.json()['action']=='skip'
                assert len(calls)==2
                assert calls[-1]['target_sound']=='m'
                assert (await client.post(path+'/practice-attempts',headers=headers[0],json={**payload,'phase':'sentence'})).status_code==422
                async with factory() as db:
                    attempt=SpeechRecording(learner_id=learner,submitted_by=users[0],attempt_id=uuid.uuid4(),language=language,task='sentence',expected_text=message,transcript=message,words=[],duration_seconds=2,quality={},audio_sha256='3'*64,storage_key='fixture')
                    db.add(attempt);await db.commit();sentence_id=attempt.id
                result=await client.post(path+'/practice-attempts',headers=headers[0],json={'recording_id':str(sentence_id),'word':word,'phase':'sentence'})
                assert result.status_code==200,result.text
                assert calls[-1]['focus_word']==word
                assert len((await client.get(path+'/practice-attempts',headers=headers[0])).json())==3
                async with factory() as db:
                    original=await db.get(SpeechRecording,record_id)
                    assert original.expected_text=='' and original.transcript=='ORIGINAL SOFTWARE RECOGNITION'
                    proposals=(await db.execute(select(AcousticProposal))).scalars().all()
                    assert all(row.request['confirmed_translation_id']==str(identifier) for row in proposals)
        finally:await engine.dispose()
    asyncio.run(run())
