"""Resumable frozen-encoder feature extraction from real labelled recordings."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import torch
from fluency.audio import decode_audio
from fluency.asr import transcribe_audio
from fluency.acoustic import acoustic_embeddings
from fluency.semantic import semantic_embeddings
from ml_settings import WAV2VEC_MODEL, SEMANTIC_MODEL, ASR_MODEL, SCHEMA_VERSION, InvalidAudioError, ModelUnavailableError

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--limit',type=int,default=0)
    args=p.parse_args(); args.out.mkdir(parents=True,exist_ok=True)
    torch.set_num_threads(4)
    rows=[json.loads(line) for line in args.manifest.read_text().splitlines() if line.strip()]
    total_rows=len(rows); timings=[]
    if args.limit: rows=rows[:args.limit]
    failures=[]; accepted=[]; fatal=False
    for i,row in enumerate(rows):
        target=args.out/(row['id']+'.pt')
        contract={'schema_version':SCHEMA_VERSION,'acoustic_model':WAV2VEC_MODEL,
                  'semantic_model':SEMANTIC_MODEL,'asr_model':ASR_MODEL,'audio_sha256':row['audio_sha256']}
        if target.exists():
            cached=torch.load(target,weights_only=True)
            if cached.get('contract')==contract:
                accepted.append(row); continue
        try:
            started=time.monotonic()
            audio=Path(row['audio']).read_bytes()
            if hashlib.sha256(audio).hexdigest()!=row['audio_sha256']: raise ValueError('Audio checksum changed')
            waveform=decode_audio(audio)
            transcript=transcribe_audio(waveform)
            record={'acoustic':acoustic_embeddings(waveform).clone(),
                    'semantic':semantic_embeddings(transcript).clone(),'transcript':transcript,'contract':contract}
            partial=target.with_suffix('.partial')
            torch.save(record,partial); partial.replace(target)
            accepted.append(row)
            if i>0: timings.append(time.monotonic()-started)
            print(f'{i+1}/{len(rows)} {row["id"]}',flush=True)
        except ModelUnavailableError:
            raise
        except Exception as exc:
            if not isinstance(exc,InvalidAudioError): fatal=True
            failures.append({'id':row['id'],'error':str(exc)})
            print(f'Failed {row["id"]}: {exc}',flush=True)
    (args.out/'failures.json').write_text(json.dumps(failures,indent=2))
    if fatal: raise RuntimeError('Unexpected feature failures; inspect failures.json before training')
    if not accepted: raise RuntimeError('No recordings have usable features')
    (args.out/'manifest.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in accepted))
    if timings:
        estimate={'timed_clips':len(timings),'mean_seconds_per_clip':sum(timings)/len(timings),
                  'dataset_clips':total_rows,'estimated_full_extraction_hours':total_rows*sum(timings)/len(timings)/3600,
                  'note':'Measured extraction speed; excludes downloads, training and interruptions.'}
        (args.out/'benchmark.json').write_text(json.dumps(estimate,indent=2))
        print(json.dumps(estimate),flush=True)
    print(f'Accepted {len(accepted)} clips; excluded {len(failures)} clips without usable speech',flush=True)
if __name__=='__main__': main()
