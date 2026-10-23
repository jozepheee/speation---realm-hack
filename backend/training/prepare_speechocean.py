"""Acquire real expert-rated English child speech; never invent segment times.

Official source is pinned and every downloaded file is verified against its Git
blob hash. Phone ratings remain expert observations, not clinical error labels.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import random
import httpx

REPOSITORY = 'jimbozhang/speechocean762'
REVISION = '613968e3b0b789fc33936fb5eba1973176ba7d11'


def prepare(output, speakers=40, clips_per_speaker=4):
    directory = Path(output).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    raw_base = f'https://raw.githubusercontent.com/{REPOSITORY}/{REVISION}/'
    with httpx.Client(timeout=60) as client:
        response = client.get(f'https://api.github.com/repos/{REPOSITORY}/git/trees/{REVISION}?recursive=1')
        response.raise_for_status()
        entries = {item['path']: item for item in response.json()['tree'] if item['type'] == 'blob'}

    def acquire(path):
        entry = entries[path]
        if entry['size'] > 25 * 1024 * 1024:
            raise ValueError('Unexpected oversized source file')
        destination = directory / path
        if not destination.resolve().is_relative_to(directory):
            raise ValueError('Source path escapes output directory')
        destination.parent.mkdir(parents=True, exist_ok=True)
        data = destination.read_bytes() if destination.exists() else httpx.get(raw_base + path, timeout=60).raise_for_status().content
        blob_hash = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        if blob_hash != entry['sha']:
            raise ValueError('Source hash mismatch; refusing modified corpus content')
        destination.write_bytes(data)
        return data

    scores = json.loads(acquire('resource/scores.json'))
    # Preserve five raters' original observations for later agreement analysis.
    acquire('resource/scores-detail.json')
    acquire('README.md')
    metadata, official_speakers = {}, {}
    for split in ['train', 'test']:
        ages = dict(line.split() for line in acquire(f'{split}/spk2age').decode().splitlines() if line.strip())
        utterances = dict(line.split() for line in acquire(f'{split}/utt2spk').decode().splitlines() if line.strip())
        for utterance, speaker in utterances.items():
            metadata[utterance] = {'speaker': speaker.zfill(4), 'age': int(ages[speaker]), 'official_split': split}
        official_speakers[split] = set(ages)
    if official_speakers['train'] & official_speakers['test']:
        raise ValueError('Original speaker partitions overlap')
    children = {utterance: item for utterance, item in metadata.items() if 4 <= item['age'] < 18}
    groups = {split: sorted({item['speaker'] for item in children.values() if item['official_split'] == split}) for split in ['train', 'test']}
    rng = random.Random(20261014)
    for group in groups.values():
        rng.shuffle(group)
    training = groups['train'][:max(3, int(speakers * .75))]
    held_out = groups['test'][:max(2, speakers - len(training))]
    validation_count = max(2, len(training) // 5)
    partitions = {speaker: 'validation' if index < validation_count else 'train' for index, speaker in enumerate(training)}
    partitions.update({speaker: 'test' for speaker in held_out})
    selected = []
    for speaker in sorted(partitions):
        ids = sorted(utterance for utterance, item in children.items() if item['speaker'] == speaker)
        rng.shuffle(ids)
        selected.extend(ids[:clips_per_speaker])
    paths = {utterance: f"WAVE/SPEAKER{children[utterance]['speaker']}/{utterance}.WAV" for utterance in selected}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(acquire, paths.values()))
    rows = []
    explicit = 0
    for utterance in selected:
        item, labels = children[utterance], scores[utterance]
        phones = []
        for word_index, word in enumerate(labels['words']):
            canonical = word['phones'].split() if isinstance(word['phones'], str) else word['phones']
            accuracy = word['phones-accuracy']
            if len(canonical) != len(accuracy):
                raise ValueError('Canonical phones and expert scores disagree')
            pronunciations = {entry['index']: entry for entry in word.get('mispronunciations', [])}
            for index, (phone, score) in enumerate(zip(canonical, accuracy)):
                production = pronunciations.get(index, {}).get('pronounced-phone')
                explicit += production is not None
                phones.append({'expected_phone': phone, 'expert_score': score, 'produced_phone': production,
                    'word_index': word_index, 'phone_index_in_word': index, 'word': word['text'],
                    'start_seconds': None, 'end_seconds': None, 'alignment_source': 'not_provided'})
        data = (directory / paths[utterance]).read_bytes()
        rows.append({'utterance_id': utterance, 'speaker_key': f"speechocean762:{item['speaker']}", 'age': item['age'],
            'language': 'en', 'native_language': 'Mandarin', 'speech_profile': 'non_native_english_not_verified_disorder',
            'partition': partitions[item['speaker']], 'audio_path': str(directory / paths[utterance]),
            'audio_sha256': hashlib.sha256(data).hexdigest(), 'text': labels['text'], 'phones': phones,
            'label_source': 'five_expert_pronunciation_raters', 'license': 'CC-BY-4.0',
            'source_revision': REVISION, 'clinical_validation': 'not_performed'})
    for split in ['train', 'validation', 'test']:
        (directory / f'{split}.jsonl').write_text('\n'.join(json.dumps(row, ensure_ascii=False) for row in rows if row['partition'] == split) + '\n', encoding='utf-8')
    report = {'source': f'https://github.com/{REPOSITORY}', 'revision': REVISION, 'license': 'CC-BY-4.0',
        'sample_selection': 'seeded_speaker_disjoint_child_only_random_utterances',
        'utterances': len(rows), 'speakers': len(partitions), 'ages': sorted({row['age'] for row in rows}),
        'phone_ratings': sum(len(row['phones']) for row in rows), 'explicit_produced_phone_labels': explicit,
        'partitions': {split: {'utterances': sum(row['partition'] == split for row in rows),
            'speakers': sum(value == split for value in partitions.values())} for split in ['train', 'validation', 'test']},
        'gold_phone_timestamps_available': False, 'clinical_release_eligible': False,
        'limitations': ['English L2 learners are not a pediatric disorder cohort',
            'No Hindi or Malayalam labels', 'Accent ratings must not be treated as a disorder',
            'Expert phone scores do not supply waveform boundaries or clinical category validation']}
    (directory / 'manifest_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='data/speechocean-child-research')
    parser.add_argument('--speakers', type=int, default=40)
    parser.add_argument('--clips-per-speaker', type=int, default=4)
    args = parser.parse_args()
    if not 10 <= args.speakers <= 125 or not 1 <= args.clips_per_speaker <= 20:
        raise ValueError('Use 10–125 speakers and 1–20 clips per speaker')
    prepare(args.output, args.speakers, args.clips_per_speaker)
