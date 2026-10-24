"""Verify audio transport/schema using existing synthetic TTS references only."""
import asyncio
import argparse
import json
from pathlib import Path
from fastapi import HTTPException
from learners.acoustic_router import audio_observation, AUDIO_PROMPT_VERSION
from learners.care_router import playback_wav
from fluency.audio import decode_audio
from config import settings


async def main(selected_language=None):
    directory = Path(__file__).resolve().parents[2] / 'tmp/provider-check'
    report = {'scope': 'synthetic_tts_audio_transport_only_not_pediatric_or_clinical_accuracy',
        'configured_model': settings.OPENROUTER_AUDIO_MODEL, 'prompt_version': AUDIO_PROMPT_VERSION, 'languages': {}}
    fixtures = [('en', 'Hello, I would like some water.', 'w'), ('hi', 'नमस्ते, मुझे पानी चाहिए।', 'p'),
        ('ml', 'നമസ്കാരം, എനിക്ക് വെള്ളം വേണം.', 'ʋ')]
    for language, text, phone in fixtures:
        if selected_language and language != selected_language:
            continue
        path = directory / f'{language}.mp3'
        if not path.exists():
            report['languages'][language] = {'status': 'skipped_missing_synthetic_reference'}
            continue
        waveform = decode_audio(path.read_bytes())[:20 * 16000]
        try:
            result, model, policy = await audio_observation(playback_wav(waveform), {'language': language,
                'age': None, 'reported_dialect': 'synthetic_reference_not_a_person',
                'expected_text': text, 'expected_phone': phone})
            report['languages'][language] = {'status': 'actual_audio_request_and_validated_response_schema',
                'model': model, 'duration_seconds': round(len(waveform) / 16000, 3),
                'proposal': result.model_dump(), 'policy': policy, 'clinically_validated': False}
        except HTTPException as error:
            response = getattr(error.__cause__, 'response', None)
            report['languages'][language] = {'status': 'provider_or_response_schema_unavailable',
                'cause_type': type(error.__cause__).__name__,
                'provider_finish_reason': getattr(error, 'provider_finish_reason', None),
                'response_content_characters': getattr(error, 'response_content_characters', None),
                'provider_http_status': response.status_code if response is not None else None}
            if hasattr(error.__cause__, 'errors'):
                report['languages'][language]['schema_fields'] = [item['loc'] for item in error.__cause__.errors(include_input=False)]
        print(json.dumps({'language': language, 'status': report['languages'][language]['status']}), flush=True)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'audio-proposal-transport{("-" + selected_language) if selected_language else ""}.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    overview = {**report, 'languages': {language: {**{key: value for key, value in result.items()
        if key not in ['proposal', 'policy']}, 'policy_abstained': result.get('policy', {}).get('excluded_articulatory_detail', False)}
        for language, result in report['languages'].items()}}
    print(json.dumps(overview, indent=2, ensure_ascii=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=['en', 'hi', 'ml'])
    asyncio.run(main(parser.parse_args().language))
