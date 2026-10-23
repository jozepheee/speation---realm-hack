"""Download official episode sources, extract labelled clips, and make grouped splits."""
import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import soundfile as sf
from ml_settings import EVENT_LABELS, ROOT
BASE='https://raw.githubusercontent.com/apple-aiml-research/ml-stuttering-events-dataset/main/'

def safe_name(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]+',value): raise ValueError('Unsafe dataset identifier')
    return value

def grouped_splits(groups, seed=42):
    groups=sorted(set(groups))
    if len(groups)<3: raise ValueError('At least three independent groups are needed')
    np.random.default_rng(seed).shuffle(groups)
    n=max(1,round(len(groups)*0.10))
    return {g:('test' if i<n else 'validation' if i<2*n else 'train') for i,g in enumerate(groups)}


def specification_manifest(source, target):
    """Latest description uses SEP-28K only; retain source separation for evaluation."""
    rows=[json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    rows=[r for r in rows if r['dataset']=='SEP-28k']
    splits=grouped_splits([r['group'] for r in rows])
    for row in rows: row['split']=splits[row['group']]
    target.write_text(''.join(json.dumps(r)+'\n' for r in rows))
    return rows

def download(url,path):
    if path.exists() and path.stat().st_size: return
    partial=path.with_suffix(path.suffix+'.partial')
    try:
        with urllib.request.urlopen(url,timeout=45) as response, partial.open('wb') as out:
            size=0
            while True:
                chunk=response.read(1024*1024)
                if not chunk: break
                size+=len(chunk)
                if size>1024**3: raise ValueError('Episode exceeds 1 GiB limit')
                out.write(chunk)
        partial.replace(path)
    except Exception:
        partial.unlink(missing_ok=True)
        raise

def extract_episode(task,root):
    import av
    dataset,show,episode,url,labels=task
    key=f'{dataset}_{safe_name(show)}_{safe_name(episode)}'
    source=root/'episodes'/f'{key}.media'
    download(url,source)
    # Decode the episode once; clip boundaries in official CSV are 16kHz samples.
    chunks=[]
    with av.open(str(source)) as container:
        resampler=av.AudioResampler(format='fltp',layout='mono',rate=16000)
        count=0
        for frame in container.decode(audio=0):
            for f in resampler.resample(frame):
                a=f.to_ndarray().reshape(-1); count+=len(a)
                if count>16000*60*180: raise ValueError('Episode exceeds 3 hour limit')
                chunks.append(a)
        chunks.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
    audio=np.concatenate(chunks)
    records=[]
    for row in labels:
        start,stop=int(row['Start']),int(row['Stop'])
        if start<0 or stop>len(audio) or stop<=start: continue
        clip_id=f"{key}_{safe_name(row['ClipId'])}"
        path=root/'clips'/f'{clip_id}.wav'
        y=audio[start:stop]
        if np.sqrt(np.mean(y*y))<1e-5: continue
        if not path.exists(): sf.write(path,y,16000)
        # Show-disjoint SEP splits are conservative because speakers recur across episodes.
        # FluencyBank episode IDs correspond to interview sources, not verified speaker IDs.
        group=f'{dataset}:{show}' if dataset=='SEP-28k' else f'{dataset}:{episode}'
        records.append({'id':clip_id,'audio':str(path.resolve()),'group':group,
                        'dataset':dataset,'labels':[int(row[k])/3 for k in EVENT_LABELS],
                        'source_url':url,'audio_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return records

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=ROOT/'data'/'sep28k')
    p.add_argument('--max-episodes',type=int,default=0,help='0 downloads all; nonzero is a data-access pilot')
    p.add_argument('--workers',type=int,default=3)
    args=p.parse_args(); root=args.root
    for sub in ['episodes','clips']: (root/sub).mkdir(parents=True,exist_ok=True)
    tasks=[]
    for dataset in ['SEP-28k','fluencybank']:
        for suffix in ['labels','episodes']:
            file=f'{dataset}_{suffix}.csv'; download(BASE+file,root/file)
        grouped={}
        with (root/f'{dataset}_labels.csv').open(encoding='utf-8-sig') as f:
            for raw in csv.DictReader(f,skipinitialspace=True):
                row={k:v.strip() for k,v in raw.items()}
                if any(int(row[k])>=2 for k in ['PoorAudioQuality','NoSpeech','Unsure','Music']): continue
                grouped.setdefault((row['Show'],row['EpId']),[]).append(row)
        with (root/f'{dataset}_episodes.csv').open(encoding='utf-8-sig',errors='replace') as f:
            for row in csv.reader(f,skipinitialspace=True):
                if len(row)<5: continue
                show,episode=row[3].strip(),row[4].strip()
                labels=grouped.get((show,episode),[])
                if labels: tasks.append((dataset,show,episode,row[2].strip(),labels))
    # Interleave sources so a limited access pilot covers more than one podcast.
    buckets={}
    for task in tasks: buckets.setdefault(task[:2],[]).append(task)
    tasks=[]
    while any(buckets.values()):
        for bucket in buckets.values():
            if bucket: tasks.append(bucket.pop(0))
    if args.max_episodes: tasks=tasks[:args.max_episodes]
    records,failures=[],[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(extract_episode,t,root):t for t in tasks}
        for future in as_completed(futures):
            t=futures[future]
            try:
                batch=future.result(); records.extend(batch)
                print(f'{t[0]} {t[1]} {t[2]}: {len(batch)} clips',flush=True)
            except Exception as exc:
                failures.append({'dataset':t[0],'show':t[1],'episode':t[2],'error':str(exc)})
                print(f'Unavailable: {t[0]} {t[1]} {t[2]}: {type(exc).__name__}',flush=True)
            (root/'download_report.json').write_text(json.dumps({'completed_clips':len(records),'failures':failures},indent=2))
    if len(set(r['group'] for r in records))<3:
        raise RuntimeError('Insufficient independent sources downloaded; see download_report.json')
    splits=grouped_splits([r['group'] for r in records])
    for r in records: r['split']=splits[r['group']]
    (root/'manifest.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in sorted(records,key=lambda x:x['id'])))
    print(json.dumps({'clips':len(records),'splits':{s:sum(r['split']==s for r in records) for s in ['train','validation','test']},'failed_episodes':len(failures)}),flush=True)
if __name__=='__main__': main()
