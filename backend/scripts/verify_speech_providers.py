"""Small real-provider smoke check with synthetic reference audio, not child validation."""
import asyncio
import base64
import json
from pathlib import Path
from fastapi import HTTPException
from learners.speech_output import synthesize
from learners.recognition import recognize
from learners.care_router import playback_wav
from fluency.audio import decode_audio


async def main():
    directory = Path(__file__).resolve().parents[2] / 'tmp/provider-check'
    directory.mkdir(exist_ok=True)
    report = {'scope': 'synthetic_reference_provider_smoke_test_not_pediatric_accuracy', 'languages': {}}
    for language, phrase in [('en', 'Hello, I would like some water.'), ('hi', 'नमस्ते, मुझे पानी चाहिए।'), ('ml', 'നമസ്കാരം, എനിക്ക് വെള്ളം വേണം.')]:
        result = {}
        try:
            speech = await synthesize(phrase, language)
            data = base64.b64decode(speech['audio_base64'], validate=True)
            waveform = decode_audio(data)
            (directory / f'{language}.mp3').write_bytes(data)
            result['tts'] = {'status': 'actual_audio_decoded', 'model': speech['model'], 'duration_seconds': round(len(waveform)/16000, 3)}
            for provider in ['sarvam', *(['deepgram'] if language != 'ml' else [])]:
                try:
                    transcript, words, metadata = await recognize(waveform, playback_wav(waveform), language, provider, 'selected_language')
                    result[provider] = {'status': 'actual_recognition', 'transcript': transcript, 'metadata': metadata}
                except HTTPException as error:
                    result[provider] = {'status': 'failed', 'http_status': error.status_code,
                        'provider_status': getattr(getattr(error.__cause__, 'response', None), 'status_code', None)}
        except Exception as error:
            result['tts'] = {'status': 'failed', 'error_type': type(error).__name__,
                'provider_status': getattr(getattr(error.__cause__, 'response', None), 'status_code', None)}
        report['languages'][language] = result
        print(f'Provider check completed for {language}', flush=True)
    (directory / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
