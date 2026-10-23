"""Package only algorithm code and public annotations, never application secrets."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]


def main():
    destination = ROOT / 'artifacts' / 'colab'
    destination.mkdir(parents=True, exist_ok=True)
    sources = [ROOT / 'backend' / 'ml_settings.py']
    for folder in ['fluency', 'scheduler', 'training']:
        sources += list((ROOT / 'backend' / folder).glob('*.py'))
    # Routers/services import database config. Colab needs only ML modules.
    sources = [p for p in sources if p.name not in
               ['router.py', 'service.py', 'export_transitions.py', 'build_colab_bundle.py',
                'verify_runtime.py']]
    sources += list((ROOT / 'data' / 'sep28k').glob('*.csv'))
    sources += [ROOT / 'artifacts' / 'scheduler_v3' / name
                for name in ['dqn.zip', 'metadata.json']]
    with ZipFile(destination / 'neuronudge_colab_source.zip', 'w', ZIP_DEFLATED) as bundle:
        for path in sources:
            if path.is_file():
                bundle.write(path, path.relative_to(ROOT).as_posix())
    cells = []

    def cell(kind, source):
        entry = {'cell_type': kind, 'id': f'cell-{len(cells)}', 'metadata': {}, 'source': source.splitlines(keepends=True)}
        if kind == 'code':
            entry.update(execution_count=None, outputs=[])
        cells.append(entry)

    cell('markdown', '''# NeuroNudge: GPU training and artifact export
Choose **Runtime → Change runtime type → GPU**, then run cells in order.
Upload `neuronudge_colab_source.zip`, created alongside this notebook.
Only algorithm code, public dataset annotations and the completed DQN are packaged.
No app credentials or private user recordings are included. This is specification v3.

This trains scalar modality attention on mean-pooled Wav2Vec2-base (768) and
MiniLM (384), with Whisper medium transcripts. Training uses SEP-28K only,
up to 80 epochs with early stopping, MSE and training-only Z-score statistics.
The target is an annotator-vote penalty proxy, not a clinical score.
The six-state DQN uses the specified five-part reward and a synthetic simulator.
Drive stores resumable clips/features/checkpoints; allow about 10 GB of free space.
Colab GPU availability and runtime limits vary. Reconnect and rerun to resume.
''')
    cell('code', '''from google.colab import drive, files
from pathlib import Path
import os, zipfile, subprocess, sys, json, hashlib, time
drive.mount('/content/drive')
WORK = Path('/content/neuronudge')
STORE = Path('/content/drive/MyDrive/NeuroNudge-training-v3')
STORE.mkdir(parents=True, exist_ok=True)
WORK.mkdir(exist_ok=True)
bundle = STORE / 'neuronudge_colab_source.zip'
if not bundle.exists():
    uploaded = files.upload()
    name = 'neuronudge_colab_source.zip'
    assert name in uploaded, 'Upload the source zip created with this notebook'
    bundle.write_bytes(uploaded[name])
for name in ['data', 'artifacts']:
    (STORE / name).mkdir(exist_ok=True)
    link = WORK / name
    if not link.exists(): link.symlink_to(STORE / name, target_is_directory=True)
with zipfile.ZipFile(bundle) as archive:
    for name in archive.namelist():
        target = WORK / name
        # Preserve existing persistent data/artifacts when reconnecting.
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
os.chdir(WORK / 'backend')
os.environ['ML_DEVICE'] = 'cuda'
os.environ['USE_TF'] = '0'
os.environ['HF_HOME'] = '/content/hf-cache'
''')
    cell('code', '''%pip -q install "transformers>=4.38,<5" "sentence-transformers>=2.5,<6" "faster-whisper>=1.1,<2" "huggingface-hub<1" av librosa soundfile pyarrow "stable-baselines3==2.7.1" "gymnasium>=0.29,<1.3" nvidia-cublas-cu12 nvidia-cudnn-cu12
import torch
assert torch.cuda.is_available(), 'Select a GPU runtime before continuing'
print(torch.cuda.get_device_name(0))
# CTranslate2 uses CUDA libraries installed by pip. Child jobs inherit these paths.
import site
libraries = [str(Path(torch.__file__).parent / 'lib')]
for base in site.getsitepackages():
    libraries += [str(p) for p in (Path(base) / 'nvidia').glob('*/lib')]
os.environ['LD_LIBRARY_PATH'] = ':'.join(libraries + [os.environ.get('LD_LIBRARY_PATH', '')])
def run(module, *args):
    subprocess.run([sys.executable, '-u', '-m', module, *map(str, args)], check=True)
''')
    cell('markdown', '''## Recover and verify the labelled clips
The mirror is used for audio transport; every annotation must match the official
CSV. Only SEP-28K is selected for this specification. Splits are grouped to avoid
source leakage, targeting approximately 80/10/10 groups; actual clip counts differ.
Recovery must finish before extraction. No TalkBank login is bypassed.
''')
    cell('code', '''dataset = WORK / 'data' / 'sep28k'
dataset.mkdir(exist_ok=True)
(dataset / 'clips').mkdir(exist_ok=True)
assert all((dataset / f'{d}_{kind}.csv').exists()
           for d in ['SEP-28k', 'fluencybank'] for kind in ['labels', 'episodes']), 'Public CSV files missing from source bundle'
manifest = dataset / 'manifest.jsonl'
if not manifest.exists(): manifest.write_text('')
if not (dataset / 'mirror_report.json').exists():
    run('training.recover_mirror')
report = json.loads((dataset / 'mirror_report.json').read_text())
print({k: v for k, v in report.items() if k != 'rejected'})
from training.prepare_data import specification_manifest
selected = dataset / 'manifest_v3.jsonl'
rows = specification_manifest(manifest, selected)
manifest = selected
print('Selected SEP-28K clips:', len(rows))
''')
    cell('markdown', '''## Extract features, then train and evaluate
The first job uses Whisper medium, frozen Wav2Vec2-base and MiniLM on the GPU.
Each feature file persists independently, so rerunning skips completed clips.
The second job trains scalar attention for up to 80 epochs, stops after 12 epochs
without validation RMSE improvement, and resumes `last.pt`.
Validation selects the best checkpoint; the untouched test split supplies final metrics.
''')
    cell('code', '''features = WORK / 'data' / 'features_v3'
# A short benchmark gives an estimate for THIS allocated GPU. It caches these clips.
if not (features / 'benchmark.json').exists():
    run('training.cache_features', '--manifest', manifest, '--out', features, '--limit', 100)
print((features / 'benchmark.json').read_text())
''')
    cell('code', '''features = WORK / 'data' / 'features_v3'
started = time.monotonic()
run('training.cache_features', '--manifest', manifest, '--out', features)
print('Feature extraction elapsed hours:', round((time.monotonic() - started) / 3600, 2))
''')
    cell('code', '''output = WORK / 'artifacts' / 'fluency_v3'
args = ['--manifest', features / 'manifest.jsonl', '--cache', features,
        '--out', output, '--epochs', 80, '--device', 'cuda']
if (output / 'last.pt').exists(): args += ['--resume', output / 'last.pt']
run('training.train_fusion', *args)
evaluation = json.loads((output / 'evaluation.json').read_text())
assert evaluation['checkpoint_sha256'] == hashlib.sha256((output / 'best.pt').read_bytes()).hexdigest()
print(json.dumps(evaluation['test'], indent=2))
''')
    cell('markdown', '''## Train the matching six-state DQN if needed
An existing evaluated specification-v3 checkpoint is included when available.
The earlier 36-state model is incompatible and is never used here.
''')
    cell('code', '''scheduler_output = WORK / 'artifacts' / 'scheduler_v3'
metadata_path = scheduler_output / 'metadata.json'
if not metadata_path.exists():
    run('scheduler.train_dqn', '--steps', 200000, '--out', scheduler_output)
metadata = json.loads(metadata_path.read_text())
assert metadata['schema_version'] == 3 and metadata['state_dim'] == 6 and metadata['steps'] >= 200000
assert metadata['sha256'] == hashlib.sha256((scheduler_output / 'dqn.zip').read_bytes()).hexdigest()
print(json.dumps(metadata['evaluation'], indent=2))
''')
    cell('markdown', '''## Download the app artifacts
The small export includes learned fusion weights, evaluation/history and the
matching DQN with its metadata, plus normalization statistics. Audio, feature caches and optimizer states
remain in your Drive. Metrics alone cannot run inference: the app needs weights.
Extract the returned zip into the local project root (it contains `artifacts/`).
The pretrained encoders must also remain available on the app server.
''')
    cell('code', '''export = STORE / 'neuronudge_trained_artifacts.zip'
names = ['fluency_v3/best.pt', 'fluency_v3/evaluation.json', 'fluency_v3/history.json',
         'fluency_v3/norm_stats.json', 'scheduler_v3/dqn.zip', 'scheduler_v3/metadata.json']
with zipfile.ZipFile(export, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        path = WORK / 'artifacts' / name
        assert path.exists(), f'Missing artifact: {name}'
        archive.write(path, 'artifacts/' + name)
files.download(str(export))
''')
    notebook = {'nbformat': 4, 'nbformat_minor': 5, 'cells': cells,
                'metadata': {'colab': {'name': 'NeuroNudge_GPU_Training.ipynb'},
                             'accelerator': 'GPU',
                             'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}}}
    notebook_path = ROOT / 'docs' / 'NeuroNudge_GPU_Training.ipynb'
    notebook_path.write_text(json.dumps(notebook, indent=2), encoding='utf-8')
    # Check Python cell syntax without running Colab-only APIs.
    for entry in cells:
        if entry['cell_type'] == 'code':
            source = ''.join(entry['source'])
            compile('\n'.join(line for line in source.splitlines()
                              if not line.startswith('%')), '<colab cell>', 'exec')
    print(notebook_path)
    print(destination / 'neuronudge_colab_source.zip')


if __name__ == '__main__':
    main()
