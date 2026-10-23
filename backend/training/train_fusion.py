"""Scalar-attention regression on the specified, explicitly heuristic vote target."""
import argparse
import hashlib
import json
import random
import time
import uuid
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from fluency.fusion import MultimodalAttentionFusion, normalize_features
from ml_settings import (ARTIFACTS, EVENT_LABELS, SCHEMA_VERSION, SCORE_KIND, WAV2VEC_MODEL,
                         SEMANTIC_MODEL, ASR_MODEL, ACOUSTIC_DIM, SEMANTIC_DIM)


def proxy_target(labels):
    """Labels are reviewer vote fractions, NOT counts of speech events."""
    if len(labels) != len(EVENT_LABELS) or not all(np.isfinite(v) and 0 <= v <= 1 for v in labels):
        raise ValueError('Invalid annotator vote fractions')
    votes = np.array(labels[:5]) * 3
    if not np.allclose(votes, votes.round(), atol=1e-6): raise ValueError('Labels must be three-reviewer votes')
    return float(max(0, 100 - min(votes.round().sum(), 10) * 10))


class Features(Dataset):
    def __init__(self, rows, cache):
        # Pooled features fit in RAM; do not reread thousands of Drive files every epoch.
        aa, ss, yy = [], [], []
        for row in rows:
            record = torch.load(cache / (row['id'] + '.pt'), map_location='cpu', weights_only=True)
            contract = record['contract']
            if (contract['schema_version'] != SCHEMA_VERSION or contract['acoustic_model'] != WAV2VEC_MODEL
                    or contract['semantic_model'] != SEMANTIC_MODEL or contract['asr_model'] != ASR_MODEL
                    or contract['audio_sha256'] != row['audio_sha256']): raise ValueError('Stale feature cache')
            a, s = record['acoustic'].float(), record['semantic'].float()
            if a.shape != (ACOUSTIC_DIM,) or s.shape != (SEMANTIC_DIM,): raise ValueError('Wrong pooled feature dimensions')
            if not torch.isfinite(a).all() or not torch.isfinite(s).all(): raise ValueError('Nonfinite features')
            aa.append(a); ss.append(s); yy.append(proxy_target(row['labels']))
        self.acoustic, self.semantic = torch.stack(aa), torch.stack(ss)
        self.targets = torch.tensor(yy, dtype=torch.float32)
    def __len__(self): return len(self.targets)
    def __getitem__(self, index): return self.acoustic[index], self.semantic[index], self.targets[index]


def fit_normalization(dataset):
    return {name: {'mean': values.double().mean(0).tolist(),
                   'std': values.double().std(0, correction=0).clamp_min(1e-8).tolist()}
            for name, values in [('acoustic', dataset.acoustic), ('semantic', dataset.semantic)]}


def metrics(pred, target):
    from scipy.stats import pearsonr, spearmanr
    pred, target = np.asarray(pred, dtype=float), np.asarray(target, dtype=float)
    if len(pred) == 0 or not np.isfinite(pred).all(): raise ValueError('Invalid predictions')
    mse = float(np.mean((pred - target) ** 2))
    result = {'mse': mse, 'rmse': float(np.sqrt(mse)), 'mae': float(np.mean(np.abs(pred - target))),
              'examples': len(pred), 'target_kind': SCORE_KIND, 'clinical_validation': False}
    if len(pred) > 1 and np.std(pred) > 0 and np.std(target) > 0:
        for name, fn in [('pearson', pearsonr), ('spearman', spearmanr)]:
            value, pvalue = fn(pred, target)
            result[name] = {'coefficient': float(value), 'p_value': float(pvalue)}
    else:
        result.update(pearson=None, spearman=None)
    return result


def evaluate(model, loader, device):
    preds, targets, weights = [], [], []
    model.eval()
    with torch.inference_mode():
        for a, s, y in loader:
            out = model(a.to(device), s.to(device))
            preds.append(out['score'].cpu().numpy()); targets.append(y.numpy())
            weights.append(out['attention'].cpu().numpy())
    result = metrics(np.concatenate(preds), np.concatenate(targets))
    attention = np.concatenate(weights)
    result['attention_mean'] = dict(zip(['acoustic', 'semantic'], map(float, attention.mean(0))))
    result['attention_std'] = dict(zip(['acoustic', 'semantic'], map(float, attention.std(0))))
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', type=Path, required=True); p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--out', type=Path, default=ARTIFACTS / 'fluency_v3')
    p.add_argument('--epochs', type=int, default=80); p.add_argument('--batch-size', type=int, default=32)
    p.add_argument('--resume', type=Path); p.add_argument('--seed', type=int, default=42)
    p.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu')
    args = p.parse_args()
    if args.epochs < 1 or args.batch_size < 1: p.error('epochs and batch size must be positive')
    started = time.monotonic()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.set_num_threads(4)
    rows = [json.loads(l) for l in args.manifest.read_text().splitlines() if l.strip()]
    splits = {name: [r for r in rows if r['split'] == name] for name in ['train', 'validation', 'test']}
    if any(not r for r in splits.values()): raise ValueError('All three splits must be present')
    groups = {name: {r['group'] for r in rs} for name, rs in splits.items()}
    if any(groups[a] & groups[b] for a, b in [('train', 'validation'), ('train', 'test'), ('validation', 'test')]):
        raise ValueError('Group leakage across splits')
    if len({r['id'] for r in rows}) != len(rows) or len({r['audio_sha256'] for r in rows}) != len(rows):
        raise ValueError('Duplicate recordings')
    digest = hashlib.sha256(args.manifest.read_bytes()).hexdigest()
    saved = torch.load(args.resume, map_location=args.device, weights_only=True) if args.resume else None
    if saved and (saved['metadata']['manifest_sha256'] != digest or saved['metadata']['schema_version'] != SCHEMA_VERSION):
        raise ValueError('Cannot resume a different model or data split')
    data = {n: Features(rs, args.cache) for n, rs in splits.items()}
    args.out.mkdir(parents=True, exist_ok=True)
    stats = fit_normalization(data['train'])
    norm_path = args.out / 'norm_stats.json'
    norm_bytes = json.dumps(stats, indent=2).encode()
    norm_hash = hashlib.sha256(norm_bytes).hexdigest()
    if saved and saved['metadata']['norm_sha256'] != norm_hash: raise ValueError('Normalization changed')
    norm_path.write_bytes(norm_bytes)
    for dataset in data.values():
        dataset.acoustic, dataset.semantic = normalize_features(dataset.acoustic, dataset.semantic, stats)
    loaders = {n: DataLoader(ds, batch_size=args.batch_size, shuffle=False) for n, ds in data.items()}
    model = MultimodalAttentionFusion().to(args.device)
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=.5, patience=5)
    loss_fn = nn.MSELoss()
    meta = {'schema_version': SCHEMA_VERSION, 'run_id': str(uuid.uuid4()), 'score_kind': SCORE_KIND,
            'acoustic_model': WAV2VEC_MODEL, 'semantic_model': SEMANTIC_MODEL, 'asr_model': ASR_MODEL,
            'training_examples': len(data['train']), 'manifest_sha256': digest, 'norm_sha256': norm_hash,
            'seed': args.seed, 'clinical_validation': False, 'trainable_parameters': sum(p.numel() for p in model.parameters()),
            'split_counts': {n: len(rs) for n, rs in splits.items()}, 'split_groups': {n: sorted(gs) for n, gs in groups.items()},
            'datasets': {n: sum(r['dataset'] == n for r in rows) for n in sorted({r['dataset'] for r in rows})},
            'training_target': 'max(0,100-10*min(sum(first_five_reviewer_vote_counts),10))',
            'target_statistics': {'mean': float(data['train'].targets.mean()), 'std': float(data['train'].targets.std(correction=0))}}
    history, best, bad, start_epoch = [], float('inf'), 0, 0
    if saved:
        model.load_state_dict(saved['state_dict']); optimizer.load_state_dict(saved['optimizer'])
        scheduler.load_state_dict(saved['scheduler']); torch.set_rng_state(saved['rng'].cpu())
        if args.device == 'cuda' and saved.get('cuda_rng') is not None: torch.cuda.set_rng_state_all(saved['cuda_rng'])
        start_epoch = saved['metadata']['epochs_completed']; meta['run_id'] = saved['metadata']['run_id']
        history, best, bad = saved['history'], saved['best_rmse'], saved['bad_epochs']
    for epoch in range(start_epoch, args.epochs):
        if bad >= 12: break
        epoch_start = time.monotonic()
        model.train(); total = 0
        train_loader = DataLoader(data['train'], batch_size=args.batch_size, shuffle=True,
                                  generator=torch.Generator().manual_seed(args.seed + epoch))
        for a, s, y in train_loader:
            loss = loss_fn(model(a.to(args.device), s.to(args.device))['score'], y.to(args.device))
            if not torch.isfinite(loss): raise ValueError('Nonfinite training loss')
            optimizer.zero_grad(); loss.backward(); optimizer.step(); total += loss.item() * len(y)
        val = evaluate(model, loaders['validation'], args.device)
        scheduler.step(val['rmse'])
        history.append({'epoch': epoch + 1, 'loss': total / len(data['train']), 'validation': val,
                        'seconds': time.monotonic() - epoch_start, 'learning_rate': optimizer.param_groups[0]['lr']})
        checkpoint = {'state_dict': {k: v.cpu() for k, v in model.state_dict().items()},
                      'metadata': {**meta, 'epochs_completed': epoch + 1, 'validation_metrics': val}}
        if val['rmse'] < best:
            best, bad = val['rmse'], 0
            torch.save(checkpoint, args.out / 'best.partial'); (args.out / 'best.partial').replace(args.out / 'best.pt')
        else: bad += 1
        torch.save({**checkpoint, 'optimizer': optimizer.state_dict(), 'scheduler': scheduler.state_dict(),
                    'rng': torch.get_rng_state(), 'cuda_rng': torch.cuda.get_rng_state_all() if args.device == 'cuda' else None,
                    'history': history, 'best_rmse': best, 'bad_epochs': bad}, args.out / 'last.partial')
        (args.out / 'last.partial').replace(args.out / 'last.pt')
        (args.out / 'history.json').write_text(json.dumps(history, indent=2))
        print(json.dumps(history[-1]), flush=True)
    selected = torch.load(args.out / 'best.pt', map_location=args.device, weights_only=True)
    model.load_state_dict(selected['state_dict'])
    test = evaluate(model, loaders['test'], args.device)
    baseline = metrics(np.full(len(data['test']), float(data['train'].targets.mean())), data['test'].targets.numpy())
    evaluation = {'metadata': selected['metadata'], 'test': test, 'constant_training_mean_baseline': baseline,
                  'epochs_completed': len(history), 'early_stopped': bad >= 12, 'elapsed_seconds': time.monotonic() - started,
                  'checkpoint_sha256': hashlib.sha256((args.out / 'best.pt').read_bytes()).hexdigest()}
    (args.out / 'evaluation.json').write_text(json.dumps(evaluation, indent=2))
    print('Held-out test:', json.dumps(test), flush=True)


if __name__ == '__main__': main()
