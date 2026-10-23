"""Opt-in real decoder hypotheses; original ASR transcript always stays intact."""
from fluency.asr import get_asr_model,_lock
from config import settings
from .nbest import build_hybrid_list
from .selector import rank

def suggest(waveform,transcript,model_name):
    if not settings.REVOICE_SELECTOR_ENABLED or len(waveform)>20*16000:return None
    if not _lock.acquire(blocking=False):return None
    try:
        model=get_asr_model(model_name,True,settings.CARE_ASR_CACHE_DIR or None)
        if model.is_multilingual:return None
        candidates=build_hybrid_list(model,waveform,transcript)
        if not candidates:return None
        result=rank(candidates)
        identity='local-english-adult-pilot-v1' if model_name==settings.ENGLISH_ADAPTED_MODEL_DIR else model_name
        result['calibration_matches']=identity==result['calibrated_base']
        if not result['calibration_matches']:
            # Preserve decoder alternatives, but don't use out-of-domain ranker
            # preferences to change the order shown to the learner.
            result.update(decision='KEEP_A0',suggested_text=None,alternatives=[item.display for item in candidates if not item.is_a0])
        return result
    except (OSError,ValueError,KeyError,RuntimeError,IndexError,StopIteration):return None
    finally:_lock.release()
