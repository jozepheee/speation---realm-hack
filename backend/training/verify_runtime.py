"""Exercise trained scoring and scheduling with real audio in an isolated DB."""
import argparse
import asyncio
import json
from pathlib import Path
import uuid
import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
import models
from auth.dependencies import get_current_user
from database import Base, get_db
from fluency.router import router as fluency_router
from models.user import User
from scheduler.router import router as scheduler_router


async def verify(audio, output):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        user = User(id=uuid.uuid4(), email='runtime-verification@example.invalid')
        async with factory() as db:
            db.add(user)
            await db.commit()
        app = FastAPI()
        app.include_router(fluency_router, prefix='/fluency')
        app.include_router(scheduler_router, prefix='/scheduler')

        async def isolated_db():
            async with factory() as db:
                yield db

        app.dependency_overrides[get_db] = isolated_db
        app.dependency_overrides[get_current_user] = lambda: user
        files = {'audio': (audio.name, audio.read_bytes(), 'audio/wav')}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://verification') as client:
            baseline = await client.post('/fluency/score', files=files)
            baseline.raise_for_status()
            print('Real-audio baseline scored', flush=True)
            recommendation = await client.post('/scheduler/start', json={'difficulty': 1})
            recommendation.raise_for_status()
            rec = recommendation.json()
            recording = await client.post('/fluency/score', files=files, data={
                'trajectory_id': rec['trajectory_id'], 'mode': rec['mode'],
                'difficulty': str(rec['difficulty'])})
            recording.raise_for_status()
            score = recording.json()
            payload = {'trajectory_id': rec['trajectory_id'], 'score_id': score['score_id']}
            outcome = await client.post('/scheduler/outcome', json=payload)
            outcome.raise_for_status()
            repeated = await client.post('/scheduler/outcome', json=payload)
            assert repeated.json() == outcome.json()
            assert score['acoustic'] is None and score['semantic'] is None
            assert abs(score['acoustic_weight'] + score['semantic_weight'] - 1) < 1e-5
            result = {'audio': str(audio), 'database': 'isolated in-memory SQLite',
                      'authentication': 'test user dependency override',
                      'real_model_inference': True, 'baseline': baseline.json(),
                      'recommendation': rec, 'score': score, 'outcome': outcome.json(),
                      'repeated_outcome_idempotent': True}
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, indent=2))
            print('Verified real scoring, DQN recommendation and observed outcome; report:', output)
    finally:
        await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(verify(args.audio, args.out))
