"""Expose aggregate local pilot status, never weights, paths or speaker recordings."""
import json,math
from pathlib import Path
from config import settings

def status():
    directory=Path(settings.ENGLISH_ADAPTED_MODEL_DIR) if settings.ENGLISH_ADAPTED_MODEL_DIR else None
    evaluation=Path(settings.ENGLISH_ADAPTED_EVALUATION) if settings.ENGLISH_ADAPTED_EVALUATION else None
    if not directory or not (directory/'model.bin').is_file() or not evaluation or not evaluation.is_file():return {'available':False,'state':'not_configured','production_ready':False}
    try:
        result=json.loads(evaluation.read_text(encoding='utf-8'))
        baseline=float(result['baseline_test']['wer']);adapted=float(result['adapted_test']['wer'])
        # Report the exported decoder's result separately from HF training evaluation.
        serving_path=evaluation.with_name('cpu-evaluation.json')
        serving=json.loads(serving_path.read_text(encoding='utf-8')) if serving_path.is_file() else None
        serving_wer=float(serving['wer']) if serving else None
        if serving_wer is not None and (not math.isfinite(serving_wer) or serving_wer<0):raise ValueError('Invalid serving WER')
        if not all(math.isfinite(value) and value>=0 for value in [baseline,adapted]):raise ValueError('Invalid WER')
        return {'available':True,'state':'trained_research_pilot','base':result['base'],'baseline_wer':baseline,'adapted_wer':adapted,'serving_wer':serving_wer,'test_utterances':int(result['adapted_test']['utterances']),'speakers':int(result['dataset'].get('speakers',1)),'population':'single adult male, held-out utterances','production_ready':False,'default_provider':False,'recognition_not_pronunciation':True,'third_party_audio_export':False}
    except (OSError,ValueError,KeyError,TypeError):return {'available':False,'state':'invalid_evaluation','production_ready':False}
