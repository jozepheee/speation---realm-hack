"""Frozen, mean-pooled Wav2Vec2-base features and descriptive prosody."""
from functools import lru_cache
import numpy as np
import torch
from fluency.audio import decode_audio
from ml_settings import WAV2VEC_MODEL, SAMPLE_RATE, DEVICE, ModelUnavailableError
@lru_cache(maxsize=1)
def get_acoustic_encoder():
    try:
        from transformers import AutoFeatureExtractor, Wav2Vec2Model
        processor = AutoFeatureExtractor.from_pretrained(WAV2VEC_MODEL)
        model = Wav2Vec2Model.from_pretrained(WAV2VEC_MODEL, use_safetensors=False).to(DEVICE).eval()
        model.requires_grad_(False)
        return processor, model
    except Exception as exc:
        raise ModelUnavailableError("The proposal's Wav2Vec2 encoder is unavailable.") from exc

def acoustic_embeddings(waveform: np.ndarray) -> torch.Tensor:
    processor, model = get_acoustic_encoder()
    inputs = processor(waveform, sampling_rate=SAMPLE_RATE, return_tensors="pt")
    with torch.inference_mode():
        return model(**{k: v.to(DEVICE) for k, v in inputs.items()}).last_hidden_state[0].mean(0).cpu()

def extract_acoustic_features(audio_bytes: bytes | np.ndarray) -> dict:
    import librosa
    y = decode_audio(audio_bytes) if isinstance(audio_bytes, bytes) else audio_bytes
    rms = librosa.feature.rms(y=y, frame_length=480, hop_length=160)[0]
    voiced = rms > max(1e-5, float(rms.max()) * 0.15)
    f0, voiced_flag, _ = librosa.pyin(y, sr=SAMPLE_RATE, fmin=60, fmax=400,
                                      frame_length=1024, hop_length=160)
    pitch = f0[voiced_flag & np.isfinite(f0)]
    return {"pitch_mean_hz": round(float(pitch.mean()), 1) if len(pitch) else None,
            "pitch_std_hz": round(float(pitch.std()), 1) if len(pitch) else None,
            "pause_ratio": round(float(1 - voiced.mean()), 3),
            "rms_energy_mean": round(float(rms.mean()), 5),
            "duration_seconds": round(len(y) / SAMPLE_RATE, 3),
            "measurement_note": "Energy-based pause estimate; not a clinical diagnosis."}
