"""Retry SQL-backed reviewed evidence without duplicating graph observations."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from models.care import GraphOutbox
from learners.access import latest_consent


async def deliver_reviews(db, graph, learner_id=None, limit=100):
    query = select(GraphOutbox).where(GraphOutbox.delivered_at.is_(None))
    if learner_id is not None:
        query = query.where(GraphOutbox.learner_id == learner_id)
    events = (await db.execute(query.order_by(GraphOutbox.created_at).limit(limit))).scalars().all()
    delivered = 0
    for event in events:
        consent = await latest_consent(db, event.learner_id)
        if not consent or not consent.practice_allowed:
            continue
        identifier = str(event.learner_id)
        if 'workflow_event' in event.payload:
            await graph.apply_workflow(identifier, str(event.reviewer_id), event.payload['workflow_event'])
            event.delivered_at = datetime.now(timezone.utc)
            await db.commit(); delivered += 1
            continue
        try:
            await graph.observe(identifier, str(event.reviewer_id), event.payload)
        except HTTPException as error:
            if error.status_code != 409:
                raise
            existing = await graph.query('MATCH (o:NNObservation {id: $id}) RETURN properties(o) AS properties',
                {'id': f"observation:{identifier}:{event.payload['attempt_id']}"})
            if not existing or any(existing[0]['properties'].get(key) != value for key, value in event.payload.items()):
                raise HTTPException(409, 'Existing graph observation differs from the recorded review')
        event.delivered_at = datetime.now(timezone.utc)
        await db.commit()
        delivered += 1
    return delivered
