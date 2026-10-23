"""Sequential, logged orchestration. Safe to resume after downloads or feature extraction."""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from ml_settings import ROOT, ARTIFACTS

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--wait-for-manifest',action='store_true')
    p.add_argument('--epochs',type=int,default=80)
    args=p.parse_args()
    output=ARTIFACTS/'fluency_v3'; output.mkdir(parents=True,exist_ok=True)
    manifest=ROOT/'data'/'sep28k'/'manifest.jsonl'
    def status(stage,**extra):
        (output/'job_status.json').write_text(json.dumps({'stage':stage,'updated_at':datetime.now(timezone.utc).isoformat(),**extra},indent=2))
    try:
        status('preparing_pretrained_models')
        from fluency.acoustic import get_acoustic_encoder
        from fluency.semantic import get_semantic_encoder
        from fluency.asr import get_asr_model
        import torch
        torch.set_num_threads(4)
        for name, loader in [('Wav2Vec2-base', get_acoustic_encoder),
                             ('MiniLM', get_semantic_encoder), ('Whisper medium', get_asr_model)]:
            for attempt in range(1, 6):
                status('preparing_pretrained_models', model=name, attempt=attempt)
                try:
                    loader()
                    print(f'{name} ready', flush=True)
                    break
                except Exception as exc:
                    print(f'{name} attempt {attempt} failed: {type(exc).__name__}', flush=True)
                    if attempt == 5: raise
                    time.sleep(5)
        if args.wait_for_manifest:
            status('waiting_for_dataset_download')
            while not manifest.exists(): time.sleep(10)
        elif not manifest.exists():
            raise FileNotFoundError('Run training.prepare_data first')
        get_acoustic_encoder.cache_clear(); get_semantic_encoder.cache_clear(); get_asr_model.cache_clear()
        import gc
        gc.collect()
        from training.prepare_data import specification_manifest
        selected=manifest.with_name('manifest_v3.jsonl')
        specification_manifest(manifest,selected)
        manifest=selected
        rows=[json.loads(l) for l in manifest.read_text().splitlines() if l.strip()]
        coverage={name:sum(r['dataset']==name for r in rows) for name in ['SEP-28k','fluencybank']}
        status('extracting_features',dataset_counts=coverage)
        with (output/'feature_extraction.log').open('a',encoding='utf-8') as log:
            subprocess.run([sys.executable,'-u','-m','training.cache_features','--manifest',str(manifest),
                            '--out',str(ROOT/'data'/'features_v3')],cwd=ROOT/'backend',stdout=log,stderr=subprocess.STDOUT,check=True)
        manifest=ROOT/'data'/'features_v3'/'manifest.jsonl'
        retained=[json.loads(l) for l in manifest.read_text().splitlines() if l.strip()]
        coverage={name:sum(r['dataset']==name for r in retained) for name in ['SEP-28k','fluencybank']}
        status('training',dataset_counts=coverage,epochs=args.epochs)
        command=[sys.executable,'-u','-m','training.train_fusion','--manifest',str(manifest),
                 '--cache',str(ROOT/'data'/'features_v3'),'--epochs',str(args.epochs),'--out',str(output)]
        if (output/'last.pt').exists(): command+=['--resume',str(output/'last.pt')]
        with (output/'training.log').open('a',encoding='utf-8') as log:
            subprocess.run(command,cwd=ROOT/'backend',stdout=log,stderr=subprocess.STDOUT,check=True)
        status('completed',dataset_counts=coverage,epochs=args.epochs,
               proposal_data_complete=all(coverage.values()))
    except Exception as exc:
        status('failed',error=str(exc)); raise
if __name__=='__main__': main()
