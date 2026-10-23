from sqlalchemy import select
from models.care import RecordingReview, SpeechRecording

PRACTICE_CONTEXT_VERSION = 'reviewed-practice-support-v2'


def current_review_filter():
    replaced = select(RecordingReview.supersedes_review_id).where(
        RecordingReview.supersedes_review_id.is_not(None)).correlate(None)
    return RecordingReview.id.not_in(replaced)


async def practice_evidence(db, learner_id, language, goal):
    """Current, target-scoped observations; counts never become a diagnosis."""
    if goal is None:
        return {'observations': [], 'repeated_difficulty': [], 'scope_limited': False,
                'support_plan': None}
    rows = (await db.execute(select(RecordingReview).join(SpeechRecording,
        SpeechRecording.id == RecordingReview.recording_id).where(
            SpeechRecording.learner_id == learner_id, SpeechRecording.language == language,
            RecordingReview.sound == goal.sound, current_review_filter())
        .order_by(RecordingReview.created_at.desc(), RecordingReview.id.desc()).limit(51))).scalars().all()
    return summarize_practice_evidence(goal, rows[:50], len(rows) > 50)


def summarize_practice_evidence(goal, rows, scope_limited=False):
    # Multiple segments/reviewers on one recording are not independent attempts.
    # Disagreement is withheld conservatively until human review resolves it.
    grouped = {}
    for row in rows:
        grouped.setdefault((row.recording_id, row.context), []).append(row)
    observations, difficulties = [], {}
    latest_contexts = set()
    for (recording_id, context), reviews in grouped.items():
        outcomes = {row.outcome for row in reviews}
        outcome = next(iter(outcomes)) if len(outcomes) == 1 else 'uncertain'
        observations.append({'recording_id': str(recording_id), 'context': context,
            'sound': goal.sound, 'outcome': outcome,
            'review_ids': [str(row.id) for row in reviews], 'review_disagreement': len(outcomes) > 1})
        if context not in latest_contexts:
            latest_contexts.add(context)
            difficulties[context] = [] if outcome == 'difficulty' else None
        if outcome == 'difficulty' and difficulties[context] is not None:
            difficulties[context].append(observations[-1])
    return {'observations': observations, 'scope_limited': scope_limited,
        'repeated_difficulty': [{'context': context,
            'recording_ids': [item['recording_id'] for item in items],
            'review_ids': [review for item in items for review in item['review_ids']]}
            for context, items in difficulties.items() if items is not None and len(items) >= 2],
        'support_plan': {'source': 'clinician_selected_goal_phase', 'goal_id': str(goal.id),
            'phase': goal.phase, 'initial_support': 'demonstrate_once' if goal.phase == 'establishment' else 'independent_first',
            'help': 'approved_cue_on_request', 'automatic_phase_advancement': False,
            'current_attempt_sound_assessment': 'unavailable_without_separate_review'}}
