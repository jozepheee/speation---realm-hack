from threading import Lock
import numpy as np
from fluency.audio import decode_audio
from fluency.acoustic import extract_acoustic_features, acoustic_embeddings
from fluency.asr import transcribe_recording
from fluency.semantic import calculate_semantic_similarity, semantic_embeddings
from fluency.fusion import fuse_multimodal_features, get_fusion_model
from ml_settings import SAMPLE_RATE, InvalidAudioError
_pipeline_lock=Lock()

def run_fluency_pipeline(audio_bytes: bytes, target_text: str = "") -> dict:
    # Serialize the large frozen encoders to bound CPU/GPU memory per worker.
    with _pipeline_lock:
        return _score(audio_bytes,target_text)

def _score(audio_bytes,target_text):
    waveform=decode_audio(audio_bytes)
    get_fusion_model()
    transcript,words=transcribe_recording(waveform)
    outputs,weights=[],[]
    # Training clips are three seconds: serve on the same window scale, using word timestamps.
    for start in range(0,len(waveform),3*SAMPLE_RATE):
        end=min(start+3*SAMPLE_RATE,len(waveform))
        clip=waveform[start:end]
        text=' '.join(w['text'].strip() for w in words
                      if start/SAMPLE_RATE <= (w['start']+w['end'])/2 < end/SAMPLE_RATE)
        if not text or len(clip)<SAMPLE_RATE/4 or np.sqrt(np.mean(clip**2))<1e-5:
            continue
        outputs.append(fuse_multimodal_features(acoustic_embeddings(clip),semantic_embeddings(text)))
        weights.append(len(clip)/SAMPLE_RATE)
    if not outputs:
        raise InvalidAudioError('No speech windows could be aligned and scored. Please record again.')
    features=extract_acoustic_features(waveform)
    aw=float(np.average([o['acoustic_weight'] for o in outputs],weights=weights))
    sw=1-aw
    features.update(events=None,event_note=outputs[0]['event_note'],
                    acoustic_weight=aw,semantic_weight=sw,
                    model_version=outputs[0]['model_version'],score_kind=outputs[0]['score_kind'],
                    source='multimodal_v3',scored_seconds=round(sum(weights),3),
                    scored_windows=len(outputs),aggregation='duration_weighted_3_second_windows')
    wpm=len(transcript.split())/features['duration_seconds']*60
    return {'composite':round(float(np.average([o['composite'] for o in outputs],weights=weights)),1),
            'acoustic':None,'acoustic_weight':aw,'semantic_weight':sw,
            'semantic':calculate_semantic_similarity(transcript,target_text),
            'transcript':transcript,'rate':f'{wpm:.0f} words/min','features':features,
            'recommendation':'This is a learned annotator-vote proxy score, not a clinical rating. '
                             'Attention weights describe model contributions, not accuracy or event counts. '
                             'Reference similarity measures meaning, not pronunciation.'}
