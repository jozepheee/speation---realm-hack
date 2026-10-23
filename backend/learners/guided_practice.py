"""Guided media and word practice; recordings use the existing human-review path."""
import asyncio
import base64
import io
import random
import uuid
from typing import Literal
from starlette.concurrency import run_in_threadpool
from datetime import datetime, timedelta, timezone
import httpx
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from config import settings
from database import get_db
from models.user import User
from models.care import SpeechRecording
from models.guided_practice import GuidedPracticeSession
from learners.access import accessible_learner, lock_learner, require_practice_consent, recheck_cloud_processing
from knowledge_graph.workflow import queue_workflow

router = APIRouter(tags=['guided-practice'])
generation_capacity = asyncio.Semaphore(2)
EXERCISES = {
 'mouth-wide': ('Open mouth demonstration', '/videos/mouth_wide.mp4', ''),
 'say-o': ('Rounded lips demonstration', '/videos/say_o.mp4', 'o'),
 'say-e': ('Spread lips demonstration', '/videos/say_e.mp4', 'ee'),
 'tongue-down': ('Tongue down demonstration', '/videos/tongue_down.mp4', ''),
 'tongue-right': ('Tongue right demonstration', '/videos/tongue_right.mp4', ''),
 'tongue-left': ('Tongue left demonstration', '/videos/tongue_left.mp4', ''),
}
WORDS = {'en':['apple','water','sun','moon','home','tree','fish','book'],
 'hi':['आम','पानी','सूरज','चाँद','घर','पेड़','मछली','किताब'],
 'ml':['മാങ്ങ','വെള്ളം','സൂര്യൻ','ചന്ദ്രൻ','വീട്','മരം','മീൻ','പുസ്തകം']}
SCENES = ['a friendly dog beside a red ball in a sunny park',
 'a family preparing fruit at a kitchen table', 'a child reading a book beside a sleeping cat',
 'a garden with a butterfly, flowers and a watering can', 'a yellow bus beside a school with trees']

class StartPractice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: uuid.UUID
    kind: str
    exercise_id: str | None = None
    language: Literal['en','hi','ml'] | None = None
    practice_word:str|None=Field(default=None,max_length=80)

class ExerciseAnalysis(BaseModel):
    routine_id:uuid.UUID|None=None
    set_number:int=Field(default=1,ge=1,le=3)
    repetitions_target:int=Field(default=3,ge=3,le=3)
    model_config = ConfigDict(extra='ignore')
    exercise_id: str = Field(max_length=40)
    reps: int = Field(ge=0,le=300)
    samples: int = Field(ge=0,le=500000)
    matched_samples: int = Field(ge=0,le=500000)
    method: str = Field(max_length=80)
    calibrated: bool = False
    thresholds: str = Field(max_length=120)

class CompletePractice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    recording_id: uuid.UUID | None = None
    watched_demonstration: bool = False
    analysis: ExerciseAnalysis | None = None

def public_session(row, include_image=True):
    content = dict(row.content)
    if not include_image:
        content.pop('image_data_url', None)
    return {'id':str(row.id),'learner_id':str(row.learner_id),'kind':row.kind,'language':row.language,
        'content':content,'recording_id':str(row.recording_id) if row.recording_id else None,
        'completed_at':row.completed_at.isoformat() if row.completed_at else None,
        'created_at':row.created_at.isoformat(),'assessment':'requires_clinician_review'}

def compact_image(encoded):
    if len(encoded) > 20 * 1024 * 1024:
        raise ValueError('Image is too large')
    data = base64.b64decode(encoded, validate=True)
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError('Image dimensions are too large')
        image.thumbnail((960,640))
        output = io.BytesIO(); image.convert('RGB').save(output,format='JPEG',quality=80)
    if len(output.getvalue()) > 350_000:
        raise ValueError('Image exceeds practice storage limit')
    return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode()

async def generate_picture(scene):
    if not settings.OPENROUTER_KEY:
        raise HTTPException(503, 'Picture generation is not configured')
    prompt = ('Create one warm, clear, child-friendly storybook illustration of ' + scene +
        '. A simple uncluttered composition, expressive actions, no writing, no letters, no logos, no medical imagery. Suitable for ages 4 and above.')
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post('https://openrouter.ai/api/v1/images',
                headers={'Authorization':f'Bearer {settings.OPENROUTER_KEY}'},
                json={'model':settings.OPENROUTER_IMAGE_MODEL,'prompt':prompt,'aspect_ratio':'3:2','n':1})
        response.raise_for_status()
        return compact_image(response.json()['data'][0]['b64_json'])
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, OSError, UnidentifiedImageError) as error:
        raise HTTPException(503,'The image provider could not create a picture. Please try again.') from error

@router.post('/learners/{learner_id}/guided-practice', status_code=201)
async def start(learner_id:uuid.UUID, payload:StartPractice, user:User=Depends(get_current_user), db:AsyncSession=Depends(get_db)):
    learner = await lock_learner(db,user,learner_id,owner_only=True)
    consent = await require_practice_consent(db,learner_id)
    existing = await db.get(GuidedPracticeSession,payload.request_id)
    if existing:
        if existing.learner_id != learner_id or existing.kind != payload.kind or existing.content.get('exercise_id') != payload.exercise_id:
            raise HTTPException(409,'This practice request belongs to another activity')
        return public_session(existing)
    if payload.kind not in ['exercise','picture','word'] or (payload.kind=='exercise' and payload.exercise_id not in EXERCISES):
        raise HTTPException(422,'Choose a supported practice activity')
    if payload.kind != 'exercise' and payload.exercise_id:
        raise HTTPException(422,'Exercise selection is only valid for video practice')
    language = payload.language or learner.language
    if payload.practice_word and (payload.kind!='word' or payload.practice_word not in WORDS[language]):
        raise HTTPException(422,'Choose a practice word in the selected language')
    content = {'state':'ready','source':'guided_practice','expected_text':''}
    if payload.kind=='exercise':
        title,video,word=EXERCISES[payload.exercise_id]
        content.update(exercise_id=payload.exercise_id,title=title,video=video,expected_text=word)
    elif payload.kind=='word':
        content.update(title='Listen and repeat',expected_text=payload.practice_word or random.SystemRandom().choice(WORDS[language]))
    else:
        if not consent.cloud_processing_allowed:
            raise HTTPException(403,'Cloud processing permission is required for AI picture generation')
        recent = (await db.execute(select(func.count()).select_from(GuidedPracticeSession).where(
            GuidedPracticeSession.learner_id==learner_id,GuidedPracticeSession.kind=='picture',
            GuidedPracticeSession.created_at > datetime.now(timezone.utc)-timedelta(minutes=5)))).scalar_one()
        if recent>=3:
            raise HTTPException(429,'Three pictures were requested recently. Please return in five minutes.')
        content.update(state='generating',title='Tell a picture story',scene=random.SystemRandom().choice(SCENES),model=settings.OPENROUTER_IMAGE_MODEL)
    row=GuidedPracticeSession(id=payload.request_id,learner_id=learner_id,created_by=user.id,kind=payload.kind,language=language,content=content)
    db.add(row); await db.commit()
    if payload.kind=='picture':
        try:
            try: await asyncio.wait_for(generation_capacity.acquire(),timeout=1)
            except TimeoutError: raise HTTPException(429,'Picture generation is busy. Please try again shortly.')
            try: image = await generate_picture(content['scene'])
            finally: generation_capacity.release()
            await lock_learner(db,user,learner_id,owner_only=True)
            if not (await require_practice_consent(db,learner_id)).cloud_processing_allowed:
                raise HTTPException(403,'Cloud processing permission was withdrawn')
            row.content={**content,'state':'ready','image_data_url':image}
            await db.commit()
        except HTTPException:
            await db.rollback()
            row=await db.get(GuidedPracticeSession,payload.request_id)
            row.content={**content,'state':'error'}; await db.commit()
            raise
    return public_session(row)

@router.get('/learners/{learner_id}/guided-practice')
async def history(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id)
    rows=(await db.execute(select(GuidedPracticeSession).where(GuidedPracticeSession.learner_id==learner_id,GuidedPracticeSession.kind!='intake').order_by(GuidedPracticeSession.created_at.desc()).limit(50))).scalars().all()
    return [public_session(row,False) for row in rows]

@router.get('/guided-practice/{session_id}')
async def detail(session_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row=await db.get(GuidedPracticeSession,session_id)
    if not row: raise HTTPException(404,'Practice session not found')
    await accessible_learner(db,user,row.learner_id)
    return public_session(row)

@router.post('/guided-practice/{session_id}/complete')
async def complete(session_id:uuid.UUID,payload:CompletePractice,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row=(await db.execute(select(GuidedPracticeSession).where(GuidedPracticeSession.id==session_id).with_for_update())).scalar_one_or_none()
    if not row: raise HTTPException(404,'Practice session not found')
    await lock_learner(db,user,row.learner_id,owner_only=True)
    await require_practice_consent(db,row.learner_id)
    if row.completed_at:
        if row.recording_id != payload.recording_id: raise HTTPException(409,'This session already has a different saved attempt')
        return await feedback_for_picture(row,user,db) if row.kind=='picture' else public_session(row)
    if row.kind=='intake': raise HTTPException(409,'Use the first-conversation completion workflow')
    if row.content['state']!='ready': raise HTTPException(409,'The activity is not ready')
    if row.kind=='exercise' and not payload.watched_demonstration: raise HTTPException(422,'Watch the demonstration before saving participation')
    if payload.analysis and (row.kind!='exercise' or payload.analysis.exercise_id!=row.content.get('exercise_id') or payload.analysis.matched_samples>payload.analysis.samples):
        raise HTTPException(422,'Camera report does not match this exercise')
    if row.kind in ['picture','word'] and not payload.recording_id: raise HTTPException(422,'Record an attempt before saving this activity')
    if payload.recording_id:
        recording=await db.get(SpeechRecording,payload.recording_id)
        if not recording or recording.learner_id!=row.learner_id: raise HTTPException(404,'Recording not found')
        created=recording.created_at.replace(tzinfo=timezone.utc) if not recording.created_at.tzinfo else recording.created_at
        started=row.created_at.replace(tzinfo=timezone.utc) if not row.created_at.tzinfo else row.created_at
        expected_task = 'story' if row.kind=='picture' else 'word' if row.content['expected_text'] else 'conversation'
        if created < started or recording.language!=row.language or recording.task!=expected_task or recording.expected_text!=row.content['expected_text']:
            raise HTTPException(422,'Use a fresh recording for this activity and language')
        row.recording_id=recording.id
        queue_workflow(db,row.learner_id,user.id,'recording',recording.id,{
            'guided_practice_id':str(row.id),'guided_activity':row.kind,
            'activity_title':row.content['title'],'expected_text':row.content['expected_text'],
            'source':'guided_practice_recording_requires_human_review'})
    if payload.analysis and payload.analysis.routine_id and (payload.analysis.reps!=3 or (row.content.get('exercise_id','').startswith('tongue') and not payload.analysis.calibrated)):
        raise HTTPException(422,'A routine stage requires three tracked repetitions and calibrated tongue tracking')
    row.content={**row.content,'watched_demonstration':payload.watched_demonstration,'completion_source':'participant_report',
        'movement_analysis':{**payload.analysis.model_dump(mode='json'),'source':'client_camera_heuristic_not_clinician_assessment'} if payload.analysis else None,'clinical_assessment':False}
    row.completed_at=datetime.now(timezone.utc);await db.commit()
    return await feedback_for_picture(row,user,db) if row.kind=='picture' else public_session(row)


class AnswerLanguage(BaseModel):
    model_config=ConfigDict(extra='forbid')
    language:Literal['en','hi','ml']

@router.patch('/guided-practice/{session_id}/language')
async def answer_language(session_id:uuid.UUID,payload:AnswerLanguage,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row=(await db.execute(select(GuidedPracticeSession).where(GuidedPracticeSession.id==session_id).with_for_update())).scalar_one_or_none()
    if not row:raise HTTPException(404,'Practice session not found')
    await lock_learner(db,user,row.learner_id,owner_only=True)
    await require_practice_consent(db,row.learner_id)
    if row.kind not in ['picture','word'] or row.completed_at:raise HTTPException(409,'Choose the practice language before submitting this activity')
    if row.kind=='word' and row.language!=payload.language:
        row.content={**row.content,'expected_text':random.SystemRandom().choice(WORDS[payload.language])}
    row.language=payload.language;await db.commit()
    return public_session(row)

async def feedback_for_picture(row,user,db):
    if row.content.get('answer_feedback'):return public_session(row)
    consent=await require_practice_consent(db,row.learner_id)
    if not consent.cloud_processing_allowed:
        return {**public_session(row),'feedback_error':'Enable cloud processing to check your picture description.'}
    record=await db.get(SpeechRecording,row.recording_id)
    if not record:raise HTTPException(404,'Recording not found')
    image=row.content.get('image_data_url');language=row.language
    if not image:return {**public_session(row),'feedback_error':'The picture is unavailable for checking your description.'}
    from learners import storage,picture_feedback
    audio=await run_in_threadpool(storage.read,record.storage_key) if consent.retain_audio_allowed and record.storage_key else None
    if not audio and not record.transcript:
        return {**public_session(row),'feedback_error':'No speech could be read. Your answer is saved; try recording again.'}
    session_id,learner_id,actor_id,recording_id=row.id,row.learner_id,user.id,record.id
    transcript=record.transcript or ''
    await db.rollback()  # Release the database while the provider checks the picture.
    try:feedback=await picture_feedback.assess(image,language,audio,transcript)
    except HTTPException as error:
        row=await db.get(GuidedPracticeSession,session_id)
        return {**public_session(row),'feedback_error':str(error.detail)}
    user=await db.get(User,actor_id)
    if not user:raise HTTPException(401,'Sign in again to view picture feedback')
    consent=await recheck_cloud_processing(db,user,learner_id,owner_only=True)
    if audio and not consent.retain_audio_allowed:raise HTTPException(403,'Audio retention permission was withdrawn')
    row=await db.get(GuidedPracticeSession,session_id)
    if row.recording_id!=recording_id:raise HTTPException(409,'The saved answer changed')
    row.content={**row.content,'answer_feedback':feedback}
    await db.commit()
    return public_session(row)
