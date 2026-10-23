"""Collect late provider transcripts, then durably queue remote cleanup."""
from sqlalchemy import select
from database import AsyncSessionLocal
from models.speech_workflow import LiveCall
from learners.live_calls import finalize_call


async def finalize_live_calls():
    failed = False
    async with AsyncSessionLocal() as db:
        ids = (await db.execute(select(LiveCall.id).where(LiveCall.status == 'finalizing')
            .order_by(LiveCall.ended_at).limit(10))).scalars().all()
    for identifier in ids:
        async with AsyncSessionLocal() as db:
            try:
                await finalize_call(db, identifier)
            except Exception:
                await db.rollback()
                failed = True
                # Preserve references for the next cycle. Never log voice data,
                # transcripts, credentials, or raw provider response bodies.
    if failed:
        raise RuntimeError('Some call finalizations failed and remain queued for retry')
    return len(ids)
