"""Explicitly download and hash the Apache-2.0 phone model; never run during requests."""
import argparse
import hashlib
import json
from pathlib import Path
from huggingface_hub import snapshot_download

MODEL = 'facebook/wav2vec2-xlsr-53-espeak-cv-ft'
REVISION = '2c733782da5604684829819a5eb744c193fe9398'
FILES = ['config.json', 'preprocessor_config.json', 'pytorch_model.bin', 'vocab.json']

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--language',choices=['universal','hi'],default='universal')
    args = parser.parse_args()
    if args.language=='hi':
        MODEL='xnpx/wav2vec2-large-xlsr-ipa-phonemes'
        REVISION='b49467edc29244a0deb63afeca52f137f88ecc90'
        FILES=['config.json','preprocessor_config.json','model.safetensors','vocab.json']
    directory = Path(snapshot_download(MODEL, revision=REVISION, local_dir=args.output,
        allow_patterns=[*FILES, 'README.md'], max_workers=2))
    hashes = {}
    for name in FILES:
        with (directory / name).open('rb') as source:
            hashes[name] = hashlib.file_digest(source, 'sha256').hexdigest()
    (directory / 'speation-model.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION,
        'license': 'Apache-2.0', 'sha256': hashes}, indent=2), encoding='utf-8')
    print('Revision-pinned phone model and integrity manifest prepared.')
