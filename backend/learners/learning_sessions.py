"""Authorised, idempotent story/listening evidence shared with care reports."""
import secrets,uuid
from datetime import datetime,timezone
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field,model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth.dependencies import get_current_user
from models.user import User
from models.care import SpeechRecording
from models.learning import LearningSession
from learners.access import accessible_learner,lock_learner,require_practice_consent
from learners.learning_adventures import Adventure,checked_adventure

router=APIRouter(tags=['maya-learning-evidence'])
PAIRS={'k-t':['key','tea'],'r-w':['ring','wing'],'s-sh':['sip','ship'],'f-p':['fan','pan'],'s-th':['sink','think'],'g-b':['goat','boat']}

class StartLearning(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_id:uuid.UUID
    kind:Literal['story','listening','model']
    target:str=Field(default='',max_length=120)
    pair_id:Literal['k-t','r-w','s-sh','f-p','s-th','g-b']|None=None
    story:Adventure|None=None
    lesson_version:int=Field(default=1,ge=1,le=2)
    language:Literal['en','ml','hi']='en'
    personalized:bool=False
    feature:Literal['wordy']|None=None
    practice_words:list[str]=Field(default_factory=list,max_length=3)

    @model_validator(mode='after')
    def validate_kind(self):
        if self.kind=='story':
            if not self.story or not self.target:raise ValueError('A story needs its selected target and three scenes')
            checked_adventure(self.story.model_dump(),self.target,self.practice_words)
        elif self.kind=='listening' and not self.pair_id and not (self.personalized and self.target):raise ValueError('Choose a listening contrast')
        elif self.kind=='model' and not self.target.strip():raise ValueError('Choose a model target')
        return self

def summary(row):
    answers=[event for event in row.events if event['action']=='answer']
    return {'id':str(row.id),'kind':row.kind,'target':row.target,'content':row.content,
        'position':row.position,'status':row.status,'created_at':row.created_at.isoformat(),
        'events':row.events,'completed':row.status=='completed',
        'listening':{'correct':sum(event.get('matched',False) for event in answers),'total':len(answers),**({'independent_correct':sum(bool(event.get('matched')) and not event.get('help_used',False) for event in answers),'supported_choices':sum(bool(event.get('help_used')) for event in answers)} if row.content.get('start_request',{}).get('lesson_version',1)==2 else {})},
        'completion_is_mastery':False,'pronunciation_score':None}

@router.post('/learners/{learner_id}/learning-sessions',status_code=201)
async def start(learner_id:uuid.UUID,payload:StartLearning,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await lock_learner(db,user,learner_id,owner_only=True)
    await require_practice_consent(db,learner_id)
    existing=await db.get(LearningSession,payload.request_id)
    if existing:
        if existing.learner_id!=learner_id:raise HTTPException(404,'Activity not found')
        # Old saved storyboards predate optional shot lists. Normalise defaults
        # before comparing so a retried start remains idempotent after an upgrade.
        stored=existing.content.get('start_request') or {}
        try:stored=StartLearning.model_validate({**stored,'request_id':existing.id}).model_dump(mode='json',exclude={'request_id'})
        except ValueError:stored=None
        if stored!=payload.model_dump(mode='json',exclude={'request_id'}):raise HTTPException(409,'Request ID already belongs to another activity')
        return summary(existing)
    content={'start_request':payload.model_dump(mode='json',exclude={'request_id'})}
    from learners.personal_learning import plan
    personal=await plan(db,learner_id,payload.language)
    selected=next((item for item in personal['targets'] if item['word'].casefold()==payload.target.casefold() and not item.get('requires_confirmation')),None)
    if selected:content['personal_target']=selected
    if payload.personalized and not selected:raise HTTPException(409,'Refresh the personal practice plan; this target is no longer available')
    if payload.personalized and any(word.casefold() not in {item['word'].casefold() for item in personal['targets'] if not item.get('requires_confirmation')} for word in payload.practice_words):raise HTTPException(409,'Refresh your personal story words; a target is no longer active')
    if payload.kind=='story':content.update(payload.story.model_dump())
    elif payload.kind=='model':content.update(target=payload.target.strip(),lesson_version=payload.lesson_version)
    else:
        order=[0,1,0,1,0,1] if payload.lesson_version==2 else [0,1,0,1];secrets.SystemRandom().shuffle(order)
        if payload.personalized:
            contrast=selected.get('listening')
            if not contrast:raise HTTPException(422,'No supported listening contrast is available for this target; use a demonstration instead')
            content.update(pair_id='personal',words=contrast['words'],contrast=contrast,rounds=order)
        else:content.update(pair_id=payload.pair_id,words=PAIRS[payload.pair_id],rounds=order)
    row=LearningSession(id=payload.request_id,learner_id=learner_id,started_by=user.id,
        kind=payload.kind,target=payload.target if payload.kind in ['story','model'] or payload.personalized else ' / '.join(PAIRS[payload.pair_id]),content=content,events=[])
    db.add(row);await db.commit();return summary(row)

@router.get('/learners/{learner_id}/learning-sessions')
async def history(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id);await require_practice_consent(db,learner_id)
    rows=(await db.execute(select(LearningSession).where(LearningSession.learner_id==learner_id)
        .order_by(LearningSession.updated_at.desc()).limit(30))).scalars().all()
    return [summary(row) for row in rows]

@router.get('/learning-sessions/{session_id}')
async def resume(session_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row=await db.get(LearningSession,session_id)
    if not row:raise HTTPException(404,'Activity not found')
    await accessible_learner(db,user,row.learner_id);await require_practice_consent(db,row.learner_id)
    return summary(row)

class LearningEvent(BaseModel):
    model_config=ConfigDict(extra='forbid')
    request_id:uuid.UUID
    action:Literal['answer','scene','skip','pause','resume','finish','familiarized','model_watch','model_together','model_complete','practice_attempt']
    index:int=Field(default=0,ge=0,le=12)
    replays:int=Field(default=0,ge=0,le=30)
    help_used:bool=False
    segment_start:float=Field(default=0,ge=0,le=60)
    segment_end:float|None=Field(default=None,gt=0,le=60)
    repetitions:int=Field(default=1,ge=1,le=3)
    slow:bool=False
    expected_text:str=Field(default='',max_length=300)
    phase:Literal['word','sentence']='word'
    demonstration_id:uuid.UUID|None=None
    model_source:Literal['maya','local_family','shared_family','clinician']='maya'
    choice:int|None=Field(default=None,ge=0,le=1)
    recording_id:uuid.UUID|None=None

@router.post('/learning-sessions/{session_id}/events')
async def event(session_id:uuid.UUID,payload:LearningEvent,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row=(await db.execute(select(LearningSession).where(LearningSession.id==session_id).with_for_update())).scalar_one_or_none()
    if not row:raise HTTPException(404,'Activity not found')
    await accessible_learner(db,user,row.learner_id,owner_only=True);await require_practice_consent(db,row.learner_id)
    if payload.segment_end is not None and payload.segment_start>=payload.segment_end:raise HTTPException(422,'The example segment must end after it starts')
    data=payload.model_dump(mode='json');previous=next((item for item in row.events if item['request_id']==str(payload.request_id)),None)
    if previous:
        if any(previous.get(key,LearningEvent.model_fields[key].default)!=value for key,value in data.items()):raise HTTPException(409,'Request ID already used for another response')
        return summary(row)
    if row.status=='finished' or (row.status=='completed' and payload.action!='practice_attempt'):raise HTTPException(409,'This activity has ended')
    if len(row.events)>=100:raise HTTPException(409,'Finish this activity and start a new one')
    if payload.action in ['familiarized','model_watch','model_together','model_complete','practice_attempt']:
        if payload.action=='familiarized' and row.kind!='listening':raise HTTPException(422,'Picture familiarisation belongs to a listening lesson')
        if row.kind not in ['listening','model']:raise HTTPException(422,'This action belongs to a listening or model lesson')
        if payload.action.startswith('model_') and row.kind!='model':raise HTTPException(422,'Use a model lesson')
        if row.status=='paused':raise HTTPException(409,'Resume this lesson first')
        if payload.demonstration_id:
            from models.learning import LearningDemonstration
            demo=await db.get(LearningDemonstration,payload.demonstration_id)
            if not demo or demo.learner_id!=row.learner_id or demo.status=='needs_revision':raise HTTPException(422,'Choose an available example for this learner')
            if demo.target.casefold()!=row.target.casefold():raise HTTPException(422,'Example must match the lesson target')
            data['verified_model_source']='clinician' if demo.status.startswith('clinician') else 'shared_family'
        elif payload.model_source in ['clinician','shared_family']:raise HTTPException(422,'A shared example identifier is required')
        if payload.action=='practice_attempt':
            record=await db.get(SpeechRecording,payload.recording_id) if payload.recording_id else None
            if not record or record.learner_id!=row.learner_id:raise HTTPException(404,'Recording not found')
            created=record.created_at.replace(tzinfo=timezone.utc) if not record.created_at.tzinfo else record.created_at
            began=row.created_at.replace(tzinfo=timezone.utc) if not row.created_at.tzinfo else row.created_at
            target=payload.expected_text.strip()
            words=row.content.get('words',[]) if row.kind=='listening' else [row.target]
            if row.kind=='listening' and row.content.get('personal_target'):words=[row.target,*words]
            import re
            if not target or not any(re.search(r'(?<!\w)'+re.escape(word)+r'(?!\w)',target,re.I) for word in words):raise HTTPException(422,'Use a target from this lesson')
            if record.language!=row.content.get('start_request',{}).get('language','en') or record.task!=payload.phase or record.expected_text!=target or created<began:raise HTTPException(422,'Use a fresh recording in the lesson language for this step')
            if any(event.get('recording_id')==str(record.id) for event in row.events):raise HTTPException(409,'This attempt is already saved; record a fresh retry')
            bound=record.quality.get('learning_lesson_id')
            if bound and bound!=str(row.id):raise HTTPException(409,'Recording is already linked to another lesson')
            record.quality={**record.quality,'learning_lesson_id':str(row.id),'learning_model_source':data.get('verified_model_source',data['model_source'])}
            data['evidence_source']='fresh_recording'
        elif payload.action=='model_complete':row.status='completed'
        else:data['evidence_source']='learner_reported_playback_or_familiarisation'
    elif payload.action in ['answer','scene','skip']:
        if row.kind=='model':raise HTTPException(422,'Use the model lesson controls')
        if row.status!='active' or payload.index!=row.position:raise HTTPException(409,'Resume and answer the current activity step')
        if row.kind=='listening':
            if payload.action!='answer' or payload.choice is None:raise HTTPException(422,'Choose the picture you heard')
            if row.content.get('start_request',{}).get('lesson_version',1)==2 and not any(event['action']=='familiarized' for event in row.events):raise HTTPException(409,'Meet the pictures before the listening round')
            data['help_used']=payload.help_used or payload.replays>1
            expected=row.content['rounds'][row.position]
            data.update(matched=payload.choice==expected,expected_word=row.content['words'][expected],chosen_word=row.content['words'][payload.choice])
        else:
            if payload.action=='answer':raise HTTPException(422,'Use the story controls')
            if payload.action=='scene':
                record=await db.get(SpeechRecording,payload.recording_id) if payload.recording_id else None
                if not record or record.learner_id!=row.learner_id:raise HTTPException(404,'Recording not found')
                if record.expected_text!=row.content['scenes'][row.position]['sentence']:raise HTTPException(422,'Recording must match this scene')
                if record.language!=row.content.get('start_request',{}).get('language','en'):raise HTTPException(422,'Recording must use the story language')
                data['evidence_source']='saved_recording'
            else:data['evidence_source']='explicit_skip'
        row.position+=1
        if row.position==(len(row.content['rounds']) if row.kind=='listening' else 3):row.status='completed'
    elif payload.action=='pause':row.status='paused'
    elif payload.action=='resume':row.status='active'
    elif payload.action=='finish':row.status='finished'
    row.events=[*row.events,{**data,'created_at':datetime.now(timezone.utc).isoformat()}]
    row.updated_at=datetime.now(timezone.utc);await db.commit();return summary(row)
