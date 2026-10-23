"""Rehearsal observations: measured audio timing and fallible transcript counts.

No age norms, fluency grades, inferred confidence or transcript phoneme scores.
"""
import math
import unicodedata
from collections import Counter


FILLERS = {
    'en': {'uh', 'um', 'uhh', 'umm', 'erm', 'er', 'hmm', 'hm', 'ah'},
    'hi': {'अं', 'उम', 'अह', 'हम्म', 'हम्म्'},
    'ml': {'ഉം', 'അം', 'ഹ്മ്', 'മ്മ്'},
}


def tokens(text):
    # Keep Indic combining marks and joiners; count occurrences, not unique words.
    value = ''.join(c if unicodedata.category(c)[0] in 'LMN' or c in "'’\u200c\u200d" else ' '
                    for c in unicodedata.normalize('NFC', text or '').casefold())
    return [s.strip("'’\u200c\u200d") for s in value.split() if s.strip("'’\u200c\u200d")]


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def recording_metrics(record, language):
    text = record.transcript or ''
    words = tokens(text)
    duration = record.duration_seconds if number(record.duration_seconds) and record.duration_seconds > 0 else None
    lexicon = FILLERS['en'] | FILLERS.get(language, set())
    fillers = Counter(word for word in words if word in lexicon)
    repetitions = Counter(b for a, b in zip(words, words[1:]) if a == b and b not in lexicon)
    quality = record.quality or {}
    filler_intervals=[]
    for word in getattr(record,'words',None) or []:
        start,end=word.get('start'),word.get('end')
        written=tokens(word.get('text',''))
        if word.get('unit')=='word' and len(written)==1 and written[0] in lexicon and duration and number(start) and number(end) and 0<=start<end<=duration:
            filler_intervals.append({'text':written[0],'start_seconds':start,'end_seconds':end})
    vad = quality.get('voice_activity') or {}
    intervals = []
    if duration and vad.get('source') not in (None, 'unavailable'):
        for segment in vad.get('segments', []):
            start, end = segment.get('start_seconds'), segment.get('end_seconds')
            if not number(start) or not number(end) or not 0 <= start < end <= duration + .01:
                intervals = []; break
            intervals.append((start, min(end, duration)))
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]: merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else: merged.append((start, end))
    speech = sum(end-start for start, end in merged) if merged else None
    pauses = [{'start_seconds': round(a[1], 3), 'end_seconds': round(b[0], 3),
               'duration_seconds': round(b[0]-a[1], 3)} for a, b in zip(merged, merged[1:]) if b[0]-a[1] >= 1.5]
    return {
        'version': 1, 'word_count': len(words), 'recorded_seconds': duration,
        'words_per_minute': round(len(words)*60/duration, 1) if duration and words else None,
        'speech_seconds': round(speech, 3) if speech else None,
        'speech_only_words_per_minute': round(len(words)*60/speech, 1) if speech and words else None,
        'pause_count': len(pauses) if merged else None, 'pauses': pauses,
        'pause_seconds': round(sum(p['duration_seconds'] for p in pauses), 3) if merged else None,
        'longest_pause_seconds': max((p['duration_seconds'] for p in pauses), default=0) if merged else None,
        'fillers': [{'text': word, 'count': count} for word, count in fillers.items()],
        'filler_count': sum(fillers.values()),
        'filler_intervals':filler_intervals,'recognition_provider':quality.get('recognition_provider','unknown'),
        'filler_coverage':'transcript_tokens_only','repetition_scope':'adjacent repeated written words, not sound-level stuttering events',
        'repeated_starts': [{'text': word, 'count': count} for word, count in repetitions.items()],
        'repeated_start_count': sum(repetitions.values()),
        'quality_flags': quality.get('flags', []),
        'sources': {'words': 'recognition_transcript', 'timing': 'measured_audio', 'pauses': vad.get('source', 'unavailable')},
    }


def summarize(content, scenario):
    turns = [t for t in content.get('turns', []) if not t.get('retry_of')]
    measured = [t['metrics'] for t in turns if t.get('metrics')]
    duration = sum(m['recorded_seconds'] or 0 for m in measured)
    complete_duration = bool(measured) and all(m['recorded_seconds'] is not None for m in measured)
    count = sum(m['word_count'] for m in measured)
    voiced = [m for m in measured if m['speech_seconds'] is not None]
    speech = sum(m['speech_seconds'] for m in voiced)
    complete_vad = bool(measured) and len(voiced) == len(measured)
    filler_counts = Counter()
    repeated = Counter()
    for m in measured:
        filler_counts.update({x['text']: x['count'] for x in m['fillers']})
        repeated.update({x['text']: x['count'] for x in m['repeated_starts']})
    per_step = []
    for position, step in enumerate(content.get('steps', [])):
        answers = [t for t in turns if t['position'] == position]
        per_step.append({'position': position, 'kind': step['kind'], 'section': step.get('section'),
                         'prompt': step['prompt'], 'follow_up': bool(step.get('follow_up')),
                         'answers': len(answers), 'recorded_seconds': round(sum((t.get('metrics') or {}).get('recorded_seconds') or 0 for t in answers), 2)})
    aspects = []
    for t in turns:
        for aspect in (t.get('feedback') or {}).get('aspects', []):
            # Evidence must be a real quote, not a fabricated observation.
            if aspect.get('evidence') and aspect['evidence'].casefold() in t['heard'].casefold():
                aspects.append({**aspect, 'position': t['position'], 'recording_id': t['recording_id']})
    return {
        'version': 1, 'measured_answers': len(measured), 'total_answers': len(turns),
        'recorded_seconds': round(duration, 2), 'word_count': count,
        'words_per_minute': round(count*60/duration, 1) if complete_duration and duration and count else None,
        'speech_only_words_per_minute': round(count*60/speech, 1) if complete_vad and speech and count else None,
        'pause_count': sum(m['pause_count'] for m in voiced) if complete_vad else None,
        'pause_seconds': round(sum(m['pause_seconds'] for m in voiced), 2) if complete_vad else None,
        'longest_pause_seconds': max((m['longest_pause_seconds'] for m in voiced), default=0) if complete_vad else None,
        'pause_coverage_answers': len(voiced),
        'filler_count': sum(filler_counts.values()), 'fillers': [{'text': w, 'count': n} for w, n in filler_counts.items()],
        'fillers_per_100_words': round(sum(filler_counts.values())*100/count, 1) if count else None,
        'repeated_start_count': sum(repeated.values()), 'repeated_starts': [{'text': w, 'count': n} for w, n in repeated.items()],
        'per_step': per_step, 'aspects': aspects,
        'participation': {'learner_contributions': len(turns), 'steps_contributed': sum(s['answers'] > 0 for s in per_step),
                          'questions_answered': sum(s['answers'] > 0 for s in per_step if s['kind'] == 'question'),
                          'slides_explained': sum(s['answers'] > 0 for s in per_step if s['kind'] == 'slide')},
        'limitations': [
            'Word, filler and repeated-start counts depend on recognition; omitted sounds cannot be counted. Zero detected fillers does not establish absence.',
            'Word counts use written token boundaries. Compare the same language and similar tasks, not different languages.',
            'Pauses are VAD estimates of gaps of at least 1.5 seconds within an answer; opening, ending and AI speaking time are excluded. Missing VAD is unavailable, not zero.',
            'Speech-only pace is a VAD estimate, not a syllabic articulation-rate assessment. Natural emphasis and deliberate repetition can resemble fillers or restarts.',
            'Faster speech and fewer pauses do not automatically mean better communication. Content feedback is an AI suggestion, not a clinical or confidence score.',
        ],
    }
