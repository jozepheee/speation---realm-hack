"""Recover clips from a pinned public mirror; official annotations remain authoritative."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from huggingface_hub import snapshot_download
from training.prepare_data import grouped_splits, safe_name
from ml_settings import ROOT, EVENT_LABELS
REPO='saeedzou/sep28k-fluencybank-stutter-dataset'
REVISION='e8f1b699b9c05feedbdd617a1bceb27ee5ed1eab'

def main():
    import pyarrow.parquet as pq
    p=argparse.ArgumentParser(); p.add_argument('--root',type=Path,default=ROOT/'data'/'sep28k')
    args=p.parse_args(); root=args.root
    official={}
    for dataset in ['SEP-28k','fluencybank']:
        with (root/f'{dataset}_labels.csv').open(encoding='utf-8-sig') as f:
            for raw in csv.DictReader(f,skipinitialspace=True):
                row={k:v.strip() for k,v in raw.items()}
                key=(row['Show'],int(row['EpId']),int(row['ClipId']))
                official[key]=(dataset,row)
    sources={}
    for dataset in ['SEP-28k','fluencybank']:
        with (root/f'{dataset}_episodes.csv').open(encoding='utf-8-sig',errors='replace') as f:
            for row in csv.reader(f,skipinitialspace=True):
                sources[(row[3].strip(),int(row[4]))]=row[2].strip()
    manifest=root/'manifest.jsonl'
    records={r['id']:r for r in map(json.loads,manifest.read_text().splitlines())}
    downloaded=None
    for attempt in range(5):
        try:
            downloaded=Path(snapshot_download(REPO,repo_type='dataset',revision=REVISION,
                   allow_patterns=['data/*.parquet'],local_dir=ROOT/'data'/'mirror',max_workers=3))
            break
        except Exception:
            if attempt==4: raise
            print(f'Retrying interrupted mirror download ({attempt+1}/5)',flush=True)
    added=0; rejected=[]; checks=[]
    for file in sorted(downloaded.glob('data/*.parquet')):
        for batch in pq.ParquetFile(file).iter_batches(batch_size=64):
            for mirrored in batch.to_pylist():
                key=(mirrored['Show'],int(mirrored['EpId']),int(mirrored['ClipId']))
                if key not in official:
                    rejected.append({'key':list(key),'reason':'No matching official annotation'}); continue
                dataset,row=official[key]
                # A mirror is a transport source, never an alternative ground-truth label source.
                if any(int(mirrored[k])!=int(row[k]) for k in row if k not in ['Show','EpId','ClipId']):
                    rejected.append({'key':list(key),'reason':'Official annotation mismatch'}); continue
                if any(int(row[k])>=2 for k in ['PoorAudioQuality','NoSpeech','Unsure','Music']): continue
                encoded=mirrored['audio']['bytes']
                audio,rate=sf.read(io.BytesIO(encoded),dtype='float32')
                if audio.ndim>1: audio=audio.mean(axis=1)
                expected=int(row['Stop'])-int(row['Start'])
                if rate!=16000 or abs(len(audio)-expected)>16 or not np.isfinite(audio).all():
                    rejected.append({'key':list(key),'reason':'Audio format or boundary mismatch'}); continue
                if np.sqrt(np.mean(audio**2))<1e-5: continue
                episode=row['EpId']
                identifier=f"{dataset}_{safe_name(row['Show'])}_{safe_name(episode)}_{safe_name(row['ClipId'])}"
                if identifier in records:
                    if len(checks)<100:
                        existing,_=sf.read(records[identifier]['audio'],dtype='float32')
                        if len(existing)==len(audio):
                            correlation=float(np.corrcoef(existing,audio)[0,1])
                            if not np.isfinite(correlation) or correlation<0.99:
                                raise ValueError('Mirror audio does not align with the official downloaded recording')
                            checks.append(correlation)
                    continue
                path=root/'clips'/f'{identifier}.wav'; sf.write(path,audio,16000)
                group=f"{dataset}:{row['Show']}" if dataset=='SEP-28k' else f'{dataset}:{episode}'
                records[identifier]={'id':identifier,'audio':str(path.resolve()),'group':group,'dataset':dataset,
                    'labels':[int(row[k])/3 for k in EVENT_LABELS],
                    'source_url':sources[(row['Show'],int(row['EpId']))],
                    'mirror_repository':REPO,'mirror_revision':REVISION,
                    'audio_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                added+=1
        print(f'{file.name}: {added} recovered clips so far',flush=True)
    splits=grouped_splits([r['group'] for r in records.values()])
    for record in records.values(): record['split']=splits[record['group']]
    partial=manifest.with_suffix('.partial')
    partial.write_text(''.join(json.dumps(r)+'\n' for r in sorted(records.values(),key=lambda r:r['id'])))
    partial.replace(manifest)
    report={'mirror':REPO,'revision':REVISION,'added_clips':added,'total_clips':len(records),
            'overlap_audio_checks':len(checks),'minimum_overlap_correlation':min(checks) if checks else None,
            'datasets':{d:sum(r['dataset']==d for r in records.values()) for d in ['SEP-28k','fluencybank']},
            'rejected':rejected}
    (root/'mirror_report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='rejected'},indent=2),flush=True)
if __name__=='__main__': main()
