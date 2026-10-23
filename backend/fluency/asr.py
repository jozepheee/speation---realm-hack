"""Specified Whisper medium ASR; never substitutes the expected answer."""
from functools import lru_cache
from threading import Lock
import numpy as np
from ml_settings import ASR_MODEL, DEVICE, InvalidAudioError, ModelUnavailableError
from fluency.audio import decode_audio
_lock = Lock()
@lru_cache(maxsize=2)
def get_asr_model(model_name=ASR_MODEL, local_only=False, download_root=None):
    try:
        from faster_whisper import WhisperModel
        return WhisperModel(model_name, device=DEVICE, cpu_threads=4, num_workers=1, local_files_only=local_only, download_root=download_root,
                            compute_type="float16" if DEVICE == "cuda" else "int8")
    except Exception as exc:
        raise ModelUnavailableError("Whisper medium is unavailable. Download it before serving audio.") from exc

def transcribe_recording(waveform: np.ndarray, language: str | None = None, model_name=None, local_only=False, download_root=None) -> tuple[str, list[dict]]:
    with _lock:
        model = get_asr_model(model_name, local_only, download_root) if model_name else get_asr_model()
        segments, _ = model.transcribe(waveform, language=language, beam_size=5, word_timestamps=True,
                                       vad_filter=False, condition_on_previous_text=False)
        texts, words = [], []
        for segment in segments:
            texts.append(segment.text.strip())
            words.extend({"text": w.word, "start": w.start, "end": w.end,
                          "model_probability": getattr(w, "probability", None)}
                         for w in (segment.words or []))
        transcript = " ".join(texts).strip()
    if not transcript:
        raise InvalidAudioError("No speech could be transcribed. Please record again.")
    return transcript, words

def transcribe_audio(audio_bytes: bytes | np.ndarray, target_hint: str = "") -> str:
    # No target hint is used: expected answers cannot replace observations.
    waveform = decode_audio(audio_bytes) if isinstance(audio_bytes, bytes) else audio_bytes
    return transcribe_recording(waveform)[0]
