"""Practice confirmed communication in place; keep original recognition immutable."""
import re,uuid,unicodedata
from datetime import timezone,datetime
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import SpeechRecording,AcousticProposal,CareGoal
from models.speech_workflow import MessageTranslation
from models.learning import LearningDemonstration
from learners.access import accessible_learner,lock_learner,require_practice_consent

router=APIRouter(tags=['message-word-practice'])


def message_words(text):
    words=[];seen=set();current=''
    for char in unicodedata.normalize('NFC',text or '')+' ':
        if unicodedata.category(char)[0] in 'LM' or char in "'’\u200c\u200d":current+=char
        elif current:
            word=current.strip("'’\u200c\u200d")
            if word and word.casefold() not in seen:words.append(word);seen.add(word.casefold())
            current=''
    return words


def word_in_message(text,word):
    return next((item for item in message_words(text) if item.casefold()==word.casefold()),None)


def practice_sentence(text,word):
    for sentence in re.split(r'(?<=[.!?।])\s+',text):
        if word_in_message(sentence,word) and len(sentence)<=300:return sentence
    return word  # Long messages still allow a bounded word attempt.

def prioritize_supported_words(words,goals,recurring):
    reviewed={goal.practice_word.casefold() for goal in goals}
    repeated={item['word'].casefold():len(item.get('recording_ids',[])) for item in recurring}
    # Rank only words supported by this recording; a goal/history never invents
    # an error in the current message, and complexity/spelling add no weight.
    return sorted(words,key=lambda word:(word.casefold() not in reviewed,-repeated.get(word.casefold(),0)))


async def confirmed_message(db,user,identifier,lock=False):
    query=select(MessageTranslation).where(MessageTranslation.id==identifier)
    item=(await db.execute(query.with_for_update() if lock else query)).scalar_one_or_none()
    if not item:raise HTTPException(404,'Message not found')
    await accessible_learner(db,user,item.learner_id,owner_only=True)
    await require_practice_consent(db,item.learner_id)
    if not item.confirmed_text:raise HTTPException(409,'Confirm your intended message before practising it')
    return item


@router.post('/translations/{translation_id}/practice-feedback')
async def analyze_message(translation_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    item=await confirmed_message(db,user,translation_id)
    intended=item.confirmed_text
    learner_id=item.learner_id;language=item.provenance['language']
    from learners.speech_coaching import coach,CoachingRequest
    result=await coach(item.recording_id,CoachingRequest(mode='listen_then_say',allow_model_audio=True,confirmed_translation_id=item.id),user,db)
    # Only actual acoustic suggestions become suggested difficulties. Text corrections alone do not.
    words=[]
    for concern in result['content'].get('concerns',[]):
        word=word_in_message(intended,concern['word'])
        if word and word.casefold() not in {item.casefold() for item in words}:words.append(word)
    if len(words)>1:
        goals=(await db.execute(select(CareGoal).where(CareGoal.learner_id==learner_id,CareGoal.active.is_(True),CareGoal.language==language))).scalars().all()
        from learners.learning_target_policy import suggested_targets
        recurring=await suggested_targets(db,learner_id,language)
        words=prioritize_supported_words(words,goals,recurring)
    return {**result,'suggested_words':words[:3],'primary_target':words[0] if words else None,
        'target_selection':'current_audio_support_then_reviewed_goal_then_recurrence',
        'available_words':message_words(intended)[:80]}


class SelectWord(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    word:str=Field(min_length=1,max_length=100)


@router.post('/translations/{translation_id}/practice-words')
async def select_word(translation_id:uuid.UUID,payload:SelectWord,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    item=await confirmed_message(db,user,translation_id,lock=True)
    await lock_learner(db,user,item.learner_id,owner_only=True)
    await require_practice_consent(db,item.learner_id)
    word=word_in_message(item.confirmed_text,payload.word)
    if not word:raise HTTPException(422,'Choose a word from your confirmed message')
    words=item.provenance.get('practice_words',[])
    latest=(await db.execute(select(AcousticProposal).where(AcousticProposal.recording_id==item.recording_id,
        AcousticProposal.request['confirmed_translation_id'].as_string()==str(item.id)).order_by(AcousticProposal.created_at.desc()).limit(1))).scalar_one_or_none()
    sound=next((concern.get('expected_phone') for concern in latest.content.get('concerns',[]) if concern['word'].casefold()==word.casefold()),None) if latest and latest.decision!='rejected' else None
    if not any(target['word']==word for target in words):
        if len(words)>=20:raise HTTPException(422,'This message already has twenty saved practice words')
        words=[*words,{'word':word,'source':'practice_from_confirmed_message','target_sound':sound}]
    else:words=[{**target,'target_sound':target.get('target_sound') or sound} if target['word']==word else target for target in words]
    item.provenance={**item.provenance,'practice_words':words}
    demo=(await db.execute(select(LearningDemonstration).where(LearningDemonstration.learner_id==item.learner_id,
        func.lower(LearningDemonstration.target)==word.casefold(),LearningDemonstration.status.in_(['clinician_authored','clinician_approved']))
        .order_by(LearningDemonstration.created_at.desc()).limit(1))).scalar_one_or_none()
    await db.commit()
    return {'word':word,'sentence':practice_sentence(item.confirmed_text,word),'language':item.provenance['language'],'practice_words':words,'target_sound':next(target.get('target_sound') for target in words if target['word']==word),
        'demonstration':{'id':str(demo.id),'target':demo.target,'media_type':demo.media_type,'status':demo.status} if demo else None}


class CorrectionEvent(SelectWord):
    request_id:uuid.UUID
    phase:Literal['word','sentence']='word'
    action:Literal['ready','show_again','not_sure','skip','finish','sentence_yes','sentence_no']
    source_proposal_id:uuid.UUID|None=None
    self_check:Literal['ready','yes','not_sure']|None=None


@router.post('/translations/{translation_id}/correction-events')
async def correction_event(translation_id:uuid.UUID,payload:CorrectionEvent,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    item=await confirmed_message(db,user,translation_id,lock=True)
    word=word_in_message(item.confirmed_text,payload.word)
    if not word or not any(target['word']==word for target in item.provenance.get('practice_words',[])):
        raise HTTPException(422,'Select this word for practice first')
    events=item.provenance.get('correction_events',[])
    previous=next((event for event in events if event['id']==str(payload.request_id)),None)
    values={'word':word,'phase':payload.phase,'action':payload.action,'source_proposal_id':str(payload.source_proposal_id) if payload.source_proposal_id else None,'self_check':payload.self_check}
    if previous:
        if any(previous.get(key)!=value for key,value in values.items()):raise HTTPException(409,'This event identifier already belongs to another action')
        return previous
    if len(events)>=300:raise HTTPException(422,'Start another message to continue practice')
    if payload.action in ['ready','show_again','not_sure']:
        proposal=await db.get(AcousticProposal,payload.source_proposal_id) if payload.source_proposal_id else None
        from learners.correction_policy import supported_target
        if not proposal or proposal.request.get('confirmed_translation_id')!=str(item.id) or proposal.decision=='rejected' or not supported_target(proposal.content,word):
            raise HTTPException(422,'A current audio-supported target is required for corrective self-checks')
    event={'id':str(payload.request_id),**values,'created_at':datetime.now(timezone.utc).isoformat(),'interpretation':'Learner self-report or navigation only; never pronunciation correctness'}
    item.provenance={**item.provenance,'correction_events':[*events,event]}
    await db.commit()
    return event


class PracticeAttempt(SelectWord):
    recording_id:uuid.UUID
    phase:str=Field(pattern='^(word|sentence)$')
    preceding_cue:str=Field(default='',max_length=500)
    correction_event_id:uuid.UUID|None=None


@router.post('/translations/{translation_id}/practice-attempts')
async def practice_attempt(translation_id:uuid.UUID,payload:PracticeAttempt,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    item=await confirmed_message(db,user,translation_id,lock=True)
    word=word_in_message(item.confirmed_text,payload.word)
    if not word or not any(target['word']==word for target in item.provenance.get('practice_words',[])):
        raise HTTPException(422,'Select this word for practice first')
    recording=(await db.execute(select(SpeechRecording).where(SpeechRecording.id==payload.recording_id).with_for_update())).scalar_one_or_none()
    if not recording or recording.learner_id!=item.learner_id:raise HTTPException(404,'Recording not found')
    expected=word if payload.phase=='word' else practice_sentence(item.confirmed_text,word)
    binding={'translation_id':str(item.id),'word':word,'phase':payload.phase}
    if payload.correction_event_id:
        event=next((event for event in item.provenance.get('correction_events',[]) if event['id']==str(payload.correction_event_id)),None)
        if not event or event['word']!=word or event['phase']!=payload.phase or event['action']!='ready':raise HTTPException(422,'Use a matching ready self-check before this attempt')
        used=(await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id==item.learner_id,SpeechRecording.quality['translation_practice']['correction_event']['id'].as_string()==str(payload.correction_event_id),SpeechRecording.id!=payload.recording_id))).scalars().first()
        if used:raise HTTPException(409,'Record a new self-check for each retry')
        binding['correction_event']=event
    if payload.preceding_cue.strip():binding['preceding_cue']=payload.preceding_cue.strip()
    selected=next(target for target in item.provenance['practice_words'] if target['word']==word)
    if selected.get('target_sound'):binding['target_sound']=selected['target_sound']
    created=recording.created_at.replace(tzinfo=timezone.utc) if not recording.created_at.tzinfo else recording.created_at
    confirmed=item.confirmed_at.replace(tzinfo=timezone.utc) if not item.confirmed_at.tzinfo else item.confirmed_at
    if payload.correction_event_id and created<datetime.fromisoformat(binding['correction_event']['created_at']):raise HTTPException(422,'Record after the self-check')
    if recording.id==item.recording_id or created<confirmed or recording.language!=item.provenance['language'] or recording.expected_text!=expected or recording.task!=payload.phase:
        raise HTTPException(422,'Record a fresh attempt for this word, phase and language')
    existing=recording.quality.get('translation_practice')
    if existing and existing.get('correction_event',{}).get('id')!=binding.get('correction_event',{}).get('id'):raise HTTPException(409,'This recording already has a different self-check binding')
    if existing and any(existing.get(key)!=binding[key] for key in ['translation_id','word','phase']):raise HTTPException(409,'This recording belongs to another practice step')
    if recording.quality.get('maya_call_id') or recording.quality.get('voice_game'):raise HTTPException(409,'Use a fresh message-practice recording')
    recording.quality={**recording.quality,'translation_practice':existing or binding}
    await db.commit()
    from learners.speech_coaching import coach,CoachingRequest
    result=await coach(recording.id,CoachingRequest(mode='listen_then_say',allow_model_audio=True),user,db)
    return {**result,'word':word,'phase':payload.phase}


@router.get('/learners/{learner_id}/message-practice')
async def saved_practice(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id,owner_only=True)
    await require_practice_consent(db,learner_id)
    rows=(await db.execute(select(MessageTranslation).where(MessageTranslation.learner_id==learner_id,MessageTranslation.confirmed_text.is_not(None),MessageTranslation.provenance['practice_words'].as_string().is_not(None)).order_by(MessageTranslation.created_at.desc()).limit(30))).scalars().all()
    return [{'translation_id':str(row.id),'language':row.provenance['language'],'words':row.provenance['practice_words']} for row in rows if row.provenance.get('practice_words')]


@router.get('/translations/{translation_id}/practice-attempts')
async def saved_attempts(translation_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    item=await confirmed_message(db,user,translation_id)
    rows=(await db.execute(select(AcousticProposal).join(SpeechRecording,SpeechRecording.id==AcousticProposal.recording_id).where(SpeechRecording.learner_id==item.learner_id,AcousticProposal.request['confirmed_translation_id'].as_string()==str(item.id)).order_by(AcousticProposal.created_at.desc()).limit(20))).scalars().all()
    from learners.speech_coaching import public
    return [public(row,item.provenance['language']) for row in rows]
