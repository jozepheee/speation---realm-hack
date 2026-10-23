"""Local, target-independent phone hypotheses. Not a pronunciation score.

Weights must be explicitly downloaded/configured; inference never downloads files.
The transcript/reference text is not given to the acoustic recognizer.
"""
from functools import lru_cache
from pathlib import Path
from threading import Lock
import hashlib
import json
import time

_lock = Lock()


@lru_cache(maxsize=2)
def _load(directory):
    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2FeatureExtractor
    path = Path(directory)
    provenance = json.loads((path / 'speation-model.json').read_text(encoding='utf-8'))
    profiles={
        'facebook/wav2vec2-xlsr-53-espeak-cv-ft':('2c733782da5604684829819a5eb744c193fe9398','pytorch_model.bin',{'ɻ','ɭ','l','ʃ','ɪ','iː','θ','ʈ','ɖ','kʰ'}),
        'xnpx/wav2vec2-large-xlsr-ipa-phonemes':('b49467edc29244a0deb63afeca52f137f88ecc90','model.safetensors',{'t̪','d̪','ʈ','ɖ','k','kʰ'})}
    profile=profiles.get(provenance.get('model'))
    if profile is None or provenance.get('revision') != profile[0]:
        raise ValueError('Unexpected phone model revision')
    for name in ['config.json', 'preprocessor_config.json', profile[1], 'vocab.json']:
        with (path / name).open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != provenance['sha256'].get(name):
                raise ValueError('Phone model files changed')
    vocabulary = json.loads((path / 'vocab.json').read_text(encoding='utf-8'))
    if not profile[2].issubset(vocabulary):
        raise ValueError('Phone model cannot represent required regional focal sounds')
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(path, local_files_only=True)
    model = Wav2Vec2ForCTC.from_pretrained(path, local_files_only=True)
    model.eval()
    torch.set_num_threads(4)
    return extractor, model, {index: token for token, index in vocabulary.items()}, provenance


def observe(clip, directory):
    import torch
    from fluency.audio import decode_audio
    wave = decode_audio(clip)
    if len(wave) > 20 * 16000:
        raise ValueError('Phone analysis accepts clips up to twenty seconds')
    started = time.monotonic()
    if not _lock.acquire(blocking=False):
        raise RuntimeError('Phone analysis is busy')
    try:
        extractor, model, vocabulary, provenance = _load(str(Path(directory).resolve()))
        inputs = extractor(wave, sampling_rate=16000, return_tensors='pt')
        with torch.inference_mode():
            logits = model(**inputs).logits[0]
        probabilities = logits.softmax(-1)
        indices = logits.argmax(-1).tolist()
        emitted = []
        previous = None
        # Emission windows are approximate model frames, not measured phone boundaries.
        step = model.config.inputs_to_logits_ratio / 16000
        for frame, index in enumerate(indices):
            if index != previous and index != model.config.pad_token_id and vocabulary[index] not in ['<unk>','<s>','</s>','|']:
                top = probabilities[frame].topk(3)
                emitted.append({'phone': vocabulary[index], 'emission_seconds': round(frame * step, 3),
                    'peak_posterior':round(float(probabilities[frame,index]),5),
                    'alternatives': [{'phone': vocabulary[i], 'posterior': round(float(p), 5)}
                                     for p, i in zip(top.values.tolist(), top.indices.tolist())]})
            elif index==previous and emitted and index!=model.config.pad_token_id and emitted[-1]['phone']==vocabulary[index]:
                emitted[-1]['peak_posterior']=max(emitted[-1]['peak_posterior'],round(float(probabilities[frame,index]),5))
            previous = index
    finally:
        _lock.release()
    return {'source': provenance['model'],
        'revision': provenance['revision'],
        'scope': 'unvalidated_target_independent_phone_hypotheses', 'reference_text_supplied': False,
        'phones': [item['phone'] for item in emitted], 'emissions': emitted,
        'latency_seconds': round(time.monotonic() - started, 3), 'pronunciation_score': None,
        'instruction': 'These are fallible acoustic hypotheses, not verified errors or pronunciation scores. '
                       'Posterior values are not pronunciation correctness probabilities. Do not infer hidden tongue movement.'}
