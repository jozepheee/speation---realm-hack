"""English/Hindi phone checks on hash-verified adult synthetic controls.

--synthesize-controls explicitly generates adult TTS clips. --coaching explicitly
sends selected cached synthetic clips to the configured audio model. No patient
audio or microphone is used. Intended TTS text is not gold phone annotation.
"""
import argparse
import asyncio
import base64
import hashlib
import json
from pathlib import Path
import time
from config import settings
from fluency.audio import decode_audio
from learners.care_router import playback_wav
from learners.phone_observation import _load, observe
from learners.pronunciation_reference import target_reference
from learners.speech_coaching import listen, validate_feedback

ROOT = Path(__file__).resolve().parents[2]
PAIRS = [('en','ship','ship'), ('en','ship','sheep'), ('en','thin','thin'), ('en','thin','tin'),
         ('en','right','right'), ('en','right','light'), ('hi','ताल','ताल'), ('hi','ताल','दाल'),
         ('hi','कल','कल'), ('hi','कल','खल'), ('hi','ताल','टाल')]


async def benchmark(args):
    directory = str(Path(args.model_dir).resolve())
    _load(directory)
    cache = ROOT / 'tmp/provider-check/en-hi-contrast-audio'
    cache.mkdir(parents=True, exist_ok=True)
    manifest_path = cache / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    report = {'scope':'synthetic_adult_engineering_controls_not_gold_phonetic_labels',
        'release_approved':False, 'clinical_validation':False, 'results':[]}
    for language, target, spoken in PAIRS:
        if args.language!='all' and language!=args.language:continue
        if args.coaching and (language, target, spoken) not in [
            ('en','ship','ship'), ('en','ship','sheep'), ('hi','ताल','ताल'), ('hi','ताल','दाल'),
            ('hi','कल','कल'), ('hi','कल','खल')]:
            continue
        key = hashlib.sha256((language+':'+spoken).encode()).hexdigest()[:16]
        path = cache / (key+'.wav')
        if key not in manifest:
            if not args.synthesize_controls:
                raise ValueError('Missing cached controls. Explicitly run --synthesize-controls first.')
            from learners.speech_output import synthesize
            speech = await synthesize(spoken, language)
            path.write_bytes(playback_wav(decode_audio(base64.b64decode(speech['audio_base64']))))
            manifest[key] = {'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'text':spoken,
                'language':language, 'source':'elevenlabs_adult_synthetic', 'model':speech['model']}
            manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=manifest[key]['sha256'] or manifest[key]['text']!=spoken or manifest[key]['language']!=language:
            raise ValueError('Control audio or metadata changed')
        started = time.monotonic()
        observation = observe(raw, directory)
        observation['language'] = language
        reference = target_reference(target, language)
        row = {'language':language,'target':target,'synthetic_spoken_text':spoken,
            'audio_sha256':manifest[key]['sha256'],'reference':reference,'observation':observation}
        if args.coaching:
            context = {'language':language,'expected_text':target,'target_sound':'','mode':'listen_then_say',
                'duration_seconds':len(decode_audio(raw))/16000,'previous_audio_proposals':[],
                'pronunciation_reference':reference,'independent_phone_observation':observation}
            try:
                result, model = await listen(raw, context)
                row['raw_audio_model_response']=result.model_dump()
                row.update(content=validate_feedback(result,context).model_dump(), audio_model=model)
            except Exception as error:
                row['error_type'] = type(error).__name__
        row['elapsed_seconds'] = round(time.monotonic()-started,3)
        report['results'].append(row)
        Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'language':language,'target':target,'spoken':spoken,'phones':observation['phones'],
            'state':row.get('content',{}).get('state'),'error_type':row.get('error_type')},ensure_ascii=True),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir',required=True)
    parser.add_argument('--synthesize-controls',action='store_true')
    parser.add_argument('--coaching',action='store_true')
    parser.add_argument('--language',choices=['all','en','hi'],default='all')
    parser.add_argument('--output',default=str(ROOT/'docs/validation/en-hi-phone-benchmark-20261017.json'))
    asyncio.run(benchmark(parser.parse_args()))
