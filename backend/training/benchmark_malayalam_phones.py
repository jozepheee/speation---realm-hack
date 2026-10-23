"""Reproducible local phone-recognition benchmark. No microphone or child audio.

First run: python -m training.benchmark_malayalam_phones --synthesize-controls
Later runs reuse hash-checked synthetic adult audio without provider requests.
Install the optional research requirements and pre-download uni2005 first.
Neither intended TTS text nor G2P output is a gold label of the actual audio.
"""
import argparse
import asyncio
import base64
import hashlib
import json
from pathlib import Path
import time

CONTROLS = [('മഴ', 'മഴ'), ('മഴ', 'മല'), ('മഴ', 'മള'), ('മാല', 'മാല'),
            ('മാല', 'മല'), ('പട്ടം', 'പട്ടം'), ('പട്ടം', 'പടം')]
ROOT = Path(__file__).resolve().parents[2]


async def benchmark(synthesize_controls, output):
    import numpy as np
    import torch
    from allosaurus.app import read_recognizer
    from allosaurus.model import get_model_path
    from learners.malayalam_reference import target_reference
    from learners.care_router import playback_wav
    from fluency.audio import decode_audio

    # Never silently download a model during analysis.
    get_model_path('uni2005')
    torch.set_num_threads(4)
    model = read_recognizer('uni2005')
    model.am.eval()
    if not model.is_available('mal'):
        raise ValueError('The installed model does not have a Malayalam inventory')
    cache = ROOT / 'tmp/provider-check/ml-contrast-audio'
    cache.mkdir(parents=True, exist_ok=True)
    manifest_path = cache / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    report = {'method': 'Allosaurus uni2005 + Mlphon 3.1.3',
        'scope': 'synthetic_adult_engineering_controls_not_gold_pronunciation',
        'release_approved': False, 'clinical_validation': False,
        'malayalam_inventory': list(model.lm.inventory.get_unit('mal').unit_to_id),
        'acoustic_model_inventory': list(model.lm.unit.unit_to_id), 'results': []}
    expected_phones = set()
    for target, spoken in CONTROLS:
        key = hashlib.sha256(spoken.encode()).hexdigest()[:16]
        path = cache / (key + '.wav')
        if key not in manifest:
            if not synthesize_controls:
                raise ValueError('Missing verified control audio. Use --synthesize-controls to generate it.')
            from learners.speech_output import synthesize
            speech = await synthesize(spoken, 'ml')
            path.write_bytes(playback_wav(decode_audio(base64.b64decode(speech['audio_base64']))))
            manifest[key] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'text': spoken,
                             'source': 'elevenlabs_adult_synthetic', 'model': speech['model']}
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        raw = path.read_bytes()
        if manifest[key]['text'] != spoken or hashlib.sha256(raw).hexdigest() != manifest[key]['sha256']:
            raise ValueError('Control audio changed; do not silently reuse it')
        reference = target_reference(target, 'ml')
        for word in [target, spoken]:
            for item in target_reference(word, 'ml')['words']:
                for variant in item['variants']:
                    expected_phones.update(variant)
        started = time.monotonic()
        hypotheses = {}
        for inventory in ['mal', 'ipa']:
            np.random.seed(17)
            with torch.inference_mode():
                hypotheses[inventory] = model.recognize(str(path), inventory, topk=3, timestamp=True)
        report['results'].append({'target': target, 'synthetic_spoken_text': spoken,
            'expected_pronunciation_reference': reference, 'audio_sha256': manifest[key]['sha256'],
            'hypotheses': hypotheses, 'latency_seconds': round(time.monotonic() - started, 3)})
        print(json.dumps({'target': target, 'synthetic_spoken_text': spoken, 'status': 'analyzed'}, ensure_ascii=True), flush=True)
    report['missing_from_malayalam_inventory'] = sorted(expected_phones - set(report['malayalam_inventory']))
    report['missing_from_acoustic_model_inventory'] = sorted(expected_phones - set(report['acoustic_model_inventory']))
    report['decision'] = 'Do not use this model for automatic Malayalam pronunciation grading.'
    report['limitations'] = ['Synthetic intended text has not been verified as spoken-phone gold labels.',
        'The Malayalam inventory omits ɻ; the acoustic model inventory omits ɭ.',
        'Recognition posteriors are not calibrated pronunciation scores.',
        'No child, dialect or impaired-speech validation; no timing spans validated as phone boundaries.']
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['release_approved', 'missing_from_malayalam_inventory',
        'missing_from_acoustic_model_inventory', 'decision']}, ensure_ascii=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--synthesize-controls', action='store_true')
    parser.add_argument('--output', default=str(ROOT / 'docs/validation/malayalam-phone-benchmark-20261017.json'))
    args = parser.parse_args()
    asyncio.run(benchmark(args.synthesize_controls, args.output))
