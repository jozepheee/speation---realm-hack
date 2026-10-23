"""Input-dependent scalar modality attention and 0–100 proxy regression."""
from functools import lru_cache
import hashlib
import json
import torch
from torch import nn
from ml_settings import (ACOUSTIC_DIM, SEMANTIC_DIM, FUSION_CHECKPOINT, SCORE_KIND,
                         SCHEMA_VERSION, WAV2VEC_MODEL, SEMANTIC_MODEL, ASR_MODEL, ModelUnavailableError)


class MultimodalAttentionFusion(nn.Module):
    def __init__(self, acoustic_dim=ACOUSTIC_DIM, semantic_dim=SEMANTIC_DIM, d_model=256):
        super().__init__()
        self.proj_acoustic = nn.Linear(acoustic_dim, d_model)
        self.proj_semantic = nn.Linear(semantic_dim, d_model)
        self.attention_acoustic = nn.Linear(d_model, 1)
        self.attention_semantic = nn.Linear(d_model, 1)
        self.head = nn.Sequential(nn.Linear(d_model, 128), nn.ReLU(), nn.Dropout(.35),
                                  nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, acoustic, semantic):
        a, s = self.proj_acoustic(acoustic), self.proj_semantic(semantic)
        weights = torch.softmax(torch.cat([self.attention_acoustic(a), self.attention_semantic(s)], -1), -1)
        z = weights[:, :1] * a + weights[:, 1:] * s
        return {"score": self.head(z).squeeze(-1) * 100, "attention": weights}


def normalize_features(acoustic, semantic, stats):
    def normalize(x, name):
        mean = torch.tensor(stats[name]['mean'], dtype=x.dtype, device=x.device)
        std = torch.tensor(stats[name]['std'], dtype=x.dtype, device=x.device).clamp_min(1e-8)
        return (x - mean) / std
    return normalize(acoustic, 'acoustic'), normalize(semantic, 'semantic')


@lru_cache(maxsize=1)
def get_fusion_model():
    try:
        checkpoint = torch.load(FUSION_CHECKPOINT, map_location='cpu', weights_only=True)
        meta = checkpoint['metadata']
        evaluation = json.loads(FUSION_CHECKPOINT.with_name('evaluation.json').read_text())
        norm_path = FUSION_CHECKPOINT.with_name('norm_stats.json')
        stats = json.loads(norm_path.read_text())
        if (evaluation.get('checkpoint_sha256') != hashlib.sha256(FUSION_CHECKPOINT.read_bytes()).hexdigest()
                or meta.get('norm_sha256') != hashlib.sha256(norm_path.read_bytes()).hexdigest()):
            raise ValueError('Evaluation or normalization does not match checkpoint')
        if (meta['schema_version'] != SCHEMA_VERSION or meta['acoustic_model'] != WAV2VEC_MODEL
                or meta['semantic_model'] != SEMANTIC_MODEL or meta['asr_model'] != ASR_MODEL
                or meta['score_kind'] != SCORE_KIND or meta.get('training_examples', 0) < 1
                or not meta.get('validation_metrics')):
            raise ValueError('Incompatible trained model contract')
        for name, size in [('acoustic', ACOUSTIC_DIM), ('semantic', SEMANTIC_DIM)]:
            if (len(stats[name]['mean']) != size or len(stats[name]['std']) != size
                    or not torch.isfinite(torch.tensor(stats[name]['mean'])).all()
                    or not torch.isfinite(torch.tensor(stats[name]['std'])).all()
                    or any(v < 0 for v in stats[name]['std'])):
                raise ValueError('Invalid normalization statistics')
        model = MultimodalAttentionFusion()
        model.load_state_dict(checkpoint['state_dict'], strict=True)
        if not all(torch.isfinite(p).all() for p in model.parameters()):
            raise ValueError('Nonfinite weights')
        return model.eval(), meta, stats
    except Exception as exc:
        raise ModelUnavailableError('Fluency model unavailable. Train and evaluate the specification-v3 model first.') from exc


def fuse_multimodal_features(acoustic, semantic):
    model, meta, stats = get_fusion_model()
    with torch.inference_mode():
        a, s = normalize_features(acoustic.float().unsqueeze(0), semantic.float().unsqueeze(0), stats)
        output = model(a, s)
    if not torch.isfinite(output['score']).all() or not torch.isfinite(output['attention']).all():
        raise ModelUnavailableError('Invalid fluency model output')
    return {'composite': float(output['score'][0]), 'acoustic': None,
            'acoustic_weight': float(output['attention'][0, 0]),
            'semantic_weight': float(output['attention'][0, 1]),
            'events': None, 'event_note': 'The specified regression head does not predict event labels.',
            'model_version': meta['run_id'], 'score_kind': SCORE_KIND}
