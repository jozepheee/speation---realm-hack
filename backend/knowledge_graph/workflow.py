"""Queue scoped graph links in the same SQL transaction as their source record."""
from datetime import datetime, timezone
from models.care import GraphOutbox


def queue_workflow(db, learner_id, actor_id, kind, entity_id, properties):
    if kind not in ['goal', 'recording', 'cycle', 'transfer']:
        raise ValueError('Unsupported workflow graph event')
    db.add(GraphOutbox(learner_id=learner_id, reviewer_id=actor_id, payload={'workflow_event': {
        'kind': kind, 'entity_id': str(entity_id), 'properties': properties,
        'revision': datetime.now(timezone.utc).isoformat()}}))
