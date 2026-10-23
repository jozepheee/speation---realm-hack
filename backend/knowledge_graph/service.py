"""Real Memgraph persistence. No catalog seeds, fallback graphs or synthetic evidence."""
from functools import lru_cache
from datetime import datetime, timezone
from neo4j import AsyncGraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable, SessionExpired
from fastapi import HTTPException
from config import settings


def graph_error(error):
    if isinstance(error, (ServiceUnavailable, SessionExpired)):
        return HTTPException(503, 'Memgraph is unavailable; no graph results were substituted')
    if 'constraint' in str(error).lower():
        return HTTPException(409, 'A graph record with this ID already exists')
    return HTTPException(503, 'Memgraph operation failed')


class GraphStore:
    def __init__(self, uri, user='', password='', production=False):
        if production and (not user or not password or not uri.startswith('bolt+s://')):
            raise RuntimeError('Production Memgraph requires credentials and a trusted TLS connection')
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password) if user else None,
            connection_timeout=5, max_connection_pool_size=10, max_transaction_retry_time=5)

    async def query(self, query, parameters=None, transaction=None):
        try:
            if transaction is not None:
                result = await transaction.run(query, parameters or {})
                return await result.data()
            async with self.driver.session() as session:
                result = await session.run(query, parameters or {})
                return await result.data()
        except (ServiceUnavailable, SessionExpired, Neo4jError) as error:
            raise graph_error(error) from error

    async def initialize(self):
        for label in ('NNLearner', 'NNObservation', 'NNTarget', 'NNCue', 'NNGoal', 'NNAttempt', 'NNCycle', 'NNTransfer'):
            await self.query(f'CREATE INDEX ON :{label}(id)')
            await self.query(f'CREATE CONSTRAINT ON (n:{label}) ASSERT n.id IS UNIQUE')

    async def ready(self):
        return bool(await self.query('RETURN 1 AS ready'))

    async def close(self):
        await self.driver.close()

    async def snapshot(self, learner_id):
        nodes = await self.query('MATCH (n) WHERE n.learner_id = $learner_id '
            'AND (n:NNLearner OR n:NNObservation OR n:NNTarget OR n:NNCue OR n:NNGoal OR n:NNAttempt OR n:NNCycle OR n:NNTransfer) '
            'RETURN properties(n) AS properties, labels(n) AS labels LIMIT 500', {'learner_id': learner_id})
        edges = await self.query(
            'MATCH (a)-[r]->(b) WHERE a.learner_id = $learner_id AND b.learner_id = $learner_id '
            'AND (a:NNLearner OR a:NNObservation OR a:NNTarget OR a:NNCue OR a:NNGoal OR a:NNAttempt OR a:NNCycle OR a:NNTransfer) '
            'AND (b:NNLearner OR b:NNObservation OR b:NNTarget OR b:NNCue OR b:NNGoal OR b:NNAttempt OR b:NNCycle OR b:NNTransfer) '
            'RETURN a.id AS source, b.id AS target, type(r) AS relation LIMIT 1000', {'learner_id': learner_id})
        return {'nodes': [{'id': row['properties']['id'], 'type': row['properties']['type'],
                           **row['properties']} for row in nodes], 'edges': edges,
                'backend': 'memgraph', 'persisted': True, 'limit': 500,
                'truncated': len(nodes) == 500 or len(edges) == 1000}

    async def observe(self, learner_id, reviewer_id, payload):
        # The observation and its evidence/version edges commit together. A retry
        # must never encounter a saved node whose relationship writes failed.
        try:
            async with self.driver.session() as session:
                async with await session.begin_transaction() as transaction:
                    result = await self._observe(learner_id, reviewer_id, payload, transaction)
                    await transaction.commit()
                    return result
        except (ServiceUnavailable, SessionExpired, Neo4jError) as error:
            # Memgraph may report uniqueness only at commit, after all writes.
            # Outbox deduplication must receive the same 409 as statement errors.
            raise graph_error(error) from error

    async def _observe(self, learner_id, reviewer_id, payload, transaction):
        properties = {**payload, 'id': f"observation:{learner_id}:{payload['attempt_id']}",
            'learner_id': learner_id, 'type': 'observation', 'source': 'clinician_review',
            'reviewer_id': reviewer_id, 'recorded_at': datetime.now(timezone.utc).isoformat()}
        target_id = f"target:{learner_id}:{payload['language']}:{payload['sound']}"
        await self.query('MERGE (l:NNLearner {id: $learner_id}) '
            'SET l.learner_id = $learner_id, l.type = "learner" '
            'MERGE (t:NNTarget {id: $target_id}) '
            'SET t.learner_id = $learner_id, t.type = "target", t.sound = $sound, t.language = $language '
            'CREATE (o:NNObservation) SET o = $properties '
            'MERGE (l)-[:HAS_OBSERVATION]->(o) MERGE (l)-[:HAS_TARGET]->(t) '
            'MERGE (o)-[:ABOUT]->(t)', {'learner_id': learner_id, 'target_id': target_id,
                'sound': payload['sound'], 'language': payload['language'], 'properties': properties}, transaction=transaction)
        if payload.get('recording_id'):
            await self.query('MATCH (o:NNObservation {id:$id, learner_id:$learner_id}) '
                'MERGE (a:NNAttempt {id:$recording_id}) SET a.learner_id=$learner_id, a.type="recording" '
                'MERGE (o)-[:REVIEWS]->(a)', {'id': properties['id'], 'learner_id': learner_id,
                    'recording_id': f"recording:{learner_id}:{payload['recording_id']}"}, transaction=transaction)
        if payload.get('supersedes_review_id'):
            await self.query('MATCH (o:NNObservation {id:$id, learner_id:$learner_id}), '
                '(previous:NNObservation {id:$previous_id, learner_id:$learner_id}) '
                'SET previous.superseded=true MERGE (previous)-[:SUPERSEDED_BY]->(o)',
                {'id': properties['id'], 'learner_id': learner_id,
                    'previous_id': f"observation:{learner_id}:{payload['supersedes_review_id']}"}, transaction=transaction)
        return properties

    async def apply_workflow(self, learner_id, actor_id, event):
        labels = {'goal': 'NNGoal', 'recording': 'NNAttempt', 'cycle': 'NNCycle', 'transfer': 'NNTransfer'}
        kind = event['kind']
        if kind not in labels:
            raise ValueError('Unsupported graph workflow entity')
        properties = {key: value for key, value in event['properties'].items() if value is not None and isinstance(value, (str, int, float, bool))}
        properties.update(id=f"{kind}:{learner_id}:{event['entity_id']}", learner_id=learner_id,
            type=kind, actor_id=actor_id, updated_at=event['revision'])
        parameters = {'learner_id': learner_id, 'id': properties['id'], 'properties': properties, 'revision': event['revision']}
        # Only the fixed label map enters Cypher. IDs and evidence are parameters.
        await self.query(f'MERGE (n:{labels[kind]} {{id:$id}}) '
            'WITH n WHERE n.updated_at IS NULL OR n.updated_at <= $revision SET n += $properties '
            'MERGE (l:NNLearner {id:$learner_id}) SET l.learner_id=$learner_id, l.type="learner" '
            'MERGE (l)-[:HAS_EVIDENCE]->(n)', parameters)
        if properties.get('goal_id'):
            await self.query('MATCH (n {id:$id, learner_id:$learner_id}) '
                'MERGE (g:NNGoal {id:$goal_id}) SET g.learner_id=$learner_id, g.type="goal" '
                'MERGE (n)-[:PRACTICES]->(g)', {**parameters, 'goal_id': f"goal:{learner_id}:{properties['goal_id']}"})
        if properties.get('reviewed_cue_used') and properties.get('goal_id'):
            await self.query('MATCH (n {id:$id, learner_id:$learner_id}), '
                '(c:NNCue {id:$cue_id, learner_id:$learner_id}) '
                'MERGE (n)-[r:REPORTED_CUE_USE]->(c) SET r.source="participant_or_supporter_report"',
                {**parameters, 'cue_id': f"cue:{learner_id}:goal:{properties['goal_id']}"})
        if properties.get('recording_id') and kind != 'recording':
            await self.query('MATCH (n {id:$id, learner_id:$learner_id}) '
                'MERGE (a:NNAttempt {id:$recording_id}) SET a.learner_id=$learner_id, a.type="recording" '
                'MERGE (n)-[:HAS_RECORDING]->(a)', {**parameters, 'recording_id': f"recording:{learner_id}:{properties['recording_id']}"})
        if kind == 'goal' and properties.get('sound') and properties.get('language'):
            target_id = f"target:{learner_id}:{properties['language']}:{properties['sound']}"
            await self.query('MATCH (g:NNGoal {id:$id, learner_id:$learner_id}) '
                'MERGE (t:NNTarget {id:$target_id}) SET t.learner_id=$learner_id, t.type="target", t.sound=$sound, t.language=$language '
                'MERGE (g)-[:TARGETS]->(t) MERGE (c:NNCue {id:$cue_id}) '
                'WITH g,t,c WHERE c.updated_at IS NULL OR c.updated_at <= $revision '
                'SET c.learner_id=$learner_id, c.type="cue", c.goal_id=$entity_id, c.language=$language, '
                'c.label=$label, c.instruction=$instruction, c.active=$active, c.review_status="clinician_authored", '
                'c.recorded_at=$revision, c.updated_at=$revision '
                'MERGE (l:NNLearner {id:$learner_id}) MERGE (l)-[:HAS_CUE]->(c) MERGE (c)-[:TARGETS]->(t)',
                {**parameters, 'target_id': target_id, 'cue_id': f"cue:{learner_id}:goal:{event['entity_id']}",
                    'entity_id': event['entity_id'], 'sound': properties['sound'], 'language': properties['language'],
                    'label': properties.get('label', ''), 'instruction': properties.get('instruction', ''), 'active': properties.get('active', False)})

    async def add_cue(self, learner_id, reviewer_id, cue_id, payload):
        properties = {**payload, 'id': f'cue:{learner_id}:{cue_id}', 'learner_id': learner_id,
            'type': 'cue', 'reviewer_id': reviewer_id, 'review_status': 'clinician_authored',
            'recorded_at': datetime.now(timezone.utc).isoformat()}
        target_id = f"target:{learner_id}:{payload['language']}:{payload['sound']}"
        await self.query('MERGE (l:NNLearner {id: $learner_id}) '
            'SET l.learner_id = $learner_id, l.type = "learner" '
            'MERGE (t:NNTarget {id: $target_id}) '
            'SET t.learner_id = $learner_id, t.type = "target", t.sound = $sound, t.language = $language '
            'CREATE (c:NNCue) SET c = $properties '
            'MERGE (l)-[:HAS_CUE]->(c) MERGE (l)-[:HAS_TARGET]->(t) MERGE (c)-[:TARGETS]->(t)',
            {'learner_id': learner_id, 'target_id': target_id, 'sound': payload['sound'],
             'language': payload['language'], 'properties': properties})
        return properties

    async def retire_cue(self, learner_id, reviewer_id, cue_id, reason):
        rows = await self.query('MATCH (c:NNCue {id:$cue_id, learner_id:$learner_id}) '
            'SET c.active=false, c.archived_by=coalesce(c.archived_by,$reviewer_id), '
            'c.archived_at=coalesce(c.archived_at,$now), c.retirement_reason=coalesce(c.retirement_reason,$reason), '
            'c.updated_at=$now RETURN properties(c) AS properties',
            {'cue_id': cue_id, 'learner_id': learner_id, 'reviewer_id': reviewer_id,
                'reason': reason, 'now': datetime.now(timezone.utc).isoformat()})
        if not rows:
            raise HTTPException(404, 'Reviewed cue not found')
        return rows[0]['properties']

@lru_cache(maxsize=1)
def get_graph():
    try:
        return GraphStore(settings.MEMGRAPH_URI, settings.MEMGRAPH_USER, settings.MEMGRAPH_PASSWORD,
                          settings.APP_ENV == 'production')
    except (RuntimeError, ValueError) as error:
        raise HTTPException(503, 'Memgraph configuration is incomplete') from error
