import io
import numpy as np
from ml_settings import MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, SAMPLE_RATE, InvalidAudioError

def decode_audio(data: bytes, max_seconds=MAX_AUDIO_SECONDS) -> np.ndarray:
    """Decode browser audio with byte and decoded-duration limits."""
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise InvalidAudioError("Audio must be nonempty and no larger than 20 MiB.")
    try:
        import av
        chunks, size = [], 0
        with av.open(io.BytesIO(data)) as container:
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for converted in resampler.resample(frame):
                    chunk = converted.to_ndarray().reshape(-1)
                    size += chunk.size
                    if size > SAMPLE_RATE * max_seconds:
                        raise InvalidAudioError(f"Recordings must be at most {max_seconds} seconds.")
                    chunks.append(chunk)
            for converted in resampler.resample(None):
                chunks.append(converted.to_ndarray().reshape(-1))
        waveform = np.concatenate(chunks).astype(np.float32)
    except InvalidAudioError:
        raise
    except Exception as exc:
        raise InvalidAudioError("Audio could not be decoded. Record a new clip.") from exc
    if waveform.size < SAMPLE_RATE // 4 or waveform.size > SAMPLE_RATE * max_seconds:
        raise InvalidAudioError(f"Audio duration must be between 0.25 and {max_seconds} seconds.")
    if not np.isfinite(waveform).all() or np.sqrt(np.mean(waveform ** 2)) < 1e-5:
        raise InvalidAudioError("Recording is silent or invalid.")
    return waveform
