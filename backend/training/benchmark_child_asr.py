"""Measure actual recognition against corpus transcripts; never phoneme accuracy."""
import argparse
import asyncio
import json
import time
import unicodedata
from pathlib import Path
from fluency.audio import decode_audio
from learners.care_router import playback_wav
from learners.recognition import recognize


def normalize(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    return ' '.join(''.join(' ' if unicodedata.category(char).startswith('P') else char for char in text).split())


def distance(expected, actual):
    previous = list(range(len(actual) + 1))
    for index, left in enumerate(expected, 1):
        current = [index]
        for position, right in enumerate(actual, 1):
            current.append(min(current[-1] + 1, previous[position] + 1, previous[position - 1] + (left != right)))
        previous = current
    return previous[-1]


async def main(provider, clips):
    root = Path(__file__).resolve().parents[2]
    source = root / 'data/hiacc/asr-research/test.jsonl'
    rows = [json.loads(line) for line in source.read_text(encoding='utf-8').splitlines() if line.strip()]
    # Predeclared short-clip smoke evaluation, selected before observing predictions.
    candidates = sorted([row for row in rows if row['duration_seconds'] <= 10], key=lambda row: row['utterance_id'])
    strata = sorted({(row['participant_id'], row['language']) for row in candidates})
    by_subject = {stratum: [row for row in candidates if (row['participant_id'], row['language']) == stratum] for stratum in strata}
    selected = [row for round_index in range(max(map(len, by_subject.values()))) for rows in by_subject.values() for row in rows[round_index:round_index + 1]][:clips]
    results = []
    for row in selected:
        started = time.perf_counter()
        result = {key: row[key] for key in ['utterance_id', 'participant_id', 'age', 'language']}
        try:
            waveform = decode_audio(Path(row['audio_path']).read_bytes())
            prediction, _, metadata = await recognize(waveform, playback_wav(waveform), row['language'], provider, 'auto')
            expected, observed = normalize(row['transcript']), normalize(prediction)
            result.update(status='recognized', reference=row['transcript'], prediction=prediction,
                word_edits=distance(expected.split(), observed.split()), reference_words=len(expected.split()),
                character_edits=distance(expected, observed), reference_characters=len(expected), provenance=metadata)
        except Exception as error:
            result.update(status='failed', error_type=type(error).__name__)
        result['latency_seconds'] = round(time.perf_counter() - started, 3)
        results.append(result)
        print(f"Evaluated {row['utterance_id']}: {result['status']}", flush=True)
    valid = [row for row in results if row['status'] == 'recognized']
    def metrics(group):
        return {'clips': len(group), 'wer': sum(row['word_edits'] for row in group) / max(1, sum(row['reference_words'] for row in group)),
            'cer': sum(row['character_edits'] for row in group) / max(1, sum(row['reference_characters'] for row in group))}
    report = {'provider': provider, 'scope': 'small_public_corpus_research_smoke_evaluation', 'selection': 'participant_language_round_robin_short_clips_predeclared',
        'requested_clips': clips, 'evaluated_clips': len(results), 'recognized_clips': len(valid), 'failed_clips': len(results) - len(valid),
        'aggregate': metrics(valid) if valid else None, 'by_language': {language: metrics([row for row in valid if row['language'] == language]) for language in sorted({row['language'] for row in valid})},
        'clinical_validation': False, 'phoneme_error_evaluation': False, 'speaker_role_audited': False,
        'limitations': ['Small short-clip sample', 'Participant-disjoint; interviewer overlap unaudited', 'English/Hindi corpus only', 'Production license eligibility unresolved'],
        'results': results}
    output = root / f'artifacts/asr-research/{provider}-hiacc-smoke.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['local_whisper', 'sarvam', 'deepgram'], default='sarvam')
    parser.add_argument('--clips', type=int, choices=range(1, 101), default=6)
    args = parser.parse_args()
    asyncio.run(main(args.provider, args.clips))
