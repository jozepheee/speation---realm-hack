"""Run durable graph delivery and recording deletion; supervise in deployment."""
import argparse
import asyncio
import logging
import time
from database import AsyncSessionLocal, engine
from knowledge_graph.service import get_graph
from knowledge_graph.outbox import deliver_reviews
from scripts.purge_audio import purge
from scripts.purge_provider_voices import purge_provider_voices
from scripts.expire_live_calls import expire_live_calls
from scripts.finalize_live_calls import finalize_live_calls
from scripts.worker_health import save as save_health
from learners.rehearsal_sounds import drain as review_rehearsal_sounds
from learners.daily_observations import drain as review_daily_observations

logger = logging.getLogger('care-worker')


async def main(once=False, health_file=None):
    states = {}
    async def graph_delivery():
        async with AsyncSessionLocal() as db:
            return await deliver_reviews(db, get_graph())

    async def run(name, action):
        while True:
            ok = False
            try:
                result = await action()
                logger.info('%s cycle completed: %s', name, result)
                ok = True
            except Exception:
                logger.error('%s cycle failed; pending work remains tracked for retry', name)
            states[name] = {'ok': ok, 'completed_at': time.time()}
            if health_file:
                try:
                    save_health(health_file, states)
                except OSError:
                    logger.error('Worker health file could not be updated')
            if once:
                return ok
            # Live meaning questions should not wait an extra 15s worker cycle.
            await asyncio.sleep(2 if name=='daily-observations' else 15)

    try:
        # Separate loops keep slow transcript processing or an unavailable graph
        # from delaying privacy deletions. Each action owns its SQL session.
        results = await asyncio.gather(run('audio-deletion', purge),
            run('provider-deletion', purge_provider_voices),
            run('call-expiration', expire_live_calls),
            run('call-finalization', finalize_live_calls),
            run('graph-delivery', graph_delivery),
            run('rehearsal-sounds', review_rehearsal_sounds),run('daily-observations',review_daily_observations))
        return all(results)
    finally:
        await engine.dispose()
        if get_graph.cache_info().currsize:
            await get_graph().close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--health-file', help='Writable local path for job completion health; no patient data')
    logging.basicConfig(level=logging.INFO)
    args = parser.parse_args()
    raise SystemExit(0 if asyncio.run(main(args.once, args.health_file)) else 1)
