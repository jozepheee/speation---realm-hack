"""Choose one useful target from confirmed messages and repeat audio evidence.

Unreviewed model findings remain suggestions. Never use spelling difficulty or
an ASR transcript as evidence that a sound was produced incorrectly.
"""
import re
from sqlalchemy import select
from models.care import AcousticProposal, SpeechRecording, RecordingReview
from models.speech_workflow import MessageTranslation
from learners.review_evidence import current_review_filter


def rank_targets(rows, blocked_recordings=None, cleared_recordings=None):
    candidates, seen, resolved = {}, set(), set()
    blocked_recordings=blocked_recordings or set()
    cleared_recordings=cleared_recordings or set()
    # Input is newest first. A newer clear attempt retires an older difficulty.
    for proposal, recording, translation in rows:
        if str(recording.id) in cleared_recordings:
            resolved.add((recording.expected_text or '').strip().casefold())
            resolved.update((item.get('word') or '').strip().casefold() for item in (proposal.content or {}).get('concerns',[]))
            continue
        if str(recording.id) in seen or str(recording.id) in blocked_recordings or proposal.decision == 'rejected':
            continue
        seen.add(str(recording.id))
        content = proposal.content or {}
        if content.get('state') == 'no_clear_difference' and not content.get('concerns'):
            resolved.add((recording.expected_text or '').strip().casefold())
            continue
        if content.get('state') != 'tentative_observation' or not translation.confirmed_text:
            continue
        for concern in content.get('concerns', []):
            word = (concern.get('word') or '').strip()
            key = word.casefold()
            if not word or len(word) > 120 or key in resolved or not concern.get('expected_phone'):
                continue
            if not re.search(r'(?<!\w)' + re.escape(word) + r'(?!\w)', translation.confirmed_text, re.I):
                continue
            candidate = candidates.setdefault(key, {'word': word, 'sound': concern['expected_phone'],
                'recording_ids': set(), 'reviewed_recording_ids': set(), 'confirmed_message': translation.confirmed_text,
                'source': 'recurring_audio_suggestion_in_confirmed_message', 'requires_confirmation': True})
            candidate['recording_ids'].add(str(recording.id))
            if proposal.decision == 'accepted':
                candidate['reviewed_recording_ids'].add(str(recording.id))
    eligible = [item for item in candidates.values() if len(item['recording_ids']) >= 2]
    eligible.sort(key=lambda item: (len(item['reviewed_recording_ids']), len(item['recording_ids'])), reverse=True)
    return [{**item, 'recording_ids': sorted(item['recording_ids']),
        'reviewed_recording_ids': sorted(item['reviewed_recording_ids'])} for item in eligible]


async def suggested_targets(db, learner_id, language):
    rows = (await db.execute(select(AcousticProposal, SpeechRecording, MessageTranslation)
        .join(SpeechRecording, SpeechRecording.id == AcousticProposal.recording_id)
        .join(MessageTranslation, MessageTranslation.recording_id == SpeechRecording.id)
        .where(SpeechRecording.learner_id == learner_id, SpeechRecording.language == language,
            AcousticProposal.decision != 'rejected', MessageTranslation.learner_id == learner_id,
            MessageTranslation.confirmed_at.is_not(None),
            AcousticProposal.request['purpose'].as_string() == 'maya_coaching')
        .order_by(AcousticProposal.created_at.desc(), MessageTranslation.confirmed_at.desc()).limit(60))).all()
    identifiers={recording.id for _,recording,_ in rows}
    reviews=(await db.execute(select(RecordingReview).where(RecordingReview.recording_id.in_(identifiers),
        current_review_filter()))).scalars().all() if identifiers else []
    # A correction or disagreement takes precedence over an AI difficulty.
    blocked={str(review.recording_id) for review in reviews if review.outcome!='difficulty'}
    cleared={str(review.recording_id) for review in reviews if review.outcome in ['independent','supported']}
    return rank_targets(rows,blocked,cleared)[:5]
