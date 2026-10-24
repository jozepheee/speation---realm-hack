"""Check native agent creation/token/cleanup with synthetic text only; no audio calls."""
import asyncio
import json
import uuid
import re
from pathlib import Path
from fastapi import HTTPException
from config import settings
from database import AsyncSessionLocal, engine
from models.care import ProviderDeletion
from learners.live_calls import agent_configuration, provider


async def main():
    report = {'scope': 'synthetic_text_configuration_only_no_child_data_no_audio_call',
        'llm': settings.ELEVENLABS_AGENT_LLM, 'tts_model': settings.ELEVENLABS_AGENT_TTS_MODEL, 'languages': {}}
    try:
        for language in ['en', 'hi', 'ml']:
            agent_id = None
            result = {'agent_created': False, 'webrtc_token_received': False, 'provider_cleanup': 'not_needed'}
            try:
                configuration = agent_configuration(f'configuration-check-{uuid.uuid4()}', language,
                    'This is a synthetic configuration fixture. No child, patient, recording or clinical assessment is involved. Say hello only if a test conversation is explicitly opened.')
                created = await provider('POST', '/agents/create', json=configuration)
                agent_id = created['agent_id']; result['agent_created'] = True
                token = await provider('GET', '/conversation/token', params={'agent_id': agent_id})
                result['webrtc_token_received'] = bool(isinstance(token.get('token'), str) and token['token'])
                # Never print or persist the bearer connection token.
            except (HTTPException, KeyError, ValueError) as error:
                result['status'] = 'configuration_rejected_or_unavailable'
                response = getattr(error.__cause__, 'response', None)
                result['provider_http_status'] = response.status_code if response is not None else None
                if response is not None:
                    try:
                        detail = response.json().get('detail')
                        if isinstance(detail, list):
                            result['validation_fields'] = [item.get('loc') for item in detail if isinstance(item, dict)]
                        elif isinstance(detail, dict) and re.fullmatch(r'[A-Za-z0-9_]{1,80}', str(detail.get('status', ''))):
                            result['provider_error_code'] = detail['status']
                    except (ValueError, AttributeError):
                        pass
            finally:
                if agent_id:
                    try:
                        await provider('DELETE', f'/agents/{agent_id}')
                        result['provider_cleanup'] = 'deleted'
                    except HTTPException:
                        async with AsyncSessionLocal() as db:
                            db.add(ProviderDeletion(provider_id=agent_id, resource_type='agent'))
                            await db.commit()
                        result['provider_cleanup'] = 'queued_for_retry'
            report['languages'][language] = result
        directory = Path(__file__).resolve().parents[2] / 'tmp/provider-check'
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'live-call-configuration.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
