"""Prepare participant-disjoint ASR research manifests from the verified archive.

Transcripts are not phoneme-error labels. Interviewer overlap has not been audited.
The repository/paper license conflict prevents asserting production eligibility.
"""
import csv
import hashlib
import io
import json
import random
import re
import zipfile
from pathlib import Path
import soundfile as sf


def main():
    root = Path(__file__).resolve().parents[2]
    directory = root / 'data/hiacc'
    archive_path = directory / 'Corpus.zip'
    metadata = json.loads((directory / 'source_metadata.json').read_text(encoding='utf-8'))
    expected = next(item['checksum'] for item in metadata['files'] if item['key'] == 'Corpus.zip')
    digest = hashlib.md5()
    with archive_path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if f'md5:{digest.hexdigest()}' != expected:
        raise ValueError('Archive must match the original published checksum')
    destination = directory / 'asr-research'
    destination.mkdir(exist_ok=True)
    audio_root = destination / 'audio'
    audio_root.mkdir(exist_ok=True)
    rows, skipped, publisher_groups = [], 0, {}
    with zipfile.ZipFile(archive_path) as archive:
        csv_text = archive.read('Corpus/children/metadata/speaker_info.csv').decode('utf-8-sig').replace('\r', '')
        speakers = {row['PID']: row for row in csv.DictReader(io.StringIO(csv_text)) if row.get('PID')}
        identities = sorted(speakers)
        random.Random(20261014).shuffle(identities)
        groups = {identity: 'train' if index < int(len(identities) * .7) else 'validation' if index < int(len(identities) * .85) else 'test' for index, identity in enumerate(identities)}
        members = {Path(name).name: name for name in archive.namelist() if name.startswith('Corpus/children/audio/') and name.endswith('.wav')}
        annotations = json.loads(archive.read('Corpus/children/annotations/code_switched_labels.json'))
        seen = set()
        for annotation in annotations:
            filename = Path(annotation['audio_filepath'].strip()).name
            if not re.fullmatch(r'CH\d{5,}\.wav', filename):
                raise ValueError('Unexpected archive audio filename')
            subject = filename[:4]
            transcript = annotation.get('transcription', '').strip()
            if subject not in speakers or filename not in members or not transcript:
                skipped += 1
                continue
            if filename in seen:
                raise ValueError('Duplicate utterance annotation')
            seen.add(filename)
            data = archive.read(members[filename])
            info = sf.info(io.BytesIO(data))
            if not .25 <= info.duration <= 60:
                skipped += 1
                continue
            path = audio_root / filename
            path.write_bytes(data)
            publisher_split = members[filename].split('/')[-2]
            publisher_groups.setdefault(publisher_split, set()).add(subject)
            has_devanagari = bool(re.search(r'[\u0900-\u097f]', transcript))
            language = 'hi' if has_devanagari else 'en'
            rows.append({'audio_path': str(path), 'utterance_id': filename[:-4], 'participant_id': subject,
                'age': int(speakers[subject]['Age']), 'first_language': speakers[subject]['L1'],
                'language': language, 'language_label_source': 'transcript_script_in_hi_en_corpus_not_phoneme_annotation',
                'transcript': transcript, 'duration_seconds': info.duration, 'sample_rate': info.samplerate,
                'audio_sha256': hashlib.sha256(data).hexdigest(), 'dataset': 'HiACC/children',
                'split': groups[subject], 'publisher_split': publisher_split, 'label_source': 'original_corpus_transcript',
                'speaker_role_audited': False, 'phoneme_error_labels': False, 'production_eligible': False})
    for split in ['train', 'validation', 'test']:
        (destination / f'{split}.jsonl').write_text('\n'.join(json.dumps(row, ensure_ascii=False) for row in rows if row['split'] == split) + '\n', encoding='utf-8')
    overlap = sorted({subject for subject in speakers if sum(subject in values for values in publisher_groups.values()) > 1})
    report = {'utterances': len(rows), 'participants': len({row['participant_id'] for row in rows}),
        'ages': sorted({row['age'] for row in rows}), 'skipped_missing_empty_or_duration': skipped,
        'partition': 'participant_disjoint_70_15_15', 'publisher_cross_partition_participants': len(overlap),
        'limitations': ['Interviewer/talker identity has not been audited', 'No Malayalam recordings',
            'Not representative of the entire age 4–21 cohort', 'Not a dysarthric/phoneme-error corpus', 'License metadata and paper conflict'],
        'production_eligible': False, 'clinical_validation': 'not_performed'}
    (destination / 'manifest_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
