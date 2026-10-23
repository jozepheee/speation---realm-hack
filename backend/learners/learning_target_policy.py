"""Choose one useful target from confirmed messages and repeat audio evidence.

Unreviewed model findings remain suggestions. Never use spelling difficulty or
an ASR transcript as evidence that a sound was produced incorrectly.
"""
import re
import string
from types import SimpleNamespace
from sqlalchemy import select
from models.care import AcousticProposal, SpeechRecording, RecordingReview
from models.speech_workflow import MessageTranslation
from learners.review_evidence import current_review_filter

def clear_words(text):
    return {word.strip(string.punctuation+'“”‘’').casefold() for word in (text or '').split()}


def rank_targets(rows, blocked_recordings=None, cleared_recordings=None):
    candidates, seen, resolved = {}, set(), set()
    blocked_recordings=blocked_recordings or set()
    cleared_recordings=cleared_recordings or set()
    # Input is newest first. A newer clear attempt retires an older difficulty.
    for proposal, recording, translation in rows:
        if str(recording.id) in cleared_recordings:
            resolved.update(clear_words(recording.expected_text))
            resolved.update((item.get('word') or '').strip().casefold() for item in (proposal.content or {}).get('concerns',[]))
            continue
        if str(recording.id) in seen or str(recording.id) in blocked_recordings or proposal.decision == 'rejected':
            continue
        seen.add(str(recording.id))
        content = proposal.content or {}
        if content.get('state') == 'no_clear_difference' and not content.get('concerns'):
            resolved.update(clear_words(recording.expected_text))
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


def rank_daily_targets(rows,blocked_recordings=None,cleared_recordings=None):
    """Recurring acoustic candidates, with later practice/review retiring old issues.

    Free speech cannot establish intended words. Always confirm a suggestion in
    Learn, even when multiple independent recordings contain the observation.
    """
    blocked_recordings=blocked_recordings or set();cleared_recordings=cleared_recordings or set()
    candidates={};resolved=set();seen=set()
    for proposal,recording in rows:
        rid=str(recording.id);content=proposal.content or {};purpose=proposal.request.get('purpose')
        if rid in cleared_recordings:
            resolved.update(clear_words(recording.expected_text))
            resolved.update((c.get('word') or '').casefold() for c in content.get('concerns',[]))
            continue
        if rid in seen or rid in blocked_recordings or proposal.decision=='rejected':continue
        seen.add(rid)
        if purpose=='maya_coaching':
            # Only a target-bound audio assessment can resolve a previous issue.
            if content.get('state')=='no_clear_difference' and not content.get('concerns'):
                resolved.update(clear_words(recording.expected_text))
            continue
        if purpose!='daily_observation' or content.get('state')!='tentative_observation' or content.get('source')!='silent_conversation_audio_observation':continue
        for concern in content.get('concerns',[]):
            word=(concern.get('word') or '').strip();key=word.casefold();phone=concern.get('expected_phone')
            if not word or len(word)>120 or key in resolved or not phone or concern.get('category')=='uncertain':continue
            confirmed=bool(content.get('intent_confirmed'))
            item=candidates.setdefault(key,{'word':word,'sound':phone,'produced_phone':concern.get('produced_phone'),
                'category':concern.get('category'),'observation':concern.get('observation'),
                'recording_ids':set(),'reviewed_recording_ids':set(),'intent_confirmed_recording_ids':set(),'proposal_ids':set(),
                'source':'daily_audio_observation','requires_confirmation':True,'confirmed_message':None,
                'character_differences':(content.get('indic_character_assessment') or {}).get('differences',[])})
            item['recording_ids'].add(rid)
            if getattr(proposal,'id',None):item['proposal_ids'].add(str(proposal.id))
            if confirmed:
                item['intent_confirmed_recording_ids'].add(rid);item['requires_confirmation']=False
                item['confirmed_message']=proposal.request.get('expected_text')
            if proposal.decision=='accepted':item['reviewed_recording_ids'].add(rid)
    eligible=[item for item in candidates.values() if len(item['recording_ids'])>=2 or item['intent_confirmed_recording_ids'] or item['reviewed_recording_ids']]
    eligible.sort(key=lambda item:(len(item['reviewed_recording_ids']),len(item['intent_confirmed_recording_ids']),len(item['recording_ids'])),reverse=True)
    return [{**item,'observation_count':len(item['recording_ids']),'recording_ids':sorted(item['recording_ids']),
        'intent_confirmed_recording_ids':sorted(item['intent_confirmed_recording_ids']),'proposal_ids':sorted(item['proposal_ids']),
        'reviewed_recording_ids':sorted(item['reviewed_recording_ids'])} for item in eligible]


async def suggested_targets(db, learner_id, language):
    # Target selection needs small summaries, not hundreds of acoustic frames,
    # recording word timings and provider payloads on every UI refresh.
    columns=[AcousticProposal.id.label('proposal_id'),AcousticProposal.decision,
        AcousticProposal.request['purpose'].as_string().label('purpose'),
        AcousticProposal.request['expected_text'].as_string().label('confirmed_message'),
        AcousticProposal.content['state'].as_string().label('state'),
        AcousticProposal.content['source'].as_string().label('source'),
        AcousticProposal.content['intent_confirmed'].as_boolean().label('intent_confirmed'),
        AcousticProposal.content['concerns'].label('concerns'),
        AcousticProposal.content['indic_character_assessment']['differences'].label('differences'),
        SpeechRecording.id.label('recording_id'),SpeechRecording.expected_text]
    def unpack(row):
        proposal=SimpleNamespace(id=row.proposal_id,decision=row.decision,
            request={'purpose':row.purpose,'expected_text':row.confirmed_message},
            content={'state':row.state,'source':row.source,'intent_confirmed':row.intent_confirmed,
                'concerns':row.concerns or [],'indic_character_assessment':{'differences':row.differences or []}})
        return proposal,SimpleNamespace(id=row.recording_id,expected_text=row.expected_text)
    saved=(await db.execute(select(*columns,MessageTranslation.confirmed_text)
        .join(SpeechRecording,SpeechRecording.id==AcousticProposal.recording_id)
        .join(MessageTranslation,MessageTranslation.recording_id==SpeechRecording.id)
        .where(SpeechRecording.learner_id==learner_id,SpeechRecording.language==language,
            AcousticProposal.decision!='rejected',MessageTranslation.learner_id==learner_id,
            MessageTranslation.confirmed_at.is_not(None),
            AcousticProposal.request['purpose'].as_string()=='maya_coaching')
        .order_by(AcousticProposal.created_at.desc(),MessageTranslation.confirmed_at.desc()).limit(60))).all()
    rows=[(*unpack(row),SimpleNamespace(confirmed_text=row.confirmed_text)) for row in saved]
    saved_daily=(await db.execute(select(*columns)
        .join(SpeechRecording,SpeechRecording.id==AcousticProposal.recording_id)
        .where(SpeechRecording.learner_id==learner_id,SpeechRecording.language==language,
            AcousticProposal.request['purpose'].as_string().in_(['daily_observation','maya_coaching']))
        .order_by(SpeechRecording.created_at.desc(),AcousticProposal.created_at.desc()).limit(150))).all()
    daily_rows=[unpack(row) for row in saved_daily]
    identifiers={recording.id for _,recording,_ in rows}|{recording.id for _,recording in daily_rows}
    reviews=(await db.execute(select(RecordingReview).where(RecordingReview.recording_id.in_(identifiers),
        current_review_filter()))).scalars().all() if identifiers else []
    # A correction or disagreement takes precedence over an AI difficulty.
    blocked={str(review.recording_id) for review in reviews if review.outcome!='difficulty'}
    cleared={str(review.recording_id) for review in reviews if review.outcome in ['independent','supported']}
    candidates=rank_targets(rows,blocked,cleared)+rank_daily_targets(daily_rows,blocked,cleared)
    unique={}
    for item in candidates:unique.setdefault(item['word'].casefold(),item)
    return list(unique.values())[:5]
