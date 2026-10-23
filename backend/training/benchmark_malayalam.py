"""Actual local Malayalam ASR smoke evaluation on clearly labelled adult speech."""
import asyncio
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlparse
import httpx
from fluency.audio import decode_audio
from learners.care_router import playback_wav
from learners.recognition import recognize
from training.benchmark_child_asr import normalize, distance


async def main():
    root = Path(__file__).resolve().parents[2]
    directory = root / 'data/imasc-adult-smoke'; directory.mkdir(parents=True, exist_ok=True)
    snapshot = directory / 'selected_rows.json'
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        if snapshot.exists():
            rows = json.loads(snapshot.read_text(encoding='utf-8'))
        else:
            response = await client.get('https://datasets-server.huggingface.co/rows', params={
                'dataset': 'thennal/IMaSC', 'config': 'default', 'split': 'train', 'offset': 0, 'length': 6})
            response.raise_for_status()
            original = response.json()['rows']
            rows = []
            for item in original:
                record = item['row']
                # This speaker's age is explicitly documented in the original card.
                if record['speaker'] != 'Sonia':
                    raise ValueError('Audit speaker metadata before changing the selected sample')
                url = record['audio'][0]['src']
                host = urlparse(url).hostname or ''
                if not host.endswith('huggingface.co'):
                    raise ValueError('Unexpected corpus audio source')
                audio_response = await client.get(url)
                audio_response.raise_for_status()
                raw = audio_response.content
                waveform = decode_audio(raw)
                filename = f"row-{item['row_idx']}.audio"
                (directory / filename).write_bytes(raw)
                rows.append({'utterance_id': f"IMaSC-{item['row_idx']}", 'speaker': 'Sonia', 'age': 43,
                    'language': 'ml', 'transcript': record['text'], 'filename': filename,
                    'audio_sha256': hashlib.sha256(raw).hexdigest(), 'duration_seconds': len(waveform) / 16000,
                    'license': 'CC-BY-SA-4.0', 'speech_profile': 'adult_studio_read_speech_not_impaired'})
            snapshot.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    results = []
    for row in rows:
        started = time.perf_counter()
        result = {key: row[key] for key in ['utterance_id', 'speaker', 'age', 'language', 'duration_seconds']}
        try:
            raw = (directory / row['filename']).read_bytes()
            if hashlib.sha256(raw).hexdigest() != row['audio_sha256']:
                raise ValueError('Cached research audio changed')
            waveform = decode_audio(raw)
            predicted, _, provenance = await recognize(waveform, playback_wav(waveform), 'ml', 'local_whisper', 'selected_language')
            expected, actual = normalize(row['transcript']), normalize(predicted)
            result.update(status='recognized', reference=row['transcript'], prediction=predicted, provenance=provenance,
                word_edits=distance(expected.split(), actual.split()), words=len(expected.split()),
                character_edits=distance(expected, actual), characters=len(expected))
        except Exception as error:
            result.update(status='failed', error_type=type(error).__name__)
        result['latency_seconds'] = round(time.perf_counter() - started, 3)
        results.append(result)
        print(f"Malayalam {row['utterance_id']}: {result['status']}", flush=True)
    valid = [item for item in results if item['status'] == 'recognized']
    report = {'scope': 'six_adult_Malayalam_studio_clips_local_ASR_smoke_only', 'provider': 'local_whisper',
        'source': 'https://huggingface.co/datasets/thennal/IMaSC', 'license': 'CC-BY-SA-4.0',
        'selection': 'first_six_rows_predeclared_before_predictions', 'speaker_count': 1, 'speaker_age': 43,
        'recognized_clips': len(valid), 'failed_clips': len(results) - len(valid),
        'wer': sum(item['word_edits'] for item in valid) / sum(item['words'] for item in valid) if valid else None,
        'cer': sum(item['character_edits'] for item in valid) / sum(item['characters'] for item in valid) if valid else None,
        'pediatric_validation': False, 'impaired_speech_validation': False, 'cloud_audio_transmitted': False,
        'limitations': ['One adult speaker, age 43', 'Clean studio read speech', 'Small fixed sample',
            'Cannot validate children, dialect coverage, dysarthric translation or phoneme errors'], 'results': results}
    output = root / 'artifacts/asr-research/local_whisper-imasc-adult-smoke.json'; output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
