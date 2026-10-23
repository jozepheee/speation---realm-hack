"""Measured signal properties and model VAD; neither is a pronunciation grade."""
import numpy as np
from ml_settings import SAMPLE_RATE


def analyze_signal(waveform):
    rms = float(np.sqrt(np.mean(waveform ** 2)))
    clipped = float(np.mean(np.abs(waveform) >= .99))
    report = {'rms': round(rms, 6), 'clipped_sample_fraction': round(clipped, 6),
        'sample_rate': SAMPLE_RATE, 'source': 'measured_audio',
        'flags': [name for name, present in [('low_signal', rms < .002), ('clipping', clipped > .01)] if present],
        'limitations': 'Signal quality and voice activity do not establish pronunciation correctness or diagnose a disorder.'}
    try:
        from faster_whisper.vad import get_speech_timestamps, VadOptions
        intervals = get_speech_timestamps(waveform, VadOptions(min_speech_duration_ms=100,
            min_silence_duration_ms=1500, speech_pad_ms=200), sampling_rate=SAMPLE_RATE)
        report['voice_activity'] = {'source': 'silero_vad/faster_whisper',
            'segments': [{'start_seconds': round(item['start'] / SAMPLE_RATE, 3),
                          'end_seconds': round(item['end'] / SAMPLE_RATE, 3)} for item in intervals],
            'interpretation': 'Model speech-activity hypotheses; pauses are allowed and sound-level practice may be missed.'}
    except Exception:
        report['voice_activity'] = {'source': 'unavailable', 'segments': [], 'error': 'vad_unavailable'}
    return report
