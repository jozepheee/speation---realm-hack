"""Train an unreleased English phone-rating research model on real expert labels.

Acoustic frame memory and canonical-phone queries are trained against five-expert
ratings. Attention is not validated phone localization. This model is deliberately
not loaded by the learner API and cannot claim clinical error categories.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
import ctranslate2
from config import settings
from fluency.asr import get_asr_model
from fluency.audio import decode_audio


class PhoneSequenceRegressor(nn.Module):
    def __init__(self, phones, acoustic_dimension):
        super().__init__()
        self.acoustic = nn.Linear(acoustic_dimension, 128)
        self.phone = nn.Embedding(phones, 128, padding_idx=0)
        self.position = nn.Embedding(512, 128)
        self.decoder = nn.TransformerDecoder(nn.TransformerDecoderLayer(128, 4, 256, dropout=.1, batch_first=True), 2)
        self.rating = nn.Linear(128, 1)

    def forward(self, memory, tokens, memory_padding, token_padding):
        acoustic = self.acoustic(memory)
        acoustic = acoustic + self.position(torch.arange(memory.shape[1], device=memory.device))[None]
        queries = self.phone(tokens) + self.position(torch.arange(tokens.shape[1], device=tokens.device))[None]
        decoded = self.decoder(queries, acoustic, tgt_key_padding_mask=token_padding,
            memory_key_padding_mask=memory_padding)
        return torch.sigmoid(self.rating(decoded).squeeze(-1)) * 2


def train(manifest_dir, output, epochs):
    torch.manual_seed(20261014)
    torch.set_num_threads(4)
    source, destination = Path(manifest_dir), Path(output)
    destination.mkdir(parents=True, exist_ok=True)
    splits = {split: [json.loads(line) for line in (source / f'{split}.jsonl').read_text().splitlines() if line.strip()]
        for split in ['train', 'validation', 'test']}
    for left, right in [('train', 'validation'), ('train', 'test'), ('validation', 'test')]:
        for field in ['speaker_key', 'audio_sha256']:
            if {row[field] for row in splits[left]} & {row[field] for row in splits[right]}:
                raise ValueError(f'{field} leakage between partitions')
    if any(row['language'] != 'en' or not 4 <= row['age'] < 18 or row['label_source'] != 'five_expert_pronunciation_raters'
           for rows in splits.values() for row in rows):
        raise ValueError('Use the prepared English child expert corpus only')
    vocabulary = sorted({phone['expected_phone'] for row in splits['train'] for phone in row['phones']})
    lookup = {phone: index + 1 for index, phone in enumerate(vocabulary)}
    cache = destination / 'acoustic_features'; cache.mkdir(exist_ok=True)
    encoder = get_asr_model(model_name='small.en', local_only=True, download_root=settings.CARE_ASR_CACHE_DIR or None)
    tensors = {}
    for split, rows in splits.items():
        examples = []
        for index, row in enumerate(rows):
            raw = Path(row['audio_path']).read_bytes()
            if hashlib.sha256(raw).hexdigest() != row['audio_sha256']:
                raise ValueError('Audio changed after manifest preparation')
            cached = cache / f"small-en-{row['audio_sha256']}.npy"
            if cached.exists():
                vectors = np.load(cached, allow_pickle=False)
            else:
                waveform = decode_audio(raw)
                features = encoder.feature_extractor(waveform)
                features = features[:, :features.shape[-1] // 2 * 2]
                encoded = encoder.model.encode(ctranslate2.StorageView.from_array(np.ascontiguousarray(features[None])), to_cpu=True)
                vectors = np.array(encoded)[0].astype(np.float32)
                # Bound memory length without inventing segment times or labels.
                if len(vectors) > 500:
                    vectors = nn.functional.adaptive_avg_pool1d(torch.from_numpy(vectors).T[None], 500)[0].T.numpy()
                np.save(cached, vectors, allow_pickle=False)
            phones = row['phones']
            if not phones or len(phones) > 500:
                raise ValueError('Unsupported phone sequence length')
            examples.append((torch.from_numpy(vectors), torch.tensor([lookup.get(phone['expected_phone'], 0) for phone in phones]),
                torch.tensor([float(phone['expert_score']) for phone in phones]), row))
            if (index + 1) % 20 == 0:
                print(f'Extracted actual {split} audio: {index + 1}/{len(rows)}', flush=True)
        if not examples:
            raise ValueError('Every partition must contain audio')
        tensors[split] = examples
    mean = torch.cat([item[0] for item in tensors['train']]).mean(0)
    std = torch.cat([item[0] for item in tensors['train']]).std(0, unbiased=False).clamp_min(1e-6)

    def batch(items):
        frames, phones = max(len(item[0]) for item in items), max(len(item[1]) for item in items)
        memory = torch.zeros(len(items), frames, len(mean))
        tokens = torch.zeros(len(items), phones, dtype=torch.long)
        labels = torch.zeros(len(items), phones)
        memory_mask = torch.ones(len(items), frames, dtype=torch.bool)
        for index, (vectors, expected, ratings, _) in enumerate(items):
            memory[index, :len(vectors)] = (vectors - mean) / std
            tokens[index, :len(expected)] = expected
            labels[index, :len(ratings)] = ratings
            memory_mask[index, :len(vectors)] = False
        return memory, tokens, labels, memory_mask, tokens == 0

    model = PhoneSequenceRegressor(len(vocabulary) + 1, len(mean))
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)
    best, state = float('inf'), None
    for epoch in range(epochs):
        model.train()
        order = torch.randperm(len(tensors['train'])).tolist()
        for start in range(0, len(order), 8):
            items = [tensors['train'][i] for i in order[start:start + 8]]
            memory, tokens, labels, memory_mask, token_mask = batch(items)
            predicted = model(memory, tokens, memory_mask, token_mask)
            loss = ((predicted - labels) ** 2)[~token_mask].mean()
            optimizer.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1); optimizer.step()
        model.eval()
        differences = []
        with torch.no_grad():
            for start in range(0, len(tensors['validation']), 8):
                memory, tokens, labels, memory_mask, token_mask = batch(tensors['validation'][start:start + 8])
                differences.extend(((model(memory, tokens, memory_mask, token_mask) - labels) ** 2)[~token_mask].tolist())
        validation = float(np.mean(differences))
        print(json.dumps({'epoch': epoch + 1, 'validation_phone_rating_mse': validation}), flush=True)
        if validation < best:
            best, state = validation, {key: value.detach().clone() for key, value in model.state_dict().items()}
    model.load_state_dict(state); model.eval()
    actual, predicted, silent = [], [], []
    with torch.no_grad():
        for start in range(0, len(tensors['test']), 8):
            memory, tokens, labels, memory_mask, token_mask = batch(tensors['test'][start:start + 8])
            actual.extend(labels[~token_mask].tolist())
            predicted.extend(model(memory, tokens, memory_mask, token_mask)[~token_mask].tolist())
            silent.extend(model(torch.zeros_like(memory), tokens, memory_mask, token_mask)[~token_mask].tolist())
    actual, predicted, silent = map(np.asarray, [actual, predicted, silent])
    truth, detection = actual < .5, predicted < .5
    tp, fp, fn, tn = [int(np.sum(value)) for value in [truth & detection, ~truth & detection, truth & ~detection, ~truth & ~detection]]
    training_mean = float(torch.cat([item[2][item[1] != 0] for item in tensors['train']]).mean())
    report = {'release_approved': False, 'assessment': 'research_prediction_of_expert_english_L2_phone_ratings',
        'encoder': 'faster-whisper/small.en', 'encoder_frozen': True, 'weak_sequence_supervision': True,
        'gold_timestamps': False, 'clinical_validation': False, 'automatic_category_classifier': False,
        'test_speakers': len({row['speaker_key'] for row in splits['test']}), 'evaluated_phones': len(actual),
        'phone_rating_mse': float(np.mean((predicted - actual) ** 2)), 'phone_rating_mae': float(np.mean(np.abs(predicted - actual))),
        'constant_training_mean_mse': float(np.mean((actual - training_mean) ** 2)),
        'zero_audio_memory_mse': float(np.mean((silent - actual) ** 2)),
        'uncalibrated_error_threshold': .5, 'error_confusion': {'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn},
        'precision': tp / (tp + fp) if tp + fp else None, 'recall': tp / (tp + fn) if tp + fn else None,
        'uncovered_test_phones': sum(phone['expected_phone'] not in lookup for row in splits['test'] for phone in row['phones']),
        'limitations': ['Small non-native English sample', 'Not speech-disorder or Malayalam/Hindi validation',
            'Attention is not validated phone localization', 'Expert accent scores are not clinical outcomes',
            'No production correction permitted without calibration and cohort evaluation']}
    torch.save({'state_dict': state, 'phones': vocabulary, 'mean': mean, 'std': std, 'report': report}, destination / 'phone_sequence_research.pt')
    (destination / 'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest-dir', default='data/speechocean-child-research')
    parser.add_argument('--output', default='artifacts/phone-sequence-research')
    parser.add_argument('--epochs', type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.epochs <= 100:
        raise ValueError('Use 1–100 epochs')
    train(args.manifest_dir, args.output, args.epochs)
