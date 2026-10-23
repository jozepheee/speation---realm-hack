"""Retry durable voice deletion; no raw reference audio is stored in this queue."""
import httpx
from sqlalchemy import select
from config import settings
from database import AsyncSessionLocal
from models.care import ProviderDeletion


async def purge_provider_voices():
    removed = 0
    failed = False
    async with AsyncSessionLocal() as db:
        pending = (await db.execute(select(ProviderDeletion).order_by(ProviderDeletion.created_at)
            .with_for_update(skip_locked=True).limit(10))).scalars().all()
        if not pending:
            return 0
        async with httpx.AsyncClient(timeout=15) as client:
            for item in pending:
                try:
                    if item.provider_id.startswith('fish_ref:'):
                        from learners import storage
                        from starlette.concurrency import run_in_threadpool
                        await run_in_threadpool(storage.remove,item.provider_id.removeprefix('fish_ref:'))
                        await db.delete(item);removed+=1
                        continue
                    if not settings.ELEVENLABS_API_KEY:
                        failed=True
                        continue
                    resources = {'voice': 'voices', 'agent': 'convai/agents', 'conversation': 'convai/conversations'}
                    if item.resource_type not in resources:
                        failed = True
                        continue
                    response = await client.delete(f'https://api.elevenlabs.io/v1/{resources[item.resource_type]}/{item.provider_id}',
                        headers={'xi-api-key': settings.ELEVENLABS_API_KEY})
                    if response.status_code != 404:
                        response.raise_for_status()
                    await db.delete(item)
                    removed += 1
                except (httpx.HTTPError,OSError,ValueError):
                    # A failed object remains tracked; other objects can still be removed.
                    failed = True
                    continue
        await db.commit()
    if failed:
        raise RuntimeError('Some provider deletions remain pending; successful deletions were committed')
    return removed
