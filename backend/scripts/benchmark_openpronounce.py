"""Offline word-error screening against public SpeechOcean expert phone ratings.

Run in the isolated reference venv. This does not establish dysarthric accuracy.
"""
import argparse
import json
import os
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    from espeakng_loader import get_library_path, get_data_path
    EspeakWrapper.set_library(get_library_path())
    os.environ['ESPEAK_DATA_PATH'] = str(Path(get_data_path()).parent)
    import torch
    torch.set_num_threads(4)
    from openpronounce.phones import recognize_phones, compare_phones
    from fluency.audio import decode_audio
    groups = {name: dict(tp=0, fp=0, tn=0, fn=0, utterances=0, excluded_words=0) for name in ['child', 'adult']}
    samples = []
    for line in args.manifest.read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        start = time.perf_counter()
        recognized = recognize_phones(decode_audio(Path(row['audio']).read_bytes()), 16000, lang='en')
        result = compare_phones(recognized, row['text'], 'en')
        elapsed = round(time.perf_counter() - start, 3)
        expected = result['expected_phones']
        if len(expected) != len(row['words']):
            samples.append(dict(id=row['id'], skipped='word_tokenization_mismatch', seconds=elapsed))
            continue
        flagged = {error['position'] for error in result['errors']}
        group = groups[row['group']]
        group['utterances'] += 1
        for index, word in enumerate(row['words']):
            scores = word['phones-accuracy']
            if any(score < 1 for score in scores):
                group['tp' if index in flagged else 'fn'] += 1
            elif all(score >= 1.5 for score in scores):
                group['fp' if index in flagged else 'tn'] += 1
            else:
                group['excluded_words'] += 1
        samples.append(dict(id=row['id'], group=row['group'], seconds=elapsed, flagged_word_indices=sorted(flagged)))
        print(json.dumps(dict(completed=len(samples), id=row['id'], seconds=elapsed)), flush=True)
    for group in groups.values():
        group['precision'] = group['tp'] / (group['tp'] + group['fp']) if group['tp'] + group['fp'] else None
        group['recall'] = group['tp'] / (group['tp'] + group['fn']) if group['tp'] + group['fn'] else None
    report = dict(source='SpeechOcean762 official test split, 20 distinct speakers',
                  clinical_validation=False, dysarthric_validation=False, production_ready=False,
                  policy='Word screening: any expert phone score <1 is difference; all >=1.5 is clear; middle excluded. No threshold tuning.',
                  groups=groups, samples=samples)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
