import hashlib
import asyncio
import io
import wave
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
import numpy as np
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import SpeechRecording, RecordingReview, AcousticProposal, CareGoal, GraphOutbox
from models.learner import Learner, ClinicianAssignment
from learners.access import accessible_learner, lock_learner, require_practice_consent, is_clinician
from learners import storage
from ml_settings import MAX_AUDIO_BYTES, SAMPLE_RATE, InvalidAudioError, ModelUnavailableError, ASR_MODEL
from fluency.audio import decode_audio
from fluency.asr import transcribe_recording
from learners.signal_quality import analyze_signal
from learners.recognition import recognize
from knowledge_graph.workflow import queue_workflow
from learners.review_evidence import current_review_filter

router = APIRouter(tags=["care-and-recordings"])
_recognition_capacity = asyncio.Semaphore(2)


@router.get('/clinical/workload')
async def clinical_workload(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await is_clinician(db, user.id):
        raise HTTPException(403, 'Clinician access required')
    assigned = select(ClinicianAssignment.learner_id).where(
        ClinicianAssignment.clinician_id == user.id, ClinicianAssignment.active.is_(True))
    recordings = (select(SpeechRecording.learner_id,
        func.count().label('total'),
        func.count().filter(SpeechRecording.review_status == 'pending').label('pending'),
        func.min(SpeechRecording.created_at).filter(SpeechRecording.review_status == 'pending').label('oldest_pending'),
        func.max(SpeechRecording.created_at).label('last_practice'))
        .where(SpeechRecording.learner_id.in_(assigned)).group_by(SpeechRecording.learner_id).subquery())
    revised = select(RecordingReview.supersedes_review_id).where(RecordingReview.supersedes_review_id.is_not(None))
    uncertain = (select(SpeechRecording.learner_id, func.count().label('uncertain'))
        .join(RecordingReview, RecordingReview.recording_id == SpeechRecording.id)
        .where(SpeechRecording.learner_id.in_(assigned), RecordingReview.outcome == 'uncertain',
            RecordingReview.id.not_in(revised)).group_by(SpeechRecording.learner_id).subquery())
    rows = (await db.execute(select(Learner, recordings.c.total, recordings.c.pending,
        recordings.c.oldest_pending, recordings.c.last_practice, uncertain.c.uncertain)
        .outerjoin(recordings, recordings.c.learner_id == Learner.id)
        .outerjoin(uncertain, uncertain.c.learner_id == Learner.id)
        .where(Learner.id.in_(assigned))
        .order_by(recordings.c.pending.desc().nullslast(), recordings.c.oldest_pending.asc().nullslast(), Learner.id)
        .limit(501))).all()
    return {'source': 'recordings_and_current_human_reviews', 'truncated': len(rows) > 500,
        'learners': [{'learner_id': str(learner.id), 'name': learner.display_name, 'language': learner.language,
            'recordings': total or 0, 'pending': pending or 0, 'uncertain': unsure or 0,
            'oldest_pending': oldest.isoformat() if oldest else None,
            'last_practice': latest.isoformat() if latest else None}
            for learner, total, pending, oldest, latest, unsure in rows[:500]]}


def playback_wav(waveform):
    """Retain decoded PCM rather than trusting an uploaded filename or MIME type."""
    stream = io.BytesIO()
    with wave.open(stream, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes((np.clip(waveform, -1, 1) * 32767).astype('<i2').tobytes())
    return stream.getvalue()


def recording_data(record):
    return {"id": str(record.id), "learner_id": str(record.learner_id), "language": record.language,
            "task": record.task, "expected_text": record.expected_text, "transcript": record.transcript,
            "words": record.words, "duration_seconds": record.duration_seconds, "quality": record.quality,
            "recognition_model": record.recognition_model, "recognition_error": record.recognition_error,
            "review_status": record.review_status, "audio_retained": bool(record.storage_key),
            "created_at": record.created_at.isoformat(),
            "pronunciation_assessment": "requires_clinician_review"}


async def clinician_access(db, user, learner_id):
    if not await is_clinician(db, user.id):
        raise HTTPException(403, "Clinician access required")
    await accessible_learner(db, user, learner_id)


@router.post("/learners/{learner_id}/recordings", status_code=201)
async def submit_recording(learner_id: uuid.UUID, audio: UploadFile = File(...),
    attempt_id: uuid.UUID = Form(...), language: Literal["en", "hi", "ml"] = Form(...),
    task: Literal["conversation", "word", "sentence", "story", "listening", "daily_moment"] = Form("conversation"),
    provider: Literal['local_whisper', 'sarvam', 'deepgram','adapted_english'] = Form('local_whisper'),
    recognition_mode: Literal['selected_language', 'auto'] = Form('selected_language'),
    dialect: str = Form('unspecified', min_length=1, max_length=80),
    recognize_audio: bool = Form(True),
    live_call_id: uuid.UUID | None = Form(None),
    transcript_hint: str = Form('',max_length=2000),
    rehearsal_capture: bool = Form(False),
    visual_articulation: str = Form("", max_length=2000),
    expected_text: str = Form("", max_length=2000), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from learners.visual_articulation import checked_visual_summary
    try:visual=checked_visual_summary(visual_articulation)
    except ValueError:raise HTTPException(422,'Invalid camera movement summary')
    learner = await accessible_learner(db, user, learner_id)
    if rehearsal_capture and (learner.age < 16 or task != 'conversation'):
        raise HTTPException(422, 'Extended rehearsal capture is for age-16+ conversation practice')
    if provider=='adapted_english' and learner.age<18:
        raise HTTPException(422,'The adult research pilot is not available for child profiles')
    initial_consent = await require_practice_consent(db, learner_id)
    if provider not in ['local_whisper','adapted_english'] and not initial_consent.cloud_processing_allowed:
        raise HTTPException(403, 'Cloud processing permission is required before sending audio to this recognition provider')
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    digest = hashlib.sha256(data).hexdigest()
    existing = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id,
        SpeechRecording.attempt_id == attempt_id))).scalar_one_or_none()
    if existing:
        if (existing.audio_sha256, existing.language, existing.task, existing.expected_text) != (digest, language, task, expected_text):
            raise HTTPException(409, "Attempt ID was used for a different recording")
        if existing.quality.get('recognition_provider', 'local_whisper') != provider or existing.quality.get('recognition_mode', 'selected_language') != recognition_mode:
            raise HTTPException(409, 'Attempt ID was used with different recognition settings')
        if existing.quality.get('recognition_requested', True) != recognize_audio:
            raise HTTPException(409, 'Attempt ID was used with different audio processing settings')
        if existing.quality.get('dialect', 'unspecified') != dialect:
            raise HTTPException(409, 'Attempt ID was used with a different dialect context')
        return recording_data(existing)
    # Audio decoding/recognition must not occupy a database connection.
    # Ownership and consent are checked again under the finalization lock below.
    await db.commit()
    try:
        waveform = await run_in_threadpool(decode_audio, data, **({'max_seconds':180} if rehearsal_capture else {}))
    except InvalidAudioError as error:
        raise HTTPException(422, str(error)) from error
    quality = await run_in_threadpool(analyze_signal, waveform)
    quality.update(recognition_provider=provider, recognition_mode=recognition_mode, dialect=dialect,
        learner_age_at_recording=learner.age, dialect_source='participant_or_supporter_report')
    quality['recognition_requested']=recognize_audio
    quality['rehearsal_capture']=rehearsal_capture
    if visual:quality['visual_articulation']=visual
    transcript, words, error_code = None, [], None
    if recognize_audio:
        try:
            try:
                await asyncio.wait_for(_recognition_capacity.acquire(), timeout=1)
            except TimeoutError:
                raise HTTPException(429, 'Recognition is busy; keep your recording and retry', headers={'Retry-After': '5'})
            try:
                transcript, words, metadata = await recognize(waveform, playback_wav(waveform), language,
                    provider, recognition_mode, transcriber=transcribe_recording)
                quality['recognition'] = metadata
            finally:
                _recognition_capacity.release()
        except ModelUnavailableError:
            error_code = "asr_model_unavailable"
        except InvalidAudioError:
            error_code = "no_transcript"
    else:
        quality['recognition']={'state':'skipped_for_direct_audio_feedback'}
    # Serialize finalization with withdrawal so no retained object escapes its deletion queue.
    await lock_learner(db, user, learner_id)
    consent = await require_practice_consent(db, learner_id)
    if provider not in ['local_whisper','adapted_english'] and not consent.cloud_processing_allowed:
        raise HTTPException(403, 'Cloud processing permission was withdrawn')
    live_call=None
    if live_call_id:
        from models.speech_workflow import LiveCall
        live_call=await db.get(LiveCall,live_call_id)
        if not live_call or live_call.learner_id!=learner_id or learner.owner_id!=user.id:
            raise HTTPException(404,'Daily conversation not found')
        if live_call.language!=language or live_call.mode not in ['conversation','daily_moment'] or task!='conversation':
            raise HTTPException(422,'Daily audio must match the conversation language and mode')
    key = await run_in_threadpool(storage.retain, playback_wav(waveform)) if consent.retain_audio_allowed else None
    record = SpeechRecording(id=uuid.uuid4(), learner_id=learner_id, submitted_by=user.id, attempt_id=attempt_id,
        language=language, task=task, expected_text=expected_text, transcript=transcript, words=words,
        duration_seconds=round(waveform.size / SAMPLE_RATE, 3), quality=quality, audio_sha256=digest,
        storage_key=key, recognition_model=quality.get('recognition', {}).get('model') if transcript else None,
        recognition_error=error_code, review_status="pending")
    db.add(record)
    if live_call:
        from models.speech_workflow import CallRecording
        from learners.daily_observations import schedule
        if consent.cloud_processing_allowed and key:schedule(record,live_call.id,transcript_hint)
        db.add(CallRecording(call_id=live_call.id,recording_id=record.id,linked_by=user.id))
    queue_workflow(db, learner_id, user.id, 'recording', record.id, {'language': language, 'task': task,
        'duration_seconds': record.duration_seconds, 'source': 'recorded_attempt_not_automatic_grade'})
    try:
        await db.commit()
        await db.refresh(record)
    except IntegrityError:
        await db.rollback()
        if key:
            await run_in_threadpool(storage.remove, key)
        prior = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id,
            SpeechRecording.attempt_id == attempt_id))).scalar_one_or_none()
        if prior and (prior.audio_sha256, prior.language, prior.task, prior.expected_text) == (digest, language, task, expected_text) and prior.quality.get('recognition_provider', 'local_whisper') == provider and prior.quality.get('recognition_mode', 'selected_language') == recognition_mode and prior.quality.get('dialect', 'unspecified') == dialect:
            return recording_data(prior)
        raise HTTPException(409, 'A concurrent request used this attempt identifier; reload and retry')
    except Exception:
        await db.rollback()
        if key:
            await run_in_threadpool(storage.remove, key)
        raise
    return recording_data(record)


@router.get("/learners/{learner_id}/recordings")
async def recordings(learner_id: uuid.UUID, limit: int = 50, offset: int = 0,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    if not 1 <= limit <= 100 or not 0 <= offset <= 100000:
        raise HTTPException(422, "Invalid pagination")
    result = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id)
        .order_by(SpeechRecording.created_at.desc()).offset(offset).limit(limit))).scalars().all()
    return [recording_data(record) for record in result]


async def authorized_recording(db, user, recording_id):
    record = await db.get(SpeechRecording, recording_id)
    if record is None:
        raise HTTPException(404, "Recording not found")
    await accessible_learner(db, user, record.learner_id)
    return record


@router.get('/recordings/{recording_id}')
async def get_recording(recording_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return recording_data(await authorized_recording(db, user, recording_id))


@router.get("/recordings/{recording_id}/audio")
async def recording_audio(recording_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await authorized_recording(db, user, recording_id)
    consent = await require_practice_consent(db, record.learner_id)
    if not consent.retain_audio_allowed or not record.storage_key:
        raise HTTPException(404, "Recording is not retained or retention permission was withdrawn")
    data = await run_in_threadpool(storage.read, record.storage_key)
    return Response(data, media_type="audio/wav", headers={"Cache-Control": "no-store",
        "Content-Disposition": f'inline; filename="{record.id}.wav"', "X-Content-Type-Options": "nosniff"})


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    sound: str = Field(min_length=1, max_length=16)
    supersedes_review_id: uuid.UUID | None = None
    proposal_id: uuid.UUID | None = None
    outcome: Literal["independent", "supported", "difficulty", "uncertain"]
    context: Literal["sound", "syllable", "word", "sentence", "conversation", "listening"]
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    intended_text: str = Field(default="", max_length=2000)
    notes: str = Field(min_length=1, max_length=1500)
    expected_phone: str | None = Field(default=None, min_length=1, max_length=16)
    produced_phone: str | None = Field(default=None, max_length=16)
    error_category: Literal['substitution', 'omission', 'distortion', 'uncertain'] | None = None

    @model_validator(mode="after")
    def ordered_segment(self):
        if self.end_seconds <= self.start_seconds:
            raise ValueError("Review segment must end after it starts")
        if self.error_category and self.outcome == 'independent':
            raise ValueError('An independent outcome cannot carry a sound-error label')
        if self.outcome == 'uncertain' and self.error_category not in [None, 'uncertain']:
            raise ValueError('An uncertain outcome cannot carry a definitive sound-error category')
        if self.error_category in ['substitution', 'omission', 'distortion'] and not self.expected_phone:
            raise ValueError('A categorized sound error requires an explicitly reviewed expected phone')
        if self.error_category == 'substitution' and not self.produced_phone:
            raise ValueError('A substitution requires the explicitly reviewed produced phone')
        return self


@router.post("/recordings/{recording_id}/reviews", status_code=201)
async def review_recording(recording_id: uuid.UUID, payload: ReviewRequest,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await authorized_recording(db, user, recording_id)
    await lock_learner(db, user, record.learner_id)
    await clinician_access(db, user, record.learner_id)
    await require_practice_consent(db, record.learner_id)
    if payload.supersedes_review_id:
        previous = await db.get(RecordingReview, payload.supersedes_review_id)
        if not previous or previous.recording_id != record.id:
            raise HTTPException(404, 'Previous review is not part of this recording')
        replacement = (await db.execute(select(RecordingReview.id).where(
            RecordingReview.supersedes_review_id == previous.id))).scalar_one_or_none()
        if replacement:
            raise HTTPException(409, 'This review has already been revised; reload the latest version')
    if payload.end_seconds > record.duration_seconds + .01:
        raise HTTPException(422, "Review segment exceeds the recording duration")
    if payload.proposal_id:
        proposal = await db.get(AcousticProposal, payload.proposal_id)
        if not proposal or proposal.recording_id != record.id:
            raise HTTPException(404, 'Audio proposal not found for this recording')
        if proposal.decision != 'pending':
            raise HTTPException(409, 'This audio proposal already has a decision')
        proposal.decision = 'reviewed'; proposal.decided_by = user.id
        proposal.decision_note = payload.notes; proposal.decided_at = datetime.now(timezone.utc)
    review = RecordingReview(recording_id=record.id, reviewer_id=user.id, **payload.model_dump())
    db.add(review)
    await db.flush()
    record.review_status = "reviewed"
    db.add(GraphOutbox(learner_id=record.learner_id, reviewer_id=user.id, payload={
        "attempt_id": str(review.id), "recording_id": str(record.id), "sound": payload.sound,
        "language": record.language, "outcome": payload.outcome, "context": payload.context,
        "notes": payload.notes, "start_seconds": payload.start_seconds, "end_seconds": payload.end_seconds,
        **({'supersedes_review_id': str(payload.supersedes_review_id)} if payload.supersedes_review_id else {}),
        **{name: value for name, value in {'expected_phone': payload.expected_phone,
            'produced_phone': payload.produced_phone, 'error_category': payload.error_category}.items() if value is not None}}))
    await db.commit()
    return {"id": str(review.id), "source": "clinician_review", "graph_sync": "pending"}


@router.get("/recordings/{recording_id}/reviews")
async def recording_reviews(recording_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await authorized_recording(db, user, recording_id)
    rows = (await db.execute(select(RecordingReview).where(RecordingReview.recording_id == record.id)
                            .order_by(RecordingReview.created_at.desc()))).scalars().all()
    superseded = {row.supersedes_review_id for row in rows if row.supersedes_review_id}
    return [{"id": str(row.id), "sound": row.sound, "outcome": row.outcome, "context": row.context,
             "expected_phone": row.expected_phone, "produced_phone": row.produced_phone, "error_category": row.error_category,
             "notes": row.notes, "intended_text": row.intended_text, "start_seconds": row.start_seconds,
             "end_seconds": row.end_seconds, "source": "clinician_review", "reviewer_id": str(row.reviewer_id),
             "created_at": row.created_at.isoformat(), "superseded": row.id in superseded,
             'proposal_id': str(row.proposal_id) if row.proposal_id else None,
             "supersedes_review_id": str(row.supersedes_review_id) if row.supersedes_review_id else None} for row in rows]


@router.get('/recordings/{recording_id}/assessment')
async def reviewed_assessment(recording_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await authorized_recording(db, user, recording_id)
    reviews = (await db.execute(select(RecordingReview).where(RecordingReview.recording_id == record.id)
        .where(current_review_filter()).order_by(RecordingReview.created_at.desc()).limit(100))).scalars().all()
    latest = {}
    superseded = {review.supersedes_review_id for review in reviews if review.supersedes_review_id}
    for review in reviews:
        if review.id in superseded:
            continue
        latest.setdefault((review.sound, review.context, review.start_seconds, review.end_seconds), review)
    segments = []
    for review in latest.values():
        history = (await db.execute(select(RecordingReview).join(SpeechRecording, SpeechRecording.id == RecordingReview.recording_id)
            .where(SpeechRecording.learner_id == record.learner_id, SpeechRecording.language == record.language,
                   RecordingReview.sound == review.sound, RecordingReview.context == review.context)
            .where(current_review_filter())
            .order_by(RecordingReview.created_at.desc()).limit(100))).scalars().all()
        per_record = {}
        replaced = {past.supersedes_review_id for past in history if past.supersedes_review_id}
        for past in history:
            if past.id in replaced:
                continue
            per_record.setdefault(past.recording_id, past)
            if len(per_record) >= 5:
                break
        difficulty = [past for past in per_record.values() if past.outcome == 'difficulty']
        goals = (await db.execute(select(CareGoal).where(CareGoal.learner_id == record.learner_id,
            CareGoal.sound == review.sound, CareGoal.language == record.language, CareGoal.active.is_(True)).limit(5))).scalars().all()
        segments.append({'review_id': str(review.id), 'reviewer_id': str(review.reviewer_id),
            'start_seconds': review.start_seconds, 'end_seconds': review.end_seconds, 'sound': review.sound,
            'context': review.context, 'outcome': review.outcome, 'expected_phone': review.expected_phone,
            'produced_phone': review.produced_phone, 'error_category': review.error_category, 'notes': review.notes,
            'repeated_reviewed_difficulty': len(difficulty) >= 2,
            'supporting_review_ids': [str(past.id) for past in difficulty],
            'approved_guidance': [{'goal_id': str(goal.id), 'instruction': goal.instruction,
                'word': goal.practice_word, 'source': 'clinician_authored'} for goal in goals] if review.outcome == 'difficulty' else []})
    return {'schema_version': 'reviewed-segments-v1', 'recording_id': str(record.id), 'language': record.language,
        'interpretation_context': {'age_at_recording': record.quality.get('learner_age_at_recording'),
            'dialect': record.quality.get('dialect', 'unspecified'), 'dialect_source': 'participant_or_supporter_report'},
        'abstention': {'automatic_sound_judgement': True, 'reason': 'No released assessor has validated age, language and dialect coverage'},
        'source': 'clinician_review', 'segments': segments, 'automatic_phoneme_assessor': 'not_released',
        'state': 'reviewed' if segments else 'awaiting_clinician_review', 'pronunciation_score': None,
        'limitations': 'Recognition text and word/chunk timestamps are not phoneme-error evidence. Human annotations are attributable observations, not an automated diagnosis.'}


class GoalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)
    sound: str = Field(min_length=1, max_length=16)
    language: Literal["en", "hi", "ml"]
    practice_word: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=1500)
    phase: Literal["establishment", "generalization", "maintenance"]


@router.post("/learners/{learner_id}/goals", status_code=201)
async def create_goal(learner_id: uuid.UUID, payload: GoalRequest,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await lock_learner(db, user, learner_id)
    await clinician_access(db, user, learner_id)
    await require_practice_consent(db, learner_id)
    goal = CareGoal(learner_id=learner_id, clinician_id=user.id, **payload.model_dump())
    db.add(goal)
    await db.flush()
    queue_workflow(db, learner_id, user.id, 'goal', goal.id, {'label': goal.title, 'word': goal.practice_word,
        'sound': goal.sound, 'language': goal.language, 'instruction': goal.instruction, 'active': True, 'source': 'clinician_authored'})
    await db.commit()
    return {"id": str(goal.id), "review_status": "clinician_authored"}


@router.get("/learners/{learner_id}/goals")
async def goals(learner_id: uuid.UUID, include_evidence: bool = False,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    result = (await db.execute(select(CareGoal).where(CareGoal.learner_id == learner_id, CareGoal.active.is_(True))
                              .order_by(CareGoal.created_at.desc()))).scalars().all()
    items = [{"id": str(goal.id), "title": goal.title, "sound": goal.sound, "language": goal.language,
             "practice_word": goal.practice_word, "instruction": goal.instruction, "phase": goal.phase,
             "review_status": "clinician_authored", "clinician_id": str(goal.clinician_id)} for goal in result]
    if include_evidence:
        rows = (await db.execute(select(RecordingReview, SpeechRecording.language).join(SpeechRecording,
            SpeechRecording.id == RecordingReview.recording_id).where(SpeechRecording.learner_id == learner_id,
                current_review_filter()).order_by(RecordingReview.created_at.desc()).limit(201))).all()
        for item in items:
            evidence, seen = [], set()
            for review, language in rows[:200]:
                key = (review.recording_id, review.context)
                if language != item['language'] or review.sound != item['sound'] or key in seen:
                    continue
                seen.add(key)
                evidence.append({'review_id': str(review.id), 'recording_id': str(review.recording_id),
                    'outcome': review.outcome, 'context': review.context, 'created_at': review.created_at.isoformat()})
                if len(evidence) >= 5:
                    break
            item.update(review_evidence=evidence, evidence_scope_limited=len(rows) > 200,
                choice_source='clinician_authored_goal_with_recent_human_evidence')
    return items


@router.patch("/goals/{goal_id}/archive")
async def archive_goal(goal_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    goal = await db.get(CareGoal, goal_id)
    if goal is None:
        raise HTTPException(404, "Goal not found")
    await lock_learner(db, user, goal.learner_id)
    await clinician_access(db, user, goal.learner_id)
    await db.refresh(goal)
    if not goal.active:
        return {'active': False, 'already_archived': True}
    goal.active = False
    goal.archived_by = user.id
    goal.archived_at = datetime.now(timezone.utc)
    queue_workflow(db, goal.learner_id, user.id, 'goal', goal.id, {'label': goal.title, 'word': goal.practice_word,
        'sound': goal.sound, 'language': goal.language, 'instruction': goal.instruction, 'active': False, 'source': 'clinician_authored'})
    await db.commit()
    return {"active": False}


@router.get("/learners/{learner_id}/care-summary")
async def care_summary(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    records = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id)
        .order_by(SpeechRecording.created_at.desc()).limit(1000))).scalars().all()
    review_rows = (await db.execute(select(RecordingReview, SpeechRecording.language).join(SpeechRecording,
        SpeechRecording.id == RecordingReview.recording_id).where(SpeechRecording.learner_id == learner_id)
        .where(current_review_filter()).order_by(RecordingReview.created_at.desc()).limit(1000))).all()
    reviews = [row[0] for row in review_rows]
    latest = {}
    superseded = {review.supersedes_review_id for review in reviews if review.supersedes_review_id}
    for review in reviews:
        if review.id in superseded:
            continue
        latest.setdefault((review.recording_id, review.sound, review.context), review)
    counts = {outcome: sum(review.outcome == outcome for review in latest.values())
              for outcome in ("independent", "supported", "difficulty", "uncertain")}
    targets, days = {}, {}
    languages = {review.recording_id: language for review, language in review_rows}
    segments = {}
    for review in reviews:
        key = (review.recording_id, review.sound, review.context, review.start_seconds, review.end_seconds, review.intended_text)
        segments.setdefault(key, []).append(review)
    differences = [{'recording_id': str(key[0]), 'sound': key[1], 'context': key[2],
        'start_seconds': key[3], 'end_seconds': key[4], 'intended_text': key[5],
        'reviews': [{'review_id': str(row.id), 'reviewer_id': str(row.reviewer_id), 'outcome': row.outcome,
            'created_at': row.created_at.isoformat()} for row in group],
        'reason': 'Different current human outcomes for the same marked segment; inspect the recording and review context'}
        for key, group in segments.items() if len({row.outcome for row in group}) > 1]
    for review in latest.values():
        key = (languages.get(review.recording_id), review.sound, review.context)
        item = targets.setdefault(key, {"language": key[0], "sound": review.sound, "context": review.context,
            "outcomes": {outcome: 0 for outcome in counts}})
        item['outcomes'][review.outcome] += 1
        day = review.created_at.date().isoformat()
        days.setdefault(day, {outcome: 0 for outcome in counts})[review.outcome] += 1
    return {"recordings": len(records), "pending_reviews": sum(record.review_status == "pending" for record in records),
            "reviewed_outcomes": counts, "source": "recorded_activity_and_clinician_reviews",
            'review_differences': differences,
            "targets": list(targets.values()), "review_timeline": [{"date": day, "outcomes": days[day]} for day in sorted(days)[-30:]],
            "truncated": len(records) == 1000 or len(reviews) == 1000,
            "timeline": [{"id": str(record.id), "created_at": record.created_at.isoformat(),
                          "language": record.language, "task": record.task, "review_status": record.review_status} for record in records[:30]]}


@router.get('/clinical/learners/{learner_id}/activity')
async def clinical_activity(learner_id: uuid.UUID, days: int=Query(30,ge=1,le=30),
    user: User=Depends(get_current_user), db: AsyncSession=Depends(get_db)):
    await clinician_access(db,user,learner_id)
    from models.experience import GameSession, FamilyMission
    from models.guided_practice import GuidedPracticeSession
    from models.speech_workflow import LiveCall
    end=datetime.now(timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)+timedelta(days=1)
    start=end-timedelta(days=days)
    sources=[('recordings',SpeechRecording,SpeechRecording.created_at,None),
        ('games',GameSession,GameSession.completed_at,GameSession.completed.is_(True)),
        ('exercise_stages',GuidedPracticeSession,GuidedPracticeSession.completed_at,None),
        ('calls',LiveCall,LiveCall.ended_at,LiveCall.status=='completed'),
        ('family_reports',FamilyMission,FamilyMission.completed_at,None)]
    totals={key:0 for key,*_ in sources};previous={key:0 for key in totals};timeline={};truncated=False
    for key,model,column,condition in sources:
        query=select(column).where(model.learner_id==learner_id,column>=start-timedelta(days=days),column<end)
        if condition is not None:query=query.where(condition)
        times=(await db.execute(query.order_by(column.desc()).limit(10001))).scalars().all()
        truncated|=len(times)>10000
        for timestamp in times[:10000]:
            if timestamp.tzinfo is None:timestamp=timestamp.replace(tzinfo=timezone.utc)
            if timestamp<start:
                previous[key]+=1;continue
            date=timestamp.astimezone(timezone.utc).date().isoformat()
            timeline.setdefault(date,{name:0 for name in totals})[key]+=1;totals[key]+=1
    return {'days':days,'timezone':'UTC','totals':totals,'previous_totals':previous,
        'period_start':start.date().isoformat(),'period_end':end.date().isoformat(),
        'timeline':[{'date':date,'counts':timeline[date]} for date in sorted(timeline)],
        'truncated':truncated,'source':'persisted_activity_only','clinical_assessment':False}


@router.get('/learners/{learner_id}/care-report')
async def care_report(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    learner = await accessible_learner(db, user, learner_id)
    overview = await care_summary(learner_id, user, db)
    records = (await db.execute(select(SpeechRecording).where(SpeechRecording.learner_id == learner_id)
        .order_by(SpeechRecording.created_at.desc()).limit(1001))).scalars().all()
    reviews = (await db.execute(select(RecordingReview).join(SpeechRecording,
        SpeechRecording.id == RecordingReview.recording_id).where(SpeechRecording.learner_id == learner_id)
        .order_by(RecordingReview.created_at.desc()).limit(1001))).scalars().all()
    plan = (await db.execute(select(CareGoal).where(CareGoal.learner_id == learner_id)
        .order_by(CareGoal.created_at.desc()).limit(501))).scalars().all()
    from models.care_report import AICareReport
    from learners.ai_care_reports import public as public_ai_report
    ai_report=(await db.execute(select(AICareReport).where(AICareReport.learner_id==learner_id).order_by(AICareReport.created_at.desc()).limit(1))).scalar_one_or_none()
    return {'schema_version': 'care-report-v1', 'generated_at': datetime.now(timezone.utc).isoformat(),
        'ai_review':public_ai_report(ai_report) if ai_report else None,
        'exported_by': str(user.id), 'learner': {'id': str(learner.id), 'name': learner.display_name,
            'age': learner.age, 'language': learner.language}, 'summary': overview,
        'interpretation': 'Participation is distinct from clinician-assessed outcomes. Uncertain, supported, independent and difficult attempts remain separate. No automated diagnosis or validated automatic sound score is included.',
        'recordings': [recording_data(record) for record in records[:1000]],
        'reviews': [{'id': str(row.id), 'recording_id': str(row.recording_id), 'reviewer_id': str(row.reviewer_id),
            'sound': row.sound, 'context': row.context, 'outcome': row.outcome, 'notes': row.notes,
            'start_seconds': row.start_seconds, 'end_seconds': row.end_seconds, 'intended_text': row.intended_text,
            'expected_phone': row.expected_phone, 'produced_phone': row.produced_phone, 'error_category': row.error_category,
            'supersedes_review_id': str(row.supersedes_review_id) if row.supersedes_review_id else None,
            'proposal_id': str(row.proposal_id) if row.proposal_id else None,
            'created_at': row.created_at.isoformat(), 'source': 'clinician_review'} for row in reviews[:1000]],
        'goals': [{'id': str(row.id), 'title': row.title, 'sound': row.sound, 'language': row.language,
            'word': row.practice_word, 'instruction': row.instruction, 'phase': row.phase, 'active': row.active,
            'clinician_id': str(row.clinician_id), 'created_at': row.created_at.isoformat()} for row in plan[:500]],
        'truncated': len(records) > 1000 or len(reviews) > 1000 or len(plan) > 500,
        'audio_included': False}
