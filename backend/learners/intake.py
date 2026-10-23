"""Non-diagnostic first-conversation evidence and daily practice, without a clinician gate."""
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.guided_practice import GuidedPracticeSession
from models.care import SpeechRecording, AcousticProposal, CareGoal
from learners.access import accessible_learner, lock_learner, require_practice_consent, is_clinician
from knowledge_graph.workflow import queue_workflow

router=APIRouter(tags=['maya-first-conversation'])
WORDS={'en':['water','sun','rainbow'],'hi':['पानी','सूरज','किताब'],'ml':['വെള്ളം','മരം','മഴവില്ല്']}
SENTENCES={'en':['I like to play.','Today I read a story.'],'hi':['मुझे खेलना पसंद है।','आज मैंने एक कहानी पढ़ी।'],'ml':['എനിക്ക് കളിക്കാൻ ഇഷ്ടമാണ്.','ഇന്ന് ഞാൻ ഒരു കഥ വായിച്ചു.']}
OPEN={'en':['Tell me about something you enjoy.','Tell me about one moment from your day.'],
'hi':['अपनी पसंद की किसी चीज़ के बारे में बताइए।','आज के दिन की कोई एक बात बताइए।'],
'ml':['നിങ്ങൾക്ക് ഇഷ്ടമുള്ള ഒരു കാര്യത്തെക്കുറിച്ച് പറയാമോ?','ഇന്ന് നടന്ന ഒരു കാര്യം പറയാമോ?']}
REPEAT={'en':'Listen, then try saying: ','hi':'सुनिए, फिर कहने की कोशिश कीजिए: ','ml':'കേൾക്കൂ, പിന്നെ പറയാൻ ശ്രമിക്കൂ: '}
STUDENT_WORDS={'en':['responsibility','communication','opportunity'],
 'hi':['ज़िम्मेदारी','प्रस्तुतीकरण','आत्मविश्वास'],
 'ml':['ഉത്തരവാദിത്തം','ആശയവിനിമയം','അവസരങ്ങൾ']}
STUDENT_SENTENCES={
 'en':['I would like to explain the reasoning behind my project proposal.','Could you clarify the assessment criteria before I present my findings?'],
 'hi':['मैं अपने प्रोजेक्ट के प्रस्ताव के पीछे का तर्क समझाना चाहता हूँ।','अपने निष्कर्ष प्रस्तुत करने से पहले मैं मूल्यांकन के मानदंड स्पष्ट करना चाहूँगा।'],
 'ml':['എന്റെ പ്രോജക്ടിലെ തീരുമാനങ്ങൾക്ക് പിന്നിലെ കാരണങ്ങൾ വിശദീകരിക്കാൻ ഞാൻ ആഗ്രഹിക്കുന്നു.','എന്റെ കണ്ടെത്തലുകൾ അവതരിപ്പിക്കുന്നതിന് മുമ്പ് വിലയിരുത്തലിന്റെ മാനദണ്ഡങ്ങൾ വ്യക്തമാക്കാമോ?']}
STUDENT_OPEN={
 'en':['Introduce yourself for an internship interview. Mention one skill and an example of using it.','Explain a project or subject you know well: the problem, your approach and one result.','Your team disagrees about a deadline. Explain your view and suggest a practical compromise.'],
 'hi':['इंटर्नशिप के इंटरव्यू में अपना परिचय दीजिए। अपना एक कौशल और उसके उपयोग का उदाहरण बताइए।','अपने किसी प्रोजेक्ट या विषय की समस्या, अपना तरीका और एक परिणाम समझाइए।','आपकी टीम समय-सीमा पर सहमत नहीं है। अपना पक्ष रखिए और एक व्यावहारिक समझौता सुझाइए।'],
 'ml':['ഒരു ഇന്റേൺഷിപ്പ് അഭിമുഖത്തിനായി സ്വയം പരിചയപ്പെടുത്തൂ. ഒരു കഴിവും അത് ഉപയോഗിച്ച ഉദാഹരണവും പറയൂ.','നിങ്ങൾക്ക് പരിചിതമായ ഒരു പ്രോജക്ടിലെ പ്രശ്നം, സമീപനം, ഒരു ഫലം എന്നിവ വിശദീകരിക്കൂ.','സമയപരിധിയെക്കുറിച്ച് ടീമിൽ അഭിപ്രായവ്യത്യാസമുണ്ട്. നിങ്ങളുടെ നിലപാടും പ്രായോഗികമായ ഒരു പരിഹാരവും പറയൂ.']}
STUDENT_VERSION='maya-intake-v2-student'

def prompts(language,age):
 if age>=16:
  items=[{'id':f'word-{i}','task':'word','expected_text':word,'prompt':REPEAT[language]+word} for i,word in enumerate(STUDENT_WORDS[language])]
  items.extend({'id':'sentence' if i==0 else f'sentence-{i}','task':'sentence','expected_text':sentence,'prompt':REPEAT[language]+sentence} for i,sentence in enumerate(STUDENT_SENTENCES[language]))
  items.extend({'id':f'conversation-{i}','task':'conversation','expected_text':'','prompt':question} for i,question in enumerate(STUDENT_OPEN[language]))
  return items
 items=[{'id':f'word-{i}','task':'word','expected_text':word,'prompt':REPEAT[language]+word} for i,word in enumerate(WORDS[language])]
 sentence=SENTENCES[language][0 if age<10 else 1]
 items.append({'id':'sentence','task':'sentence','expected_text':sentence,'prompt':REPEAT[language]+sentence})
 items.extend({'id':f'conversation-{i}','task':'conversation','expected_text':'','prompt':question} for i,question in enumerate(OPEN[language]))
 return items

def upgrade_student_prompts(row,learner):
 # Preserve answered prompts and their recording bindings; replace only remaining work.
 if learner.age<16 or row.completed_at or row.content.get('version')==STUDENT_VERSION:return False
 answered={item['prompt_id'] for item in row.content['answers']}
 original={item['id']:item for item in row.content['prompts']}
 updated=[original[item['id']] if item['id'] in answered else item for item in prompts(row.language,learner.age)]
 row.content={**row.content,'version':STUDENT_VERSION,'age_band':'16+','prompts':updated}
 return True

def public(row):
 return {'id':str(row.id),'learner_id':str(row.learner_id),'language':row.language,'created_at':row.created_at.isoformat(),
 'completed_at':row.completed_at.isoformat() if row.completed_at else None,**row.content}

async def latest(db,learner_id):
 return (await db.execute(select(GuidedPracticeSession).where(GuidedPracticeSession.learner_id==learner_id,GuidedPracticeSession.kind=='intake').order_by(GuidedPracticeSession.created_at.desc()).limit(1))).scalar_one_or_none()

async def get_intake(db,user,identifier,owner=False):
 row=await db.get(GuidedPracticeSession,identifier)
 if not row or row.kind!='intake':raise HTTPException(404,'First conversation not found')
 learner=await lock_learner(db,user,row.learner_id,owner_only=owner)
 row=await db.get(GuidedPracticeSession,identifier,populate_existing=True)
 if learner.owner_id==user.id and upgrade_student_prompts(row,learner):await db.commit()
 return row

class Start(BaseModel):
 model_config=ConfigDict(extra='forbid')
 request_id:uuid.UUID

@router.get('/learners/{learner_id}/intake')
async def status(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 learner=await accessible_learner(db,user,learner_id)
 row=await latest(db,learner_id)
 if row and learner.owner_id==user.id and learner.age>=16 and not row.completed_at and row.content.get('version')!=STUDENT_VERSION:
  await lock_learner(db,user,learner_id,owner_only=True)
  row=await db.get(GuidedPracticeSession,row.id,populate_existing=True)
  if upgrade_student_prompts(row,learner):await db.commit()
 return public(row) if row else None

@router.post('/learners/{learner_id}/intake',status_code=201)
async def start(learner_id:uuid.UUID,payload:Start,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 learner=await lock_learner(db,user,learner_id,owner_only=True)
 consent=await require_practice_consent(db,learner_id)
 if not consent.cloud_processing_allowed or not consent.retain_audio_allowed:raise HTTPException(403,'Enable cloud speech and private audio retention in Family Hub to save the first conversation.')
 existing=await db.get(GuidedPracticeSession,payload.request_id)
 if existing:
  if existing.learner_id!=learner_id or existing.kind!='intake':raise HTTPException(409,'Request already used')
  if upgrade_student_prompts(existing,learner):await db.commit()
  return public(existing)
 row=await latest(db,learner_id)
 if row and not row.completed_at:
  if upgrade_student_prompts(row,learner):await db.commit()
  return public(row)
 row=GuidedPracticeSession(id=payload.request_id,learner_id=learner_id,created_by=user.id,kind='intake',language=learner.language,
 content={'state':'collecting','version':STUDENT_VERSION if learner.age>=16 else 'maya-intake-v1','age_band':'16+' if learner.age>=16 else 'under16','title':'Maya first conversation','prompts':prompts(learner.language,learner.age),'answers':[],
 'report':None,'plans':{},'reviews':[],'clinical_assessment':False})
 db.add(row);await db.commit();return public(row)

class Answer(BaseModel):
 model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
 prompt_id:str=Field(max_length=40)
 recording_id:uuid.UUID|None=None
 skip_reason:str=Field(default='',max_length=200)

@router.post('/intake/{identifier}/answers')
async def answer(identifier:uuid.UUID,payload:Answer,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 row=await get_intake(db,user,identifier,True)
 await require_practice_consent(db,row.learner_id)
 if row.completed_at:raise HTTPException(409,'This first conversation is complete')
 prompt=next((item for item in row.content['prompts'] if item['id']==payload.prompt_id),None)
 if not prompt:raise HTTPException(422,'Unknown prompt')
 saved=next((item for item in row.content['answers'] if item['prompt_id']==payload.prompt_id),None)
 if saved:
  if saved.get('recording_id')!=(str(payload.recording_id) if payload.recording_id else None):raise HTTPException(409,'Prompt already has a different answer')
  return public(row)
 if not payload.recording_id and not payload.skip_reason:raise HTTPException(422,'Record an answer or explain that this prompt was skipped')
 item={'prompt_id':payload.prompt_id,'recording_id':None,'skip_reason':payload.skip_reason,'saved_at':datetime.now(timezone.utc).isoformat()}
 if payload.recording_id:
  record=await db.get(SpeechRecording,payload.recording_id)
  if not record or record.learner_id!=row.learner_id:raise HTTPException(404,'Recording not found')
  if any(a.get('recording_id')==str(record.id) for a in row.content['answers']):raise HTTPException(409,'Use a separate attempt for each prompt')
  created=record.created_at.replace(tzinfo=timezone.utc) if record.created_at.tzinfo is None else record.created_at
  began=row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at
  if record.language!=row.language or record.expected_text!=prompt['expected_text'] or record.task!=prompt['task'] or created<began:raise HTTPException(422,'Use a fresh recording for this prompt and language')
  item['recording_id']=str(record.id)
  record.quality={**record.quality,'maya_intake_id':str(row.id),'maya_intake_prompt_id':prompt['id']}
  queue_workflow(db,row.learner_id,user.id,'recording',record.id,{'intake_id':str(row.id),'prompt_id':prompt['id'],'source':'first_conversation_recording_requires_human_review'})
 row.content={**row.content,'answers':[*row.content['answers'],item]};await db.commit();return public(row)

@router.post('/intake/{identifier}/complete')
async def complete(identifier:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 row=await get_intake(db,user,identifier,True)
 await require_practice_consent(db,row.learner_id)
 if row.completed_at:return public(row)
 if len(row.content['answers'])!=len(row.content['prompts']):raise HTTPException(409,'Finish or skip every prompt first')
 ids=[uuid.UUID(item['recording_id']) for item in row.content['answers'] if item.get('recording_id')]
 evidence=[]
 for identifier in ids:
  record=await db.get(SpeechRecording,identifier)
  proposals=(await db.execute(select(AcousticProposal).where(AcousticProposal.recording_id==identifier,AcousticProposal.decision!='rejected').order_by(AcousticProposal.created_at.desc()))).scalars().all()
  proposal=next((p for p in proposals if p.request.get('purpose')=='maya_coaching'),None)
  evidence.append({'recording_id':str(identifier),'expected_text':record.expected_text,'transcript':record.transcript,
   'quality':record.quality,'proposal_id':str(proposal.id) if proposal else None,'model':proposal.model if proposal else None})
 row.content={**row.content,'state':'reported','report':{'evidence':evidence,'recorded_prompts':len(ids),
 'skipped_prompts':len(row.content['answers'])-len(ids),'status':'awaiting_clinician_review',
 'scope':'introductory_sample_not_diagnosis_or_standardized_screening','clinical_assessment':False}}
 row.completed_at=datetime.now(timezone.utc);await db.commit();return public(row)

async def current_concerns(db,row):
 concerns=[]
 for item in (row.content.get('report') or {}).get('evidence',[]):
  proposal=await db.get(AcousticProposal,uuid.UUID(item['proposal_id'])) if item.get('proposal_id') else None
  if not proposal or proposal.decision=='rejected':continue
  for concern in proposal.content.get('concerns',[]):
   if not any(c['word']==concern['word'] for c in concerns):concerns.append({**concern,'recording_id':item['recording_id'],'proposal_id':str(proposal.id),'source':'unvalidated_audio_hypothesis'})
 return concerns

@router.get('/intake/{identifier}/report')
async def report(identifier:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 row=await get_intake(db,user,identifier)
 return {**public(row),'possible_practice_areas':await current_concerns(db,row)}

@router.post('/learners/{learner_id}/daily-plan')
async def daily_plan(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 learner=await lock_learner(db,user,learner_id,owner_only=True);await require_practice_consent(db,learner_id)
 row=await latest(db,learner_id)
 if not row or not row.completed_at:raise HTTPException(409,'Complete the first conversation before creating a daily plan')
 day=datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()
 goals=(await db.execute(select(CareGoal).where(CareGoal.learner_id==learner_id,CareGoal.active.is_(True),CareGoal.language==row.language).order_by(CareGoal.created_at.desc()).limit(2))).scalars().all()
 if day in row.content['plans']:
  existing=row.content['plans'][day]
  valid=(learner.age<16 or existing.get('age_band')=='16+') and {task.get('goal_id') for task in existing['tasks'] if task.get('goal_id')}=={str(goal.id) for goal in goals}
  for task in existing['tasks']:
   if task.get('proposal_id'):
    proposal=await db.get(AcousticProposal,uuid.UUID(task['proposal_id']))
    valid &= bool(proposal and proposal.decision!='rejected')
   if task.get('goal_id'):
    goal=await db.get(CareGoal,uuid.UUID(task['goal_id']))
    valid &= bool(goal and goal.active)
  if valid:return existing
  row.content={**row.content,'plan_history':[*row.content.get('plan_history',[])[-29:],existing]}

 tasks=[]
 for goal in goals:tasks.append({'id':str(uuid.uuid4()),'kind':'reviewed_goal','word':goal.practice_word,'instruction':goal.instruction,'goal_id':str(goal.id),'href':'/practice-hub','source':'clinician_authored_goal','completed_at':None})
 if not tasks:
  for concern in (await current_concerns(db,row))[:2]:tasks.append({'id':str(uuid.uuid4()),'kind':'optional_word_practice','word':concern['word'],'instruction':concern['practice_tip'],'recording_id':concern['recording_id'],'proposal_id':concern['proposal_id'],'href':'/companion?mode=listen_then_say','source':'unvalidated_audio_hypothesis','completed_at':None})
 words=STUDENT_WORDS if learner.age>=16 else WORDS
 questions=STUDENT_OPEN if learner.age>=16 else OPEN
 if not tasks:tasks.append({'id':str(uuid.uuid4()),'kind':'listen_and_repeat','word':words[row.language][int(day[-2:])%len(words[row.language])],'href':'/companion?mode=listen_then_say','source':'general_practice_no_error_inferred','completed_at':None})
 tasks.append({'id':str(uuid.uuid4()),'kind':'daily_conversation','word':'','instruction':questions[row.language][int(day[-2:])%len(questions[row.language])],'href':'/speaking-lab' if learner.age>=16 else '/companion?mode=daily_moment','source':'general_communication_practice','completed_at':None})
 plan={'date':day,'timezone':'Asia/Kolkata','intake_id':str(row.id),'age_band':'16+' if learner.age>=16 else 'under16','language':row.language,'tasks':tasks,'clinical_assessment':False}
 row.content={**row.content,'plans':{**dict(list(row.content['plans'].items())[-29:]),day:plan}};await db.commit();return plan

class Completion(BaseModel):
 model_config=ConfigDict(extra='forbid')
 task_id:uuid.UUID

@router.post('/learners/{learner_id}/daily-plan/complete')
async def complete_task(learner_id:uuid.UUID,payload:Completion,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 await lock_learner(db,user,learner_id,owner_only=True);await require_practice_consent(db,learner_id)
 row=await latest(db,learner_id)
 if not row:raise HTTPException(404,'Plan not found')
 day=datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()
 plan=deepcopy(row.content.get('plans',{}).get(day))
 if not plan:raise HTTPException(404,'Plan not found')
 task=next((t for t in plan['tasks'] if t['id']==str(payload.task_id)),None)
 if not task:raise HTTPException(404,'Task not found')
 task['completed_at']=task['completed_at'] or datetime.now(timezone.utc).isoformat();task['completion_source']='participant_report_not_speech_outcome'
 row.content={**row.content,'plans':{**row.content['plans'],day:plan}};await db.commit();return plan

class Review(BaseModel):
 model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
 note:str=Field(min_length=1,max_length=2000)

@router.post('/intake/{identifier}/review')
async def review(identifier:uuid.UUID,payload:Review,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
 row=await get_intake(db,user,identifier)
 if not await is_clinician(db,user.id):raise HTTPException(403,'Clinician review is required')
 if not row.completed_at:raise HTTPException(409,'First conversation is still in progress')
 event={'reviewer_id':str(user.id),'created_at':datetime.now(timezone.utc).isoformat(),'note':payload.note}
 row.content={**row.content,'reviews':[*row.content.get('reviews',[]),event],'report':{**row.content['report'],'status':'reviewed'},'plans':{},'plan_history':[*row.content.get('plan_history',[])[-29:],*row.content.get('plans',{}).values()]}
 await db.commit();return public(row)
