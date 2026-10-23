"""Explicit recognition providers. No target hints, silent fallback or error grading."""
import httpx
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
from config import settings
from ml_settings import SAMPLE_RATE, ModelUnavailableError, InvalidAudioError
from fluency.asr import transcribe_recording
from learners.provider_http import client as provider_client

LANGUAGES = {'en': 'en-IN', 'hi': 'hi-IN', 'ml': 'ml-IN'}
def check_script(transcript, language, mode):
    if mode=='auto' or language not in ['hi','ml']: return
    indic=[ord(c) for c in transcript if 0x900<=ord(c)<=0xD7F and c.isalpha()]
    low,high=(0xD00,0xD7F) if language=='ml' else (0x900,0x97F)
    if len(indic)>=3 and sum(low<=c<=high for c in indic)/len(indic)<.4:
        raise InvalidAudioError('Recognition returned a different script from the selected language. This is a recognition failure, not a pronunciation error. Replay or retry with a regional recognizer.')


async def recognize(waveform, wav_bytes, language, provider, mode, transcriber=transcribe_recording):
    if provider in ['local_whisper','adapted_english']:
        model_name=settings.CARE_ASR_MODEL
        if provider=='adapted_english':
            from learners.research_model import status
            if language!='en' or mode=='auto':raise HTTPException(422,'The local adapted model supports selected English only')
            if len(waveform)>30*SAMPLE_RATE:raise HTTPException(422,'Use at most thirty seconds with the adapted English model')
            if not status()['available']:raise HTTPException(503,'The local adapted research model is unavailable')
            model_name=settings.ENGLISH_ADAPTED_MODEL_DIR
        transcript, words = await run_in_threadpool(transcriber, waveform,
            None if mode == 'auto' else language, model_name=model_name, local_only=True, download_root=settings.CARE_ASR_CACHE_DIR or None)
        check_script(transcript,language,mode)
        metadata={'provider': provider, 'model': 'local-english-adult-pilot-v1' if provider=='adapted_english' else f'faster-whisper/{settings.CARE_ASR_MODEL}',
            'timestamp_granularity': 'word', 'mode': mode, 'cloud_audio_transmitted': False}
        if provider=='adapted_english':metadata.update(research_only=True,population='single adult male',production_ready=False)
        if language=='en' and mode!='auto' and settings.REVOICE_SELECTOR_ENABLED:
            from learners.revoice.adapter import suggest
            selection=await run_in_threadpool(suggest,waveform,transcript,model_name)
            if selection:metadata.update(alternatives=selection['alternatives'],selection=selection)
        return transcript,words,metadata
    key = settings.SARVAM_API_KEY if provider == 'sarvam' else settings.DEEPGRAM_API_KEY
    if not key:
        raise HTTPException(503, 'The selected recognition provider is not configured')
    try:
        async with provider_client(timeout=15 if language=='en' else 60) as client:
            if provider == 'sarvam':
                if len(waveform) > SAMPLE_RATE * 30:
                    raise HTTPException(422, 'Use a clip of at most 30 seconds for Sarvam, or select local recognition for a longer recording')
                response = await client.post('https://api.sarvam.ai/speech-to-text', headers={'api-subscription-key': key},
                    data={'model': settings.SARVAM_ASR_MODEL, 'mode': 'codemix' if mode == 'auto' else 'verbatim',
                          'language_code': 'unknown' if mode == 'auto' else LANGUAGES[language], 'with_timestamps': 'true'},
                    files={'file': ('recording.wav', wav_bytes, 'audio/wav')})
                response.raise_for_status()
                data = response.json()
                transcript = data['transcript']
                timestamps = data.get('timestamps') or {}
                words = [{'text': value, 'start': float(start), 'end': float(end), 'unit': 'chunk'}
                    for value, start, end in zip(timestamps.get('words', []), timestamps.get('start_time_seconds', []), timestamps.get('end_time_seconds', []))]
                metadata = {'provider': provider, 'model': settings.SARVAM_ASR_MODEL, 'timestamp_granularity': 'chunk',
                    'detected_language': data.get('language_code'), 'request_id': data.get('request_id'), 'mode': mode, 'cloud_audio_transmitted': True}
            else:
                if language == 'ml':
                    raise HTTPException(422, 'Deepgram Nova-3 Malayalam support is not advertised; select Sarvam or local recognition')
                response = await client.post('https://api.deepgram.com/v1/listen',
                    headers={'Authorization': f'Token {key}', 'Content-Type': 'audio/wav'}, content=wav_bytes,
                    params={'model': settings.DEEPGRAM_ASR_MODEL, 'language': 'multi' if mode == 'auto' else language,
                            'punctuate': 'true', 'smart_format': 'false', 'filler_words': 'true' if language=='en' and mode!='auto' else 'false'})
                response.raise_for_status()
                data = response.json()
                alternative = data['results']['channels'][0]['alternatives'][0]
                transcript = alternative['transcript']
                words = [{'text': value.get('punctuated_word') or value['word'], 'start': float(value['start']),
                    'end': float(value['end']), 'model_probability': value.get('confidence'), 'unit': 'word'} for value in alternative.get('words', [])]
                metadata = {'provider': provider, 'model': settings.DEEPGRAM_ASR_MODEL, 'timestamp_granularity': 'word',
                    'request_id': data.get('metadata', {}).get('request_id'), 'mode': mode, 'cloud_audio_transmitted': True}
                # Preserve only hypotheses actually returned by the recognizer.
                # These are message suggestions, never evidence of correct sounds.
                metadata['alternatives']=list(dict.fromkeys(
                    item['transcript'].strip() for item in data['results']['channels'][0]['alternatives'][:5]
                    if isinstance(item,dict) and isinstance(item.get('transcript'),str) and 0<len(item['transcript'].strip())<=1000))
        if not isinstance(transcript, str) or len(transcript) > 20000:
            raise ValueError('Invalid transcript')
        if not transcript.strip():
            raise InvalidAudioError('No speech was recognized; confirm the recording or try again')
        check_script(transcript,language,mode)
        duration = len(waveform) / SAMPLE_RATE
        if any(not 0 <= word['start'] <= word['end'] <= duration + .5 for word in words):
            # Preserve the actual transcript, but do not expose timing as reliable
            # localization when a provider reports times outside the waveform.
            words = []
            metadata.update(timestamp_granularity='unavailable', timestamp_error='provider_times_out_of_bounds')
        return transcript.strip(), words, metadata
    except InvalidAudioError:
        raise
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise HTTPException(429, 'Recognition provider capacity was reached; retry later', headers={'Retry-After': '10'}) from error
        raise HTTPException(503, 'The selected recognition provider failed; no alternative transcript was substituted') from error
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
        raise HTTPException(503, 'Recognition is unavailable; no transcript was invented') from error
