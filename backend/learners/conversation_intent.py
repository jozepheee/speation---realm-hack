"""Voice-confirmed meaning stays separate from original conversational audio."""
import re,uuid
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from sqlalchemy import select
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import SpeechRecording
from models.speech_workflow import LiveCall,CallRecording,MessageTranslation
from learners.access import accessible_learner,require_practice_consent

router=APIRouter(tags=['conversation-meaning-confirmation'])

def affirmative(text):
    value=re.sub(r'[^\w\s\u0d00-\u0d7f]',' ',text.casefold()).strip()
    if not value or len(value.split())>12:return False
    if re.search(r'\b(no|not|nope|wrong|actually|don[’\']?t)\b',value) or any(word in value for word in ['അല്ല','ഇല്ല','വേണ്ട']):return False
    return bool(re.match(r'^(yes|yeah|yep|yup|ha|haa|haan|athe|athae|aam|അതെ|അതെയാണ്|അതുതന്നെ|ഹാ|ആ|ആം|ശരി)(\s|$)',value))

class MeaningRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request_id:uuid.UUID
    recording_id:uuid.UUID
    expected_text:str=Field(min_length=1,max_length=300)
    heard_text:str=Field(min_length=1,max_length=2000)

class MeaningAnswer(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    response_text:str=Field(min_length=1,max_length=300)
    confirmation_recording_id:uuid.UUID

async def access(db,user,call_id,recording_id=None,active=False,lock=False):
    query=select(LiveCall).where(LiveCall.id==call_id)
    call=(await db.execute(query.with_for_update() if lock else query)).scalar_one_or_none()
    if not call:raise HTTPException(404,'Call not found')
    await accessible_learner(db,user,call.learner_id,owner_only=True)
    consent=await require_practice_consent(db,call.learner_id)
    if not consent.cloud_processing_allowed or not consent.retain_audio_allowed:raise HTTPException(403,'Audio processing and retention permission are required')
    if call.mode not in ['conversation','daily_moment']:raise HTTPException(409,'Meaning confirmation belongs to Daily conversation')
    if active and call.status not in ['prepared','connected']:raise HTTPException(409,'Call is no longer active')
    record=None
    if recording_id:
        record=await db.get(SpeechRecording,recording_id,populate_existing=True)
        if not record or record.learner_id!=call.learner_id or record.language!=call.language or not await db.get(CallRecording,(call_id,recording_id)):
            raise HTTPException(404,'Audio turn not found in this call')
        if not record.storage_key:raise HTTPException(409,'Original audio was not retained')
    return call,record

def public(item):
    return {'id':str(item.id),'recording_id':str(item.recording_id),'candidate':item.candidates[0],
        'confirmed_text':item.confirmed_text,'confirmation_source':item.provenance.get('confirmation_source'),
        'state':'confirmed' if item.confirmed_text else item.provenance.get('state','proposed'),
        'question':('നിങ്ങൾ പറഞ്ഞത് “'+item.candidates[0]+'” എന്നാണോ?' if item.provenance['language']=='ml' else 'Did you mean, “'+item.candidates[0]+'”?')}

@router.post('/live-calls/{call_id}/meaning-proposals')
async def propose(call_id:uuid.UUID,payload:MeaningRequest,user:User=Depends(get_current_user),db=Depends(get_db)):
    call,record=await access(db,user,call_id,payload.recording_id,active=True,lock=True)
    existing=(await db.execute(select(MessageTranslation).where(MessageTranslation.recording_id==record.id,
        MessageTranslation.request_id==payload.request_id))).scalar_one_or_none()
    if existing:
        if existing.candidates!=[payload.expected_text]:raise HTTPException(409,'This request already belongs to another candidate')
        return public(existing)
    # Do not bind a short confirmation utterance to another proposed message.
    if (record.quality or {}).get('meaning_confirmation_response'):raise HTTPException(422,'Choose the original message, not its confirmation response')
    if record.duration_seconds>20:raise HTTPException(422,'Clarify one audio turn of at most twenty seconds')
    if call.language=='ml' and not re.search(r'[\u0d00-\u0d7f]',payload.expected_text):raise HTTPException(422,'Use Malayalam text for this message')
    current=(record.quality or {}).get('confirmed_meaning')
    if current:raise HTTPException(409,'This audio turn already has an immutable confirmed meaning')
    pending_item=(await db.execute(select(MessageTranslation).where(MessageTranslation.recording_id==record.id,
        MessageTranslation.provenance['state'].as_string()=='proposed').order_by(MessageTranslation.created_at).limit(1))).scalar_one_or_none()
    if pending_item:
        call.context={**call.context,'pending_meaning_id':str(pending_item.id)}
        await db.commit();return public(pending_item)
    item=MessageTranslation(learner_id=call.learner_id,recording_id=record.id,request_id=payload.request_id,proposed_by=user.id,
        candidates=[payload.expected_text],provenance={'language':call.language,'call_id':str(call_id),'source':'maya_contextual_meaning_candidate',
            'heard_text':payload.heard_text,'recognition_is_not_phonetic_evidence':True,'audio_sha256':record.audio_sha256,'state':'proposed'})
    db.add(item);await db.flush()
    call.context={**call.context,'pending_meaning_id':str(item.id)}
    await db.commit();return public(item)

@router.post('/live-calls/{call_id}/meaning-proposals/{translation_id}/answer')
async def answer(call_id:uuid.UUID,translation_id:uuid.UUID,payload:MeaningAnswer,user:User=Depends(get_current_user),db=Depends(get_db)):
    call,_=await access(db,user,call_id,lock=True)
    item=(await db.execute(select(MessageTranslation).where(MessageTranslation.id==translation_id).with_for_update())).scalar_one_or_none()
    if not item or item.learner_id!=call.learner_id or item.provenance.get('call_id')!=str(call_id):raise HTTPException(404,'Meaning proposal not found')
    if item.confirmed_text:return public(item)
    if call.context.get('pending_meaning_id')!=str(item.id):raise HTTPException(409,'This clarification was replaced by a newer one')
    _,original=await access(db,user,call_id,item.recording_id)
    _,response=await access(db,user,call_id,payload.confirmation_recording_id)
    created=lambda row:row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at
    proposed_at=item.created_at.replace(tzinfo=timezone.utc) if item.created_at.tzinfo is None else item.created_at
    if response.id==original.id or created(response)<=max(created(original),proposed_at):raise HTTPException(422,'Confirmation must be a separate audio turn recorded after the meaning proposal')
    bound=(response.quality or {}).get('meaning_confirmation_response')
    if bound and bound!=str(item.id):raise HTTPException(409,'This answer already confirms a different message')
    agreed=affirmative(payload.response_text)
    item.provenance={**item.provenance,'state':'confirmed' if agreed else 'not_confirmed',
        'confirmation_source':'learner_spoken_response_recognized_by_voice_client','confirmation_response':payload.response_text,
        'confirmation_recording_id':str(response.id),'confirmation_is_not_phonetic_evidence':True}
    # A no/unclear response never becomes agreement. The learner can restate it.
    response.quality={**response.quality,'meaning_confirmation_response':str(item.id)}
    if agreed:
        item.confirmed_text=item.candidates[0];item.confirmed_by=user.id;item.confirmed_at=datetime.now(timezone.utc)
        original.quality={**original.quality,'confirmed_meaning':{'translation_id':str(item.id),'text':item.confirmed_text,
            'confirmation_recording_id':str(response.id),'source':'spoken_confirmation'}}
        job=(original.quality or {}).get('daily_observation') or {'call_id':str(call_id)}
        # Supersede any in-flight unconfirmed analysis; its claim cannot commit.
        original.quality={**original.quality,'daily_observation':{**job,'state':'queued','claim':None,'translation_id':str(item.id),
            'confirmed_text':item.confirmed_text,'intent_confirmed':True}}
    call.context={**call.context,'pending_meaning_id':None}
    await db.commit()
    from learners.personal_learning import invalidate_plan
    invalidate_plan(call.learner_id,call.language)
    return {**public(item),'instruction':'Continue the conversation naturally. No pronunciation feedback or drills here.'}


@router.get('/live-calls/{call_id}/meaning-proposals')
async def pending(call_id:uuid.UUID,user:User=Depends(get_current_user),db=Depends(get_db)):
    call,_=await access(db,user,call_id)
    rows=(await db.execute(select(MessageTranslation).where(MessageTranslation.learner_id==call.learner_id,
        MessageTranslation.provenance['call_id'].as_string()==str(call_id),MessageTranslation.confirmed_at.is_(None))
        .order_by(MessageTranslation.created_at).limit(20))).scalars().all()
    return [public(row) for row in rows if row.provenance.get('state','proposed')=='proposed']

@router.post('/live-calls/{call_id}/meaning-proposals/{translation_id}/activate')
async def activate(call_id:uuid.UUID,translation_id:uuid.UUID,user:User=Depends(get_current_user),db=Depends(get_db)):
    call,_=await access(db,user,call_id,lock=True)
    item=await db.get(MessageTranslation,translation_id,populate_existing=True)
    if not item or item.learner_id!=call.learner_id or item.provenance.get('call_id')!=str(call_id):raise HTTPException(404,'Meaning proposal not found')
    if item.confirmed_text or item.provenance.get('state')!='proposed':raise HTTPException(409,'This meaning question has already been answered')
    current=call.context.get('pending_meaning_id')
    if current and current!=str(item.id):raise HTTPException(409,'Answer the current meaning question first')
    call.context={**call.context,'pending_meaning_id':str(item.id)}
    await db.commit();return public(item)
