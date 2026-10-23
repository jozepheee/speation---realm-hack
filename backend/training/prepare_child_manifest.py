"""Validate clinician-labelled phoneme segments and split by speaker, never clip.

Input JSONL fields: audio_path, speaker_id, age, language, expected_phone,
start_seconds, end_seconds, error (bool), label_source='clinician', reviewer_id,
dataset, license, use_permission. No speaker diagnosis or forced alignment is
accepted as a correctness label. Run on locally acquired audio and annotations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random


def prepare(source, audio_root, output):
    root = Path(audio_root).resolve()
    rows, speakers, hashes = [], set(), {}
    for line_number, line in enumerate(Path(source).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        required = ["audio_path", "speaker_id", "age", "language", "expected_phone", "start_seconds", "end_seconds", "error", "label_source", "reviewer_id", "dataset", "license", "use_permission"]
        if any(key not in row for key in required):
            raise ValueError(f"Row {line_number}: missing provenance or labels")
        if row["label_source"] != "clinician" or not row["reviewer_id"] or type(row["error"]) is not bool:
            raise ValueError(f"Row {line_number}: requires explicit clinician correctness labels")
        if not 4 <= row["age"] <= 21 or row["language"] not in ["en", "hi", "ml"]:
            raise ValueError(f"Row {line_number}: out-of-scope age/language")
        if not 0 <= row["start_seconds"] < row["end_seconds"] or row["end_seconds"] - row["start_seconds"] < .05:
            raise ValueError(f"Row {line_number}: invalid segment")
        if row["use_permission"] not in ["research", "production"]:
            raise ValueError(f"Row {line_number}: document data-use permission")
        audio = (root / row["audio_path"]).resolve()
        if not audio.is_relative_to(root) or not audio.is_file():
            raise ValueError(f"Row {line_number}: audio outside the approved root or missing")
        digest = hashlib.sha256(audio.read_bytes()).hexdigest()
        identity = f"{row['dataset']}:{row['speaker_id']}"
        if digest in hashes and hashes[digest] != identity:
            raise ValueError("Identical audio assigned to different speakers; fix leakage before splitting")
        hashes[digest] = identity
        row["audio_path"] = str(audio)
        row["audio_sha256"] = digest
        row["speaker_key"] = identity
        rows.append(row)
        speakers.add(identity)
    if len(speakers) < 10:
        raise ValueError("At least ten distinct speakers are required for this initial training pipeline")
    identities = sorted(speakers)
    random.Random(20261014).shuffle(identities)
    n = len(identities)
    train_end, validation_end = int(n * .7), int(n * .85)
    groups = {identity: "train" if i < train_end else "validation" if i < validation_end else "test"
              for i, identity in enumerate(identities)}
    destination = Path(output)
    destination.mkdir(parents=True, exist_ok=True)
    for split in ["train", "validation", "test"]:
        selected = [row for row in rows if groups[row["speaker_key"]] == split]
        (destination / f"{split}.jsonl").write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in selected) + "\n", encoding="utf-8")
    report = {"rows": len(rows), "speakers": n, "split": "speaker_disjoint_70_15_15",
              "production_eligible_data": all(row["use_permission"] == "production" for row in rows),
              "language_counts": {language: sum(row["language"] == language for row in rows) for language in ["en", "hi", "ml"]},
              "clinical_validation": "not_performed"}
    (destination / "manifest_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotations", required=True)
    parser.add_argument("--audio-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    prepare(args.annotations, args.audio_root, args.output)
