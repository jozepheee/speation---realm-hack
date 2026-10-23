"""Modal training for specification v3. Run `python -m modal run modal_train.py --stage prepare`."""
from pathlib import Path
import modal

app = modal.App('neuronudge-training-v3')
volume = modal.Volume.from_name('neuronudge-training-v3', create_if_missing=True)
STORE = Path('/training')
WORK = Path('/opt/neuronudge')
image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('libsndfile1')
    .pip_install('torch==2.8.0', 'transformers>=4.41,<5', 'sentence-transformers>=2.5,<6',
                 'faster-whisper>=1.1,<2', 'huggingface-hub<1', 'av', 'librosa',
                 'soundfile', 'pyarrow', 'scipy', 'stable-baselines3==2.7.1',
                 'gymnasium>=0.29,<1.3', 'nvidia-cublas-cu12', 'nvidia-cudnn-cu12>=9,<10')
    .env({'USE_TF': '0', 'HF_HOME': '/training/hf-cache',
          'PYTHONPATH': '/opt:/opt/neuronudge/backend'})
)
# Explicitly upload the sanitized bundle and this runner, not app config or secrets.
if modal.is_local():
    bundle = Path(__file__).parent / 'artifacts' / 'colab' / 'neuronudge_colab_source.zip'
    if not bundle.is_file():
        raise FileNotFoundError('First run: python backend/training/build_colab_bundle.py')
    image = image.add_local_file(bundle, '/opt/source.zip', copy=True)
    image = image.add_local_file(__file__, '/opt/modal_train.py', copy=True)


def setup():
    import importlib
    import os
    import sys
    import zipfile
    volume.reload()
    WORK.mkdir(parents=True, exist_ok=True)
    for name in ['data', 'artifacts']:
        (STORE / name).mkdir(parents=True, exist_ok=True)
        link = WORK / name
        if not link.exists(): link.symlink_to(STORE / name, target_is_directory=True)
    with zipfile.ZipFile('/opt/source.zip') as archive:
        for name in archive.namelist():
            target = WORK / name
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
    os.chdir(WORK / 'backend')
    # Modal initializes Python before this directory is extracted. Update the
    # live interpreter as well as PYTHONPATH used by child training processes.
    sys.path.insert(0, str(WORK / 'backend'))
    importlib.invalidate_caches()
    if importlib.util.find_spec('training') is None:
        raise RuntimeError(f'Training package missing after extraction: {list((WORK / "backend").iterdir())}')


def status(stage, **extra):
    import json
    from datetime import datetime, timezone
    state = {'stage': stage, 'updated_at': datetime.now(timezone.utc).isoformat(), **extra}
    (STORE / 'status.json').write_text(json.dumps(state, indent=2))
    print(json.dumps(state), flush=True)


def half_training_manifest(rows, target):
    """Keep half of each training source group; retain every held-out clip."""
    import json
    import random
    from collections import defaultdict
    groups = defaultdict(list)
    selected = [r for r in rows if r['split'] != 'train']
    for row in rows:
        if row['split'] == 'train': groups[row['group']].append(row)
    rng = random.Random(42)
    for group in sorted(groups):
        clips = sorted(groups[group], key=lambda r: json.dumps(r, sort_keys=True))
        selected.extend(rng.sample(clips, (len(clips) + 1) // 2))
    selected.sort(key=lambda r: json.dumps(r, sort_keys=True))
    target.write_text(''.join(json.dumps(r) + '\n' for r in selected))
    return selected


def run(module, *args, device='cpu'):
    import os
    import site
    import subprocess
    import sys
    import time
    env = {**os.environ, 'ML_DEVICE': device}
    libraries = [str(p) for base in site.getsitepackages()
                 for p in (Path(base) / 'nvidia').glob('*/lib')]
    env['LD_LIBRARY_PATH'] = ':'.join(libraries + [env.get('LD_LIBRARY_PATH', '')])
    (STORE / 'logs').mkdir(exist_ok=True)
    last_commit = time.monotonic()
    with (STORE / 'logs' / (module + '.log')).open('a') as log:
        with subprocess.Popen([sys.executable, '-u', '-m', module, *map(str, args)],
                              env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, bufsize=1) as process:
            for line in process.stdout:
                print(line, end='', flush=True); log.write(line); log.flush()
                if time.monotonic() - last_commit >= 60:
                    volume.commit()
                    last_commit = time.monotonic()
            if process.wait(): raise RuntimeError(f'{module} failed; see its saved log')
    volume.commit()


@app.function(image=image, volumes={'/training': volume}, cpu=4, memory=12288,
              timeout=86400, max_containers=1, include_source=False)
def prepare(stage: str = 'prepare'):
    import json
    setup()
    if stage == 'status':
        print((STORE / 'status.json').read_text() if (STORE / 'status.json').exists() else 'Not started')
        benchmark = WORK / 'data' / 'features_v3' / 'benchmark.json'
        if benchmark.exists(): print(benchmark.read_text())
        return
    try:
        status('recovering_dataset')
        dataset = WORK / 'data' / 'sep28k'
        (dataset / 'clips').mkdir(parents=True, exist_ok=True)
        manifest = dataset / 'manifest.jsonl'
        if not manifest.exists(): manifest.write_text('')
        if not (dataset / 'mirror_report.json').exists(): run('training.recover_mirror')
        from training.prepare_data import specification_manifest
        rows = specification_manifest(manifest, dataset / 'manifest_v3.jsonl')
        rows = half_training_manifest(rows, dataset / 'manifest_v3_half_train.jsonl')
        status('downloading_pretrained_models', clips=len(rows))
        # CPU preflight keeps downloads off billed GPU time.
        import os
        import subprocess
        import sys
        subprocess.run([sys.executable, '-c',
            'from fluency.acoustic import get_acoustic_encoder; '
            'from fluency.semantic import get_semantic_encoder; '
            'from fluency.asr import get_asr_model; '
            'get_acoustic_encoder(); get_semantic_encoder(); get_asr_model(); print("Models ready")'],
            env={**os.environ, 'ML_DEVICE': 'cpu'}, check=True)
        status('prepared', clips=len(rows), splits={s: sum(r['split'] == s for r in rows)
                                                   for s in ['train', 'validation', 'test']})
    except Exception as exc:
        status('failed', error=str(exc)); raise
    finally:
        volume.commit()


@app.function(image=image, volumes={'/training': volume}, gpu='H200', cpu=4, memory=16384,
              timeout=86400, max_containers=1, include_source=False)
def train(stage: str = 'train'):
    import hashlib
    import json
    import zipfile
    setup()
    manifest = WORK / 'data' / 'sep28k' / 'manifest_v3_half_train.jsonl'
    if not manifest.exists(): raise RuntimeError('Run --stage prepare first')
    features = WORK / 'data' / 'features_v3'
    output = WORK / 'artifacts' / 'fluency_v3'
    try:
        if stage == 'benchmark':
            status('benchmarking_100_clips')
            run('training.cache_features', '--manifest', manifest, '--out', features, '--limit', 100, device='cuda')
            print((features / 'benchmark.json').read_text())
            status('benchmark_completed')
            return
        status('extracting_features')
        run('training.cache_features', '--manifest', manifest, '--out', features, device='cuda')
        status('training_fusion')
        args = ['--manifest', features / 'manifest.jsonl', '--cache', features,
                '--out', output, '--epochs', 80, '--device', 'cuda']
        if (output / 'last.pt').exists(): args += ['--resume', output / 'last.pt']
        run('training.train_fusion', *args, device='cuda')
        evaluation = json.loads((output / 'evaluation.json').read_text())
        assert evaluation['checkpoint_sha256'] == hashlib.sha256((output / 'best.pt').read_bytes()).hexdigest()
        scheduler = WORK / 'artifacts' / 'scheduler_v3'
        metadata = json.loads((scheduler / 'metadata.json').read_text())
        assert metadata['schema_version'] == 3 and metadata['state_dim'] == 6
        assert metadata['sha256'] == hashlib.sha256((scheduler / 'dqn.zip').read_bytes()).hexdigest()
        export = STORE / 'outputs' / 'neuronudge_trained_artifacts.zip'
        export.parent.mkdir(exist_ok=True)
        names = ['fluency_v3/best.pt', 'fluency_v3/norm_stats.json', 'fluency_v3/evaluation.json',
                 'fluency_v3/history.json', 'scheduler_v3/dqn.zip', 'scheduler_v3/metadata.json']
        with zipfile.ZipFile(export, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in names: archive.write(WORK / 'artifacts' / name, 'artifacts/' + name)
        status('completed', test=evaluation['test'], export='/outputs/neuronudge_trained_artifacts.zip')
    except Exception as exc:
        status('failed', error=str(exc)); raise
    finally:
        volume.commit()


@app.local_entrypoint()
def main(stage: str = 'all', wait_for_preparation: bool = False):
    if stage not in ['all', 'prepare', 'status', 'benchmark', 'train']:
        raise ValueError('Stage must be all, prepare, status, benchmark or train')
    if stage == 'all':
        workflow.remote(wait_for_preparation)
        return
    if stage in ['prepare', 'status']: prepare.remote(stage)
    else: train.remote(stage)


@app.function(image=image, volumes={'/training': volume}, cpu=.125, memory=512,
              timeout=86400, max_containers=1, include_source=False)
def workflow(wait_for_preparation: bool = False):
    """Cloud orchestration: no local client is required between stages."""
    import json
    import time
    if wait_for_preparation:
        deadline = time.monotonic() + 7200
        print('Cloud workflow running; waiting for the existing preparation job.', flush=True)
        while time.monotonic() < deadline:
            volume.reload()
            try:
                state = json.loads((STORE / 'status.json').read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                state = {}
            if state.get('stage') == 'prepared': break
            if state.get('stage') == 'failed': raise RuntimeError(state.get('error', 'Preparation failed'))
            time.sleep(15)
        else:
            raise TimeoutError('Existing preparation did not finish within two hours; inspect its dashboard.')
    else:
        prepare.remote('prepare')
    print('Preparation complete; starting H200 benchmark.', flush=True)
    train.remote('benchmark')
    print('Benchmark complete; starting H200 training with half the training clips.', flush=True)
    train.remote('train')
    print('Cloud workflow completed; export is saved in the Volume.', flush=True)
