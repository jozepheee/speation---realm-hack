"""Compare a second phone recognizer on the same hash-verified synthetic controls.

Run benchmark_malayalam_phones --synthesize-controls once before this command.
Requires an explicit local model snapshot; never downloads weights or audio.
"""
import argparse
import hashlib
import json
from pathlib import Path
from learners.phone_observation import observe
from learners.malayalam_reference import target_reference
from training.benchmark_malayalam_phones import CONTROLS, ROOT


def benchmark(model_dir, output):
    cache = ROOT / 'tmp/provider-check/ml-contrast-audio'
    manifest = json.loads((cache / 'manifest.json').read_text(encoding='utf-8'))
    results = []
    for target, spoken in CONTROLS:
        key = hashlib.sha256(spoken.encode()).hexdigest()[:16]
        raw = (cache / (key + '.wav')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest[key]['sha256'] or manifest[key]['text'] != spoken:
            raise ValueError('Control audio changed')
        result = {'target': target, 'synthetic_spoken_text': spoken, 'audio_sha256': manifest[key]['sha256'],
            'expected_pronunciation_reference': target_reference(target, 'ml'),
            'observation': observe(raw, model_dir)}
        results.append(result)
        print(json.dumps({'target': target, 'synthetic_spoken_text': spoken,
                          'phones': result['observation']['phones']}, ensure_ascii=True), flush=True)
    report = {'scope': 'synthetic_adult_engineering_controls_not_gold_pronunciation',
        'release_approved': False, 'clinical_validation': False,
        'limitations': ['Intended TTS text is not gold phonetic annotation.',
            'No child, impaired-speech or dialect validation; no calibrated error thresholds.'], 'results': results}
    Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--output', default=str(ROOT / 'docs/validation/malayalam-xlsr-benchmark-20261017.json'))
    args = parser.parse_args()
    benchmark(args.model_dir, args.output)
