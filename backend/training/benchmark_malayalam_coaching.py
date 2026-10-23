"""Exercise Maya's combined audio path on cached synthetic adult controls.

This explicitly sends those synthetic controls to the configured audio model.
It never reads patient recordings or starts the microphone.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
from learners.malayalam_reference import target_reference
from learners.speech_coaching import independent_phone_context, listen, validate_feedback
from training.benchmark_malayalam_phones import ROOT


async def benchmark(output):
    cache = ROOT / 'tmp/provider-check/ml-contrast-audio'
    manifest = json.loads((cache / 'manifest.json').read_text(encoding='utf-8'))
    rows = []
    from fluency.audio import decode_audio
    for target, spoken in [('മഴ','മഴ'), ('മഴ','മല'), ('മാല','മാല'), ('മാല','മല')]:
        key = hashlib.sha256(spoken.encode()).hexdigest()[:16]
        raw = (cache / (key + '.wav')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest[key]['sha256']:
            raise ValueError('Control audio changed')
        context = {'language':'ml','mode':'listen_then_say','expected_text':target,'target_sound':'',
            'duration_seconds':len(decode_audio(raw))/16000,'previous_audio_proposals':[],
            'pronunciation_reference':target_reference(target,'ml')}
        context['independent_phone_observation'] = await independent_phone_context(raw, context)
        if not context['independent_phone_observation'] or 'emissions' not in context['independent_phone_observation']:
            raise ValueError('Warm the configured local phone model before this benchmark')
        result, model = await listen(raw, context)
        result = validate_feedback(result, context)
        row = {'target':target,'synthetic_spoken_text':spoken,'audio_sha256':manifest[key]['sha256'],
            'audio_model':model,'content':result.model_dump(),'independent_phone_observation':context['independent_phone_observation']}
        rows.append(row)
        Path(output).write_text(json.dumps({'scope':'synthetic_adult_engineering_controls_not_gold_pronunciation',
            'clinical_validation':False,'release_approved':False,'results':rows}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'target':target,'synthetic_spoken_text':spoken,'state':result.state,
            'concerns':len(result.concerns)}, ensure_ascii=True),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--output', default=str(ROOT / 'docs/validation/malayalam-combined-coaching-20261017.json'))
    args = parser.parse_args()
    from config import settings
    from learners.phone_observation import _load
    settings.MALAYALAM_PHONE_MODEL_DIR = str(Path(args.model_dir).resolve())
    _load(settings.MALAYALAM_PHONE_MODEL_DIR)
    asyncio.run(benchmark(args.output))
