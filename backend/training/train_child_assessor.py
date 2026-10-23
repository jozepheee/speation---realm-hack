"""Train a real segment-error classifier from speaker-disjoint reviewed manifests.

This writes measured held-out results and an unreleased checkpoint. It does not
make models clinically validated or invent phoneme timestamps at serving time.
Inference still needs a separately evaluated segment/localization component.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import Wav2Vec2Model
from fluency.audio import decode_audio
from ml_settings import SAMPLE_RATE, WAV2VEC_MODEL


class SegmentAssessor(nn.Module):
    def __init__(self, targets):
        super().__init__()
        self.targets = nn.Embedding(targets, 32)
        self.head = nn.Sequential(nn.Linear(800, 128), nn.ReLU(), nn.Dropout(.2), nn.Linear(128, 1))

    def forward(self, features, target):
        return self.head(torch.cat([features, self.targets(target)], dim=-1)).squeeze(-1)


def train(manifest_dir, output, epochs=20, device="cpu"):
    torch.manual_seed(20261014)
    directory = Path(manifest_dir)
    splits = {name: [json.loads(line) for line in (directory / f"{name}.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
              for name in ["train", "validation", "test"]}
    speaker_sets = {name: {row["speaker_key"] for row in rows} for name, rows in splits.items()}
    if any(speaker_sets[a] & speaker_sets[b] for a, b in [("train", "validation"), ("train", "test"), ("validation", "test")]):
        raise ValueError("Speaker leakage detected")
    if len(splits["train"]) < 100 or any(len({row["error"] for row in rows}) < 2 for rows in splits.values()):
        raise ValueError("Require at least 100 training segments and both labels in every split")
    vocabulary = sorted({f"{row['language']}:{row['expected_phone']}" for row in splits["train"]})
    target_map = {name: index for index, name in enumerate(vocabulary)}
    encoder = Wav2Vec2Model.from_pretrained(WAV2VEC_MODEL).to(device).eval()
    tensors = {}
    for name, rows in splits.items():
        features, targets, labels, retained = [], [], [], []
        for row in rows:
            target = f"{row['language']}:{row['expected_phone']}"
            if target not in target_map:
                continue
            waveform = decode_audio(Path(row["audio_path"]).read_bytes())
            segment = waveform[int(row["start_seconds"] * SAMPLE_RATE):int(row["end_seconds"] * SAMPLE_RATE)]
            if len(segment) < 800:
                raise ValueError("Reviewed segment is too short or outside the audio")
            normalized = (segment - segment.mean()) / max(float(segment.std()), 1e-6)
            with torch.no_grad():
                vector = encoder(torch.tensor(normalized, device=device).unsqueeze(0)).last_hidden_state.mean(1).squeeze(0).cpu()
            features.append(vector); targets.append(target_map[target]); labels.append(float(row["error"])); retained.append(row)
        if not retained:
            raise ValueError("No covered targets in an evaluation split")
        tensors[name] = (torch.stack(features), torch.tensor(targets), torch.tensor(labels), retained)
    mean = tensors["train"][0].mean(0)
    std = tensors["train"][0].std(0, unbiased=False).clamp_min(1e-6)
    model = SegmentAssessor(len(vocabulary)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)
    best, best_state = float("inf"), None
    for epoch in range(epochs):
        model.train()
        x, target, labels, _ = tensors["train"]
        for indices in torch.randperm(len(x)).split(32):
            logits = model(((x[indices] - mean) / std).to(device), target[indices].to(device))
            loss = nn.functional.binary_cross_entropy_with_logits(logits, labels[indices].to(device))
            optimizer.zero_grad(); loss.backward(); optimizer.step()
        model.eval()
        with torch.no_grad():
            x, target, labels, _ = tensors["validation"]
            validation_loss = nn.functional.binary_cross_entropy_with_logits(model(((x - mean) / std).to(device), target.to(device)), labels.to(device)).item()
        print(json.dumps({"epoch": epoch + 1, "validation_bce": validation_loss}), flush=True)
        if validation_loss < best:
            best, best_state = validation_loss, {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
    model.load_state_dict(best_state)
    model.eval()
    def measure(indices, probabilities, labels):
        selected = np.asarray(indices, dtype=int); predicted = probabilities[selected] >= .5; truth = labels[selected] >= .5
        tp, fp, fn = int(np.sum(predicted & truth)), int(np.sum(predicted & ~truth)), int(np.sum(~predicted & truth))
        return {"n": len(selected), "true_positive": tp, "false_positive": fp, "false_negative": fn,
                "precision": tp / (tp + fp) if tp + fp else None, "recall": tp / (tp + fn) if tp + fn else None}
    x, target, labels, rows = tensors["test"]
    with torch.no_grad():
        probabilities = torch.sigmoid(model(((x - mean) / std).to(device), target.to(device))).cpu().numpy()
    labels_np = labels.numpy()
    report = {"release_approved": False, "clinical_validation": "not_performed", "threshold": .5,
              "threshold_status": "uncalibrated_research_baseline", "encoder": WAV2VEC_MODEL,
              "overall": measure(range(len(rows)), probabilities, labels_np),
              "by_language": {language: measure([i for i, row in enumerate(rows) if row["language"] == language], probabilities, labels_np)
                              for language in ["en", "hi", "ml"]},
              "uncovered_test_segments": len(splits["test"]) - len(rows)}
    destination = Path(output); destination.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": best_state, "targets": vocabulary, "mean": mean, "std": std,
                "encoder": WAV2VEC_MODEL, "schema_version": 1}, destination / "segment_assessor.pt")
    (destination / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    if args.epochs < 1:
        raise ValueError("At least one epoch is required")
    train(args.manifest_dir, args.output, args.epochs, args.device)
