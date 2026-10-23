"""Durable, non-blocking English rehearsal audio review; never grade a transcript."""
import asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
from database import AsyncSessionLocal
from models.speaking import SpeakingRehearsal
from models.care import SpeechRecording
from models.user import User
from learners.access import accessible_learner, require_practice_consent

PENDING = {'queued', 'processing'}


def initial_check(record, enabled=True):
    if not enabled:
        return {'state': 'disabled', 'concerns': []}
    if not record.storage_key:
        return {'state': 'unavailable', 'summary': 'Audio was not retained for sound review.', 'concerns': []}
    return {'state': 'queued', 'concerns': []}


def summary(turns):
    checks = [t.get('sound_check') for t in turns if t.get('sound_check')]
    concerns = {}
    for turn in turns:
        for item in (turn.get('sound_check') or {}).get('concerns', []):
            # One practice card per word, preserving the source answer and interval.
            key = item['word'].casefold()
            concerns.setdefault(key, {**item, 'recording_id': turn['recording_id']})
    return {'pending': sum(c['state'] in PENDING for c in checks),
            'reviewed': sum(c['state'] in {'needs_confirmation', 'no_clear_difference', 'insufficient_evidence'} for c in checks),
            'unavailable': sum(c['state'] == 'unavailable' for c in checks),
            'concerns': list(concerns.values())[:12],
            'requires_confirmation': True,
            'scope': 'Tentative audio observations, not a verified phonetic transcription or a pronunciation grade.'}


async def inspect_audio(data, duration):
    from learners.acoustic_router import crop
    from learners.azure_pronunciation import assess
    from learners.pronunciation_reference import target_reference
    from learners.sound_teaching import provider_concerns,provider_clear
    concerns = []; states = []; models = []
    # Extended rehearsal answers are bounded to three minutes; cover every window.
    for start in range(0, min(180, int(duration) + 1), 20):
        end = min(duration, start + 20)
        if end <= start:
            continue
        clip = await run_in_threadpool(crop, data, start, end)
        provider=await asyncio.wait_for(assess(clip,'','en',unscripted=True),timeout=12)
        models.append('azure_pronunciation_assessment')
        if not provider or provider.get('state')!='provider_assessment':
            states.append('insufficient_evidence');continue
        # Provider words nominate candidates only. The learner must confirm the
        # intended word before any targeted correction is taught.
        text=' '.join(word['word'] for word in provider.get('words',[]))[:300]
        context={'language':'en','duration_seconds':end-start,'expected_text':text,
            'pronunciation_reference':await run_in_threadpool(target_reference,text,'en'),
            'dedicated_provider_assessment':provider}
        suggested=provider_concerns(context)
        states.append('tentative_observation' if suggested else 'no_clear_difference' if provider_clear(context) else 'insufficient_evidence')
        for concern in suggested:
            item = dict(concern)
            if not 0 <= item['start_seconds'] < item['end_seconds'] <= end-start:
                continue
            if not item['word'].strip() or len(item['word'].split()) != 1:
                continue
            if item['category'] == 'uncertain':
                continue
            item.update(start_seconds=start+item['start_seconds'], end_seconds=start+item['end_seconds'],
                        requires_confirmation=True, source='azure_unscripted_candidate_requires_intent_confirmation')
            concerns.append(item)
    concerns = list({c['word'].casefold(): c for c in concerns}.values())[:6]
    return {'state': 'needs_confirmation' if concerns else 'no_clear_difference' if states and all(s == 'no_clear_difference' for s in states) else 'insufficient_evidence',
            'summary': 'Confirm the intended word before practising a suggested sound.' if concerns else 'No supported sound target was identified; this does not establish perfect pronunciation.',
            'concerns': concerns, 'models': list(dict.fromkeys(models)), 'reviewed_seconds': min(duration, 180)}


async def process_one(identifier, factory=None):
    """Claim under a row lock, release SQL during provider work, then merge fresh JSON."""
    factory = factory or AsyncSessionLocal
    async with factory() as db:
        row = (await db.execute(select(SpeakingRehearsal).where(SpeakingRehearsal.id == identifier).with_for_update())).scalar_one_or_none()
        if not row or not row.content.get('sound_checks_pending'):
            return False
        now = datetime.now(timezone.utc)
        def eligible(turn):
            check = turn.get('sound_check') or {}
            if check.get('state') == 'queued': return True
            if check.get('state') == 'processing':
                return (now-datetime.fromisoformat(check['started_at'])).total_seconds() > 420
            return False
        target = next((t for t in row.content['turns'] if eligible(t)), None)
        if not target: return False
        rid = target['recording_id']; claim = str(uuid.uuid4()); actor = row.created_by; learner_id = row.learner_id
        row.content = {**row.content, 'turns': [{**t, 'sound_check': {'state': 'processing', 'started_at': now.isoformat(), 'claim': claim, 'concerns': []}} if t['recording_id'] == rid else t for t in row.content['turns']]}
        await db.commit()
        try:
            user = await db.get(User, actor)
            if not user: raise HTTPException(403)
            await accessible_learner(db, user, learner_id, owner_only=True)
            consent = await require_practice_consent(db, learner_id)
            record = await db.get(SpeechRecording, uuid.UUID(rid))
            if not consent.cloud_processing_allowed or not consent.retain_audio_allowed or not record or record.learner_id != learner_id or not record.storage_key:
                raise HTTPException(403)
            from learners import storage
            data = await run_in_threadpool(storage.read, record.storage_key)
            duration = record.duration_seconds
            await db.rollback()
            result = await asyncio.wait_for(inspect_audio(data, duration), timeout=380)
        except (HTTPException, OSError, ValueError, RuntimeError, TimeoutError):
            await db.rollback()
            result = {'state': 'unavailable', 'summary': 'Sound review was unavailable. Your answer and communication feedback are saved.', 'concerns': []}
        # Recheck consent after waiting; never save late findings after revocation.
        db.expire_all()
        row = (await db.execute(select(SpeakingRehearsal).where(SpeakingRehearsal.id == identifier).with_for_update())).scalar_one_or_none()
        if not row: return False
        try:
            user = await db.get(User, actor)
            if not user: raise HTTPException(403)
            await accessible_learner(db, user, learner_id, owner_only=True)
            consent = await require_practice_consent(db, learner_id)
            record = await db.get(SpeechRecording, uuid.UUID(rid), populate_existing=True)
            if not consent.cloud_processing_allowed or not consent.retain_audio_allowed or not record or not record.storage_key: raise HTTPException(403)
        except HTTPException:
            result = {'state': 'unavailable', 'summary': 'Audio review permission or recording is no longer available.', 'concerns': []}
        turns = [{**t, 'sound_check': result} if t['recording_id'] == rid and (t.get('sound_check') or {}).get('claim') == claim else t for t in row.content['turns']]
        row.content = {**row.content, 'turns': turns, 'sound_checks_pending': bool(summary(turns)['pending'])}
        if row.report is not None: row.report = {**row.report, 'sound_review': summary(turns)}
        await db.commit()
    return True


async def drain(factory=None):
    factory = factory or AsyncSessionLocal
    async with factory() as db:
        ids = (await db.execute(select(SpeakingRehearsal.id).where(
            SpeakingRehearsal.content['sound_checks_pending'].as_boolean() == True
        ).order_by(SpeakingRehearsal.created_at).limit(30))).scalars().all()
    # One bounded job per cycle, independent of the deletion and call workers.
    for identifier in ids:
        if await process_one(identifier, factory): return 1
    return 0
