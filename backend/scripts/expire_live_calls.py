"""Close abandoned call reservations and retry remote-resource cleanup."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, or_
from database import AsyncSessionLocal
from config import settings
from models.speech_workflow import LiveCall
from learners.live_calls import queue_cleanup


async def expire_live_calls():
    current = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        calls = (await db.execute(select(LiveCall).where(LiveCall.status.in_(['preparing', 'prepared', 'connected']),
            or_(LiveCall.last_seen_at < current - timedelta(seconds=120),
                LiveCall.created_at < current - timedelta(seconds=settings.LIVE_CALL_MAX_SECONDS + 30)))
            .with_for_update(skip_locked=True).limit(50))).scalars().all()
        for call in calls:
            queue_cleanup(db, call)
            call.status = 'expired'; call.ended_at = current
        await db.commit()
        return len(calls)
