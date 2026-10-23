"""Silent, durable conversation observations for later learning and clinician review."""
import asyncio,uuid
import httpx
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from sqlalchemy import select
from database import get_db,AsyncSessionLocal
from auth.dependencies import get_current_user
from models.user import User
from models.care import SpeechRecording,AcousticProposal
from models.speech_workflow import LiveCall,CallRecording
from learners.access import accessible_learner,require_practice_consent
from starlette.concurrency import run_in_threadpool

router=APIRouter(tags=['silent-daily-observations'])
POLICY='silent-daily-observation-v1'

def schedule(record,call_id,hint=''):
    existing=(record.quality or {}).get('daily_observation')
    if not existing:
        record.quality={**(record.quality or {}),'daily_observation':{'state':'queued','call_id':str(call_id),
            'transcript_hint':hint,'hint_source':'client_recognition_not_phonetic_evidence','policy':POLICY}}
    elif hint and existing.get('state')=='queued' and not existing.get('transcript_hint'):
        record.quality={**record.quality,'daily_observation':{**existing,'transcript_hint':hint}}

class QueueRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    transcript_hint:str=Field(default='',max_length=2000)

@router.post('/recordings/{recording_id}/daily-observation')
async def queue(recording_id:uuid.UUID,payload:QueueRequest,user:User=Depends(get_current_user),db=Depends(get_db)):
    record=(await db.execute(select(SpeechRecording).where(SpeechRecording.id==recording_id).with_for_update())).scalar_one_or_none()
    if not record:raise HTTPException(404,'Recording not found')
    await accessible_learner(db,user,record.learner_id,owner_only=True)
    consent=await require_practice_consent(db,record.learner_id)
    if not consent.cloud_processing_allowed or not consent.retain_audio_allowed or not record.storage_key:raise HTTPException(403,'Observation needs speech processing and private audio retention permission')
    linked=(await db.execute(select(LiveCall).join(CallRecording,CallRecording.call_id==LiveCall.id).where(CallRecording.recording_id==recording_id,LiveCall.learner_id==record.learner_id))).scalars().first()
    if not linked or linked.mode not in ['conversation','daily_moment']:raise HTTPException(422,'Use an audio turn from daily conversation')
    existing=(record.quality or {}).get('daily_observation')
    schedule(record,linked.id,payload.transcript_hint)
    await db.commit()
    return {'state':(existing or {}).get('state','queued'),'silent':True,'inline_correction':False}

async def inspect_confirmed(data,language,duration,text):
    from learners.speech_coaching import analyze_audio,validate_feedback
    from learners.pronunciation_reference import target_reference
    from learners.acoustic_router import crop
    context={'language':language,'expected_text':text,'duration_seconds':min(duration,20),
        'pronunciation_reference':await run_in_threadpool(target_reference,text,language)}
    clip=await run_in_threadpool(crop,data,0,min(duration,20))
    result,model,_,_=await analyze_audio(clip,context);result=validate_feedback(result,context)
    return {**result.model_dump(),'models':[model],'indic_character_assessment':context.get('indic_character_assessment'),
        'assessment_scope':'confirmed_message_original_audio','reviewed_seconds':min(duration,20)}

async def inspect(data,language,duration,hint):
    from learners.meaning_inference import infer_meaning
    from learners.acoustic_router import crop
    clip=await run_in_threadpool(crop,data,0,min(duration,20))
    evidence=None;models=[];raw='';concerns=[]
    if language=='ml':
        from learners.indic_malayalam import observe
        from config import settings
        # Decode the audio even when the live transcript arrives late or is absent.
        evidence=await asyncio.wait_for(run_in_threadpool(observe,clip,settings.INDIC_MALAYALAM_MODEL_DIR),timeout=45)
        raw=evidence.get('text','');models.append(evidence['source'])
    elif language=='en':
        from learners.azure_pronunciation import assess
        provider=await assess(clip,'','en',unscripted=True)
        raw=' '.join(word['word'] for word in (provider or {}).get('words',[]))
        models.append('azure_pronunciation_assessment')
    else:return {'state':'insufficient_evidence','concerns':[],'models':[],'summary':'Daily observation supports English and Malayalam.'}
    meaning=await infer_meaning(language,raw,hint)
    if meaning.get('model'):models.append(meaning['model'])
    return {'state':'insufficient_evidence','concerns':concerns,'models':models,
        'summary':'Meaning clarification is ready; sound differences need confirmation of the intended words.' if meaning.get('needs_confirmation') else 'Meaning inference completed. No confirmed pronunciation verdict is available.',
        'meaning_inference':meaning,'independent_recognized_text':raw,'indic_character_assessment':evidence,
        'assessment_scope':'unconfirmed_conversation_meaning_and_independent_audio',
        'reviewed_seconds':min(duration,20)}

async def process_one(identifier,factory=None):
    factory=factory or AsyncSessionLocal
    async with factory() as db:
        record=(await db.execute(select(SpeechRecording).where(SpeechRecording.id==identifier).with_for_update())).scalar_one_or_none()
        job=(record.quality or {}).get('daily_observation',{}) if record else {}
        if not record or job.get('state') not in ['queued','processing']:return False
        now=datetime.now(timezone.utc)
        if job.get('state')=='processing' and (now-datetime.fromisoformat(job['started_at'])).total_seconds()<180:return False
        claim=str(uuid.uuid4());learner_id=record.learner_id;actor=record.submitted_by
        record.quality={**record.quality,'daily_observation':{**job,'state':'processing','claim':claim,'started_at':now.isoformat()}}
        await db.commit()
        try:
            user=await db.get(User,actor)
            if not user:raise HTTPException(403)
            await accessible_learner(db,user,learner_id,owner_only=True)
            consent=await require_practice_consent(db,learner_id)
            record=await db.get(SpeechRecording,identifier,populate_existing=True)
            if not consent.cloud_processing_allowed or not consent.retain_audio_allowed or not record.storage_key:raise HTTPException(403)
            from learners import storage
            data=await run_in_threadpool(storage.read,record.storage_key);language=record.language;duration=record.duration_seconds
            confirmation_response=bool(record.quality.get('meaning_confirmation_response'))
            await db.rollback()
            if confirmation_response:
                result={'state':'insufficient_evidence','concerns':[],'models':[],'summary':'A meaning-confirmation response is not a pronunciation practice attempt.'}
            elif job.get('intent_confirmed'):
                result=await asyncio.wait_for(inspect_confirmed(data,language,duration,job['confirmed_text']),timeout=90)
            else:result=await asyncio.wait_for(inspect(data,language,duration,job.get('transcript_hint','')),timeout=90)
        except (HTTPException,OSError,ValueError,RuntimeError,TimeoutError,httpx.HTTPError):
            await db.rollback();result={'state':'insufficient_evidence','concerns':[],'models':[],'summary':'Observation unavailable; this does not mean the learner pronounced anything incorrectly.'}
        db.expire_all()
        record=(await db.execute(select(SpeechRecording).where(SpeechRecording.id==identifier).with_for_update())).scalar_one_or_none()
        if not record or record.quality.get('daily_observation',{}).get('claim')!=claim:return False
        try:
            consent=await require_practice_consent(db,learner_id)
            user=await db.get(User,actor)
            if not user:raise HTTPException(403)
            await accessible_learner(db,user,learner_id,owner_only=True)
            if not consent.cloud_processing_allowed or not consent.retain_audio_allowed or not record.storage_key:raise HTTPException(403)
        except HTTPException:
            record.quality={**record.quality,'daily_observation':{'state':'revoked','policy':POLICY}};await db.commit();return True
        if record.quality.get('meaning_confirmation_response'):
            result={'state':'insufficient_evidence','concerns':[],'models':[],'summary':'Meaning-confirmation response, not a pronunciation verdict.'}
        content={**result,'purpose':'silent_daily_observation','requires_confirmation':not bool(job.get('intent_confirmed')),'intent_confirmed':bool(job.get('intent_confirmed')),'inline_correction_delivered':False,
            'clinical_assessment':False,'all_phonemes_verified':False,'source':'silent_conversation_audio_observation',
            'recognition_context_is_not_phonetic_evidence':True,'assessment_policy':POLICY}
        meaning=result.get('meaning_inference') or {}
        if not job.get('intent_confirmed') and meaning.get('needs_confirmation') and meaning.get('candidate'):
            from models.speech_workflow import MessageTranslation
            request_id=uuid.uuid5(identifier,'daily-meaning-v2')
            existing=(await db.execute(select(MessageTranslation).where(MessageTranslation.recording_id==identifier,
                MessageTranslation.provenance['state'].as_string().in_(['proposed','confirmed']))
                .order_by(MessageTranslation.created_at.desc()).limit(1))).scalar_one_or_none()
            if not existing:
                db.add(MessageTranslation(learner_id=learner_id,recording_id=identifier,request_id=request_id,proposed_by=actor,
                    candidates=[meaning['candidate']],provenance={'language':record.language,'call_id':job['call_id'],
                        'source':'independent_audio_and_llm_meaning_candidate','heard_text':result.get('independent_recognized_text',''),
                        'recognition_is_not_phonetic_evidence':True,'audio_sha256':record.audio_sha256,'state':'proposed',
                        'meaning_model':meaning.get('model'),'automatically_queued':True}))
        db.add(AcousticProposal(recording_id=identifier,requested_by=actor,model=','.join(result.get('models',[]))[:100] or 'unavailable',
            request={'purpose':'daily_observation','policy':POLICY,'call_id':job['call_id'],'language':record.language,
                'translation_id':job.get('translation_id'),'expected_text':job.get('confirmed_text')},content=content))
        record.quality={**record.quality,'daily_observation':{**record.quality['daily_observation'],'state':'completed'}}
        await db.commit();return True

async def drain(factory=None):
    factory=factory or AsyncSessionLocal
    async with factory() as db:
        ids=(await db.execute(select(SpeechRecording.id).where(SpeechRecording.quality['daily_observation']['state'].as_string().in_(['queued','processing']))
            .order_by(SpeechRecording.created_at).limit(8))).scalars().all()
    # English network calls must not wait behind a slow Malayalam decoder or
    # an earlier model request. Keep concurrency bounded to protect the DB pool.
    count=0
    for start in range(0,len(ids),2):
        count+=sum(await asyncio.gather(*(process_one(identifier,factory) for identifier in ids[start:start+2])))
    return count
