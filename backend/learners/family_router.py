import io
import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Literal
import httpx
import soundfile as sf
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import CareGoal, ProviderDeletion, SpeechRecording
from models.experience import FamilyMission, MissionProposal, CommunicationPhrase, VoiceProfile
from knowledge_graph.workflow import queue_workflow
from learners.access import accessible_learner, require_practice_consent, lock_learner, latest_consent, recheck_cloud_processing
from fluency.audio import decode_audio
from ml_settings import MAX_AUDIO_BYTES, SAMPLE_RATE, InvalidAudioError
from config import settings

router = APIRouter(tags=["family-missions-and-communication"])


@router.post("/learners/{learner_id}/photo-activity")
async def photo_activity(learner_id: uuid.UUID, photo: UploadFile = File(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    learner = await accessible_learner(db, user, learner_id, owner_only=True)
    consent = await require_practice_consent(db, learner_id)
    if not consent.cloud_processing_allowed:
        raise HTTPException(403, "Cloud processing permission is required for a photo activity")
    if not settings.OPENROUTER_KEY:
        raise HTTPException(503, "Photo activity generation is not configured")
    data = await photo.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(413, "Photo must be at most 2 MiB")
    try:
        from PIL import Image
        image = Image.open(io.BytesIO(data))
        if image.format not in ["JPEG", "PNG", "WEBP"] or image.width * image.height > 16000000:
            raise ValueError("Unsupported image")
        image = image.convert("RGB")
        image.thumbnail((1024, 1024))
        sanitized = io.BytesIO()
        image.save(sanitized, format="JPEG", quality=85)
    except Exception as error:
        raise HTTPException(422, "Use a valid JPEG, PNG or WebP photo") from error
    goals = (await db.execute(select(CareGoal).where(CareGoal.learner_id == learner_id, CareGoal.active.is_(True)).limit(5))).scalars().all()
    prompt = (f"Suggest one short, age-appropriate family communication activity in language {learner.language} for age {learner.age}. "
        "Use familiar visible objects. Do not identify people, infer health, diagnose, or prescribe treatment. "
        "Be tentative about uncertain objects. If an approved practice word fits, incorporate it without changing its reviewed instruction. "
        "Return JSON with title and instruction only. This is a proposal the owner must review. Approved words: "
        + json.dumps([goal.practice_word for goal in goals], ensure_ascii=False))
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post("https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_KEY}"},
                json={"model": settings.OPENROUTER_VISION_MODEL, "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt}, {"type": "image_url", "image_url": {
                        "url": "data:image/jpeg;base64," + base64.b64encode(sanitized.getvalue()).decode()}}]}],
                    "response_format": {"type": "json_object"}, "max_tokens": 250})
            response.raise_for_status()
            proposal = MissionRequest.model_validate(json.loads(response.json()["choices"][0]["message"]["content"]))
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as error:
        raise HTTPException(503, "Photo activity generation is unavailable") from error
    await recheck_cloud_processing(db, user, learner_id, owner_only=True)
    saved = MissionProposal(learner_id=learner_id, requested_by=user.id,
        model=settings.OPENROUTER_VISION_MODEL, content=proposal.model_dump(mode='json', include={'title', 'instruction'}))
    db.add(saved); await db.commit()
    return {**saved.content, 'proposal_id': str(saved.id), "source": "ai_generated_proposal", "requires_owner_review": True,
            "photo_retained_locally": False}


class MissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1500)
    goal_id: uuid.UUID | None = None
    proposal_id: uuid.UUID | None = None
    kind: Literal['practice', 'retention', 'transfer'] = 'practice'
    due_at: datetime | None = None

    @model_validator(mode='after')
    def scheduled_check(self):
        if self.due_at is not None and self.due_at.utcoffset() is None:
            raise ValueError('The scheduled time must include a timezone')
        if self.kind != 'practice' and (not self.goal_id or not self.due_at):
            raise ValueError('Retention and transfer checks require a reviewed goal and scheduled time')
        return self


@router.post("/learners/{learner_id}/missions", status_code=201)
async def create_mission(learner_id: uuid.UUID, payload: MissionRequest,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id)
    await require_practice_consent(db, learner_id)
    if payload.due_at and payload.due_at <= datetime.now(timezone.utc):
        raise HTTPException(422, 'Schedule a future time for this activity')
    if payload.proposal_id:
        await accessible_learner(db, user, learner_id, owner_only=True)
        proposal = await db.get(MissionProposal, payload.proposal_id)
        if not proposal or proposal.learner_id != learner_id:
            raise HTTPException(404, 'Activity proposal not found')
    if payload.goal_id:
        goal = await db.get(CareGoal, payload.goal_id)
        if not goal or goal.learner_id != learner_id or not goal.active:
            raise HTTPException(404, "Practice goal not found")
    mission = FamilyMission(learner_id=learner_id, created_by=user.id, **payload.model_dump())
    db.add(mission)
    await db.commit()
    return {"id": str(mission.id), "source": 'owner_reviewed_ai_proposal' if mission.proposal_id else 'human_authored'}


@router.get("/learners/{learner_id}/missions")
async def missions(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    rows = (await db.execute(select(FamilyMission).where(FamilyMission.learner_id == learner_id)
        .order_by(FamilyMission.created_at.desc()).limit(100))).scalars().all()
    return [{"id": str(row.id), "title": row.title, "instruction": row.instruction, "goal_id": str(row.goal_id) if row.goal_id else None,
             "report": row.report, "completed_at": row.completed_at.isoformat() if row.completed_at else None,
             'kind': row.kind, 'due_at': row.due_at.isoformat() if row.due_at else None,
             'recording_id': str(row.recording_id) if row.recording_id else None,
             'proposal_id': str(row.proposal_id) if row.proposal_id else None,
             "source": 'owner_reviewed_ai_proposal' if row.proposal_id else 'human_authored',
             "outcome_source": "family_or_participant_report"} for row in rows]


class MissionReport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    report: str = Field(min_length=1, max_length=1500)
    recording_id: uuid.UUID | None = None


@router.post("/missions/{mission_id}/report")
async def report_mission(mission_id: uuid.UUID, payload: MissionReport,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    mission = await db.get(FamilyMission, mission_id)
    if mission is None:
        raise HTTPException(404, "Mission not found")
    await lock_learner(db, user, mission.learner_id, owner_only=True)
    mission = (await db.execute(select(FamilyMission).where(FamilyMission.id == mission_id)
        .with_for_update().execution_options(populate_existing=True))).scalar_one()
    await require_practice_consent(db, mission.learner_id)
    if mission.completed_at:
        raise HTTPException(409, 'This activity already has a saved report')
    now = datetime.now(timezone.utc)
    due = mission.due_at.replace(tzinfo=timezone.utc) if mission.due_at and mission.due_at.tzinfo is None else mission.due_at
    if due and now < due:
        raise HTTPException(409, 'This scheduled check is not due yet')
    if mission.kind != 'practice' and not payload.recording_id:
        raise HTTPException(422, 'Retention and transfer checks require a fresh recording for human review')
    if payload.recording_id:
        recording = await db.get(SpeechRecording, payload.recording_id)
        if not recording or recording.learner_id != mission.learner_id:
            raise HTTPException(404, 'Recording not found')
        created = recording.created_at.replace(tzinfo=timezone.utc) if recording.created_at.tzinfo is None else recording.created_at
        if due and created < due:
            raise HTTPException(422, 'Record this check after its scheduled time')
        goal = await db.get(CareGoal, mission.goal_id) if mission.goal_id else None
        if mission.kind != 'practice' and (not goal or not goal.active or recording.language != goal.language):
            raise HTTPException(409, 'This check needs an active reviewed goal and a recording in its language')
        if mission.kind == 'retention' and (recording.task != 'word' or recording.expected_text != goal.practice_word):
            raise HTTPException(422, 'Record the reviewed word for this retention check')
        if mission.kind == 'transfer' and recording.task not in ['sentence', 'conversation', 'daily_moment', 'story']:
            raise HTTPException(422, 'Use a sentence or everyday communication recording for a transfer check')
        mission.recording_id = recording.id
        if goal:
            queue_workflow(db, mission.learner_id, user.id, 'transfer', mission.id, {
                'goal_id': str(goal.id), 'recording_id': str(recording.id), 'context': mission.kind,
                'language': recording.language, 'source': 'family_report_and_recording_requires_human_review'})
    mission.report = payload.report
    mission.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"completed": True, "source": "family_or_participant_report", "clinical_assessment": False}


class PhraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    language: Literal["en", "hi", "ml"]
    text: str = Field(min_length=1, max_length=300)
    symbol: Literal["water", "food", "help", "wait", "yes", "no", "home", "play", "person"]


@router.post("/learners/{learner_id}/phrases", status_code=201)
async def create_phrase(learner_id: uuid.UUID, payload: PhraseRequest,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id, owner_only=True)
    count = (await db.execute(select(func.count()).select_from(CommunicationPhrase)
        .where(CommunicationPhrase.learner_id == learner_id))).scalar_one()
    if count >= 200:
        raise HTTPException(409, 'Your board has 200 personal phrases. Remove a phrase before adding another.')
    phrase = CommunicationPhrase(learner_id=learner_id, **payload.model_dump())
    db.add(phrase)
    await db.commit()
    return {"id": str(phrase.id)}


@router.patch('/phrases/{phrase_id}')
async def edit_phrase(phrase_id: uuid.UUID, payload: PhraseRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    phrase = await db.get(CommunicationPhrase, phrase_id)
    if phrase is None:
        raise HTTPException(404, 'Phrase not found')
    await lock_learner(db, user, phrase.learner_id, owner_only=True)
    for key, value in payload.model_dump().items():
        setattr(phrase, key, value)
    await db.commit()
    return {'id': str(phrase.id), **payload.model_dump()}


@router.delete('/phrases/{phrase_id}')
async def remove_phrase(phrase_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    phrase = await db.get(CommunicationPhrase, phrase_id)
    if phrase is None:
        raise HTTPException(404, 'Phrase not found')
    await lock_learner(db, user, phrase.learner_id, owner_only=True)
    await db.delete(phrase)
    await db.commit()
    return {'deleted': True}


@router.get("/learners/{learner_id}/phrases")
async def phrases(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    rows = (await db.execute(select(CommunicationPhrase).where(CommunicationPhrase.learner_id == learner_id)
                            .order_by(CommunicationPhrase.created_at).limit(200))).scalars().all()
    return [{"id": str(row.id), "text": row.text, "symbol": row.symbol, "language": row.language} for row in rows]


@router.get('/learners/{learner_id}/voice-capabilities')
async def voice_capabilities(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id,owner_only=True)
    if settings.VOICE_CLONING_PROVIDER=='openrouter_fish':
        from learners.fish_voice import available
        enabled=await available()
        return {'enrollment_available':enabled,'provider':'openrouter_fish','model':settings.OPENROUTER_CLONE_MODEL,
            'reason':'' if enabled else 'Fish voice cloning is not currently available through the configured OpenRouter model.'}
    if not settings.ELEVENLABS_API_KEY:return {'enrollment_available':False,'reason':'Voice enrollment is not configured'}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response=await client.get('https://api.elevenlabs.io/v1/user/subscription',headers={'xi-api-key':settings.ELEVENLABS_API_KEY})
            response.raise_for_status();data=response.json()
        enabled=data.get('can_use_instant_voice_cloning') is True
        return {'enrollment_available':enabled,'reason':'' if enabled else 'This provider account does not include instant voice cloning. Use the companion voice, or enable cloning with the provider.'}
    except (httpx.HTTPError,ValueError,TypeError):
        return {'enrollment_available':False,'reason':'Voice enrollment permissions could not be checked. Standard companion speech remains available.'}


@router.post("/learners/{learner_id}/voices", status_code=201)
async def enroll_voice(learner_id: uuid.UUID, reference: UploadFile = File(...), label: str = Form(..., min_length=1, max_length=80),
    authorized_reference: bool = Form(...), reference_speaker_is_adult:bool=Form(False), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id, owner_only=True)
    consent = await require_practice_consent(db, learner_id)
    if not reference_speaker_is_adult:
        raise HTTPException(422,'The reference speaker must be an adult aged 18 or older')
    if not authorized_reference or not consent.cloud_processing_allowed:
        raise HTTPException(403, "Authorized voice reference and cloud processing consent are required")
    if settings.VOICE_CLONING_PROVIDER=='openrouter_fish' and not consent.retain_audio_allowed:
        raise HTTPException(403,'Enable private audio retention to save an encrypted voice reference')
    if not (settings.OPENROUTER_KEY if settings.VOICE_CLONING_PROVIDER=='openrouter_fish' else settings.ELEVENLABS_API_KEY):
        raise HTTPException(503, "Voice enrollment is not configured")
    data = await reference.read(MAX_AUDIO_BYTES + 1)
    try:
        waveform = await run_in_threadpool(decode_audio, data)
    except InvalidAudioError as error:
        raise HTTPException(422, str(error)) from error
    if waveform.size < SAMPLE_RATE * 10:
        raise HTTPException(422, "Use at least ten seconds of an authorized voice reference")
    output = io.BytesIO()
    sf.write(output, waveform, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    if settings.VOICE_CLONING_PROVIDER=='openrouter_fish':
        from learners import storage
        from learners.fish_voice import synthesize_reference
        # Confirm that actual reference-conditioned synthesis works before saving a profile.
        learner=await accessible_learner(db,user,learner_id,owner_only=True)
        language=learner.language;actor=user.id
        await db.rollback()
        preview=await synthesize_reference({'en':'This is my practice voice.','hi':'यह मेरी अभ्यास की आवाज़ है।','ml':'ഇത് എന്റെ പരിശീലന ശബ്ദമാണ്.'}[language],language,output.getvalue())
        user=await db.get(User,actor)
        if not user:raise HTTPException(401,'Sign in again')
        await lock_learner(db,user,learner_id,owner_only=True)
        current=await latest_consent(db,learner_id)
        if not current or not current.practice_allowed or not current.cloud_processing_allowed or not current.retain_audio_allowed:
            raise HTTPException(403,'Voice reference permission was withdrawn')
        key=await run_in_threadpool(storage.retain,output.getvalue())
        try:
            voice=VoiceProfile(learner_id=learner_id,owner_id=user.id,provider_id='fish_ref:'+key,label=label)
            db.add(voice);await db.commit()
        except Exception:
            await run_in_threadpool(storage.remove,key)
            raise
        return {'id':str(voice.id),'label':label,'synthetic':True,'provider':'openrouter_fish','preview':preview}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post("https://api.elevenlabs.io/v1/voices/add", headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                data={"name": label, "description": "User-authorized synthetic voice for communication"},
                files=[("files", ("authorized-reference.wav", output.getvalue(), "audio/wav"))])
            response.raise_for_status()
            identity = response.json().get("voice_id")
            if not isinstance(identity,str) or not identity or len(identity)>100:
                raise ValueError('No valid voice ID')
            if response.json().get('requires_verification'):
                db.add(ProviderDeletion(provider_id=identity));await db.commit()
                raise HTTPException(409,'This voice requires verification with the provider. The unfinished enrollment is queued for deletion.')
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
        failure=getattr(error,'response',None)
        if failure is not None and failure.status_code in [401,402,403,429]:
            raise HTTPException(503,'The voice provider rejected enrollment. Check key permissions, available credits and instant voice cloning access. Standard companion speech is still available.') from error
        raise HTTPException(503, "Voice enrollment is unavailable") from error
    await lock_learner(db, user, learner_id, owner_only=True)
    current = await latest_consent(db, learner_id)
    if not current or not current.practice_allowed or not current.cloud_processing_allowed:
        # Persist cleanup before rejecting an enrollment completed after withdrawal.
        db.add(ProviderDeletion(provider_id=identity))
        await db.commit()
        raise HTTPException(403, 'Permission was withdrawn. Provider voice deletion has been queued.')
    voice = VoiceProfile(learner_id=learner_id, owner_id=user.id, provider_id=identity, label=label)
    db.add(voice)
    await db.commit()
    return {"id": str(voice.id), "label": label, "synthetic": True,
            "limitation": "A synthetic voice resemblance is not restoration of an original healthy voice."}


@router.get("/learners/{learner_id}/voices")
async def voices(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    rows = (await db.execute(select(VoiceProfile).where(VoiceProfile.learner_id == learner_id))).scalars().all()
    return [{"id": str(row.id), "label": row.label, "synthetic": True} for row in rows]


@router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    voice = await db.get(VoiceProfile, voice_id)
    if voice is None:
        raise HTTPException(404, "Voice not found")
    await lock_learner(db, user, voice.learner_id, owner_only=True)
    voice = await db.get(VoiceProfile, voice_id, populate_existing=True)
    if voice is None:
        return {'deleted': True, 'provider_deletion': 'already_requested'}
    db.add(ProviderDeletion(provider_id=voice.provider_id, resource_type='voice'))
    await db.delete(voice)
    await db.commit()
    return {"deleted": True, 'provider_deletion': 'queued'}
