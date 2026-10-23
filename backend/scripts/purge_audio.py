"""Drain the durable private-object deletion queue. Safe to run repeatedly."""
import asyncio
from sqlalchemy import select
from database import AsyncSessionLocal, engine
from models.care import StorageDeletion
from learners.storage import remove
from starlette.concurrency import run_in_threadpool


async def purge():
    async with AsyncSessionLocal() as db:
        pending = (await db.execute(select(StorageDeletion).order_by(StorageDeletion.created_at).limit(100))).scalars().all()
        count = 0
        for item in pending:
            await run_in_threadpool(remove, item.storage_key)
            await db.delete(item)
            await db.commit()
            count += 1
        return count


async def main():
    try:
        print(f"Private objects removed: {await purge()}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
