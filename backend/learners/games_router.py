import random
import uuid
import unicodedata
from datetime import datetime, timezone, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import CareGoal, SpeechRecording
from models.experience import GameSession, LearnerReward, ReviewedActivity, GameRecording
from learners.access import accessible_learner, lock_learner, require_practice_consent
from learners.speech_output import synthesize
from learners.game_library import activities as built_in_activities, WORDS as PLAY_WORDS,PHRASES

router = APIRouter(tags=["speech-arcade"])
SYMBOLS = ["moon", "leaf", "star", "flower", "shell", "sun"]
RANDOM = random.SystemRandom()
STORY_PROMPTS = {
    "en": ["Who lives on your island?", "What did they discover?", "What happens next?"],
    "hi": ["तुम्हारे द्वीप पर कौन रहता है?", "उन्हें क्या मिला?", "आगे क्या होता है?"],
    "ml": ["നിന്റെ ദ്വീപിൽ ആരാണ് താമസിക്കുന്നത്?", "അവർ എന്താണ് കണ്ടെത്തിയത്?", "അടുത്തതായി എന്ത് സംഭവിക്കുന്നു?"],
}


class StartGame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game: Literal["memory", "listening", "story", 'syllable', 'picture', 'rhythm']
    difficulty: Literal['starter', 'growing', 'challenge'] = 'starter'
    request_id: uuid.UUID | None = None
    cooperative: bool = False
    voice_only: bool = True


def requested_game(session, learner_id, payload):
    if session.learner_id != learner_id:
        raise HTTPException(404, 'Game request not found')
    expected = payload.model_dump(mode='json', exclude={'request_id'})
    if not session.challenges or session.challenges[0].get('start_request') != expected:
        raise HTTPException(409, 'This request identifier belongs to a different game setup')
    return public_session(session)


def public_session(session):
    if session.game == "memory":
        challenges = [{"cards": session.challenges[0]["cards"]}]
    elif session.game == "listening":
        challenges = [{"id": item["id"], "options": item["options"], "audio_base64": item["audio_base64"]} for item in session.challenges]
    elif session.game in ['syllable', 'picture']:
        challenges = [{key: value for key, value in item.items() if key != 'answer'} for item in session.challenges]
    else:
        challenges = session.challenges
    return {"id": str(session.id), "game": session.game, "challenges": challenges,
            'cooperative': bool(session.challenges[0].get('cooperative')),
            'difficulty': session.challenges[0].get('difficulty', 'starter'),
            "responses": session.responses, "completed": session.completed,
            'voice_only':session.challenges[0].get('start_request',{}).get('voice_only',False),
            "reward_kind": "participation", "pronunciation_score": None}


@router.post("/learners/{learner_id}/games", status_code=201)
async def start_game(learner_id: uuid.UUID, payload: StartGame,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    actor_id = user.id
    learner = await accessible_learner(db, user, learner_id)
    consent = await require_practice_consent(db, learner_id)
    if payload.cooperative and payload.game != 'memory':
        raise HTTPException(422, 'Shared-device turns are currently available for Memory Meadow')
    if payload.request_id:
        existing = await db.get(GameSession, payload.request_id)
        if existing:
            return requested_game(existing, learner_id, payload)
    goals = (await db.execute(select(CareGoal).where(CareGoal.learner_id == learner_id,
        CareGoal.active.is_(True), CareGoal.language == learner.language))).scalars().all()
    if payload.game == "memory":
        pairs = {'starter': 3, 'growing': 4, 'challenge': 6}[payload.difficulty]
        cards = RANDOM.sample(SYMBOLS, pairs) * 2
        RANDOM.shuffle(cards)
        challenges = [{"cards": cards}]
    elif payload.game == "listening":
        if not consent.cloud_processing_allowed:
            raise HTTPException(403, "Cloud speech permission is required for this listening activity")
        words = list(dict.fromkeys(goal.practice_word for goal in goals))
        words=list(dict.fromkeys([*words,*PLAY_WORDS[learner.language].values()]))
        if payload.difficulty!='starter':words=list(PHRASES[learner.language][payload.difficulty])
        challenges = []
        for index in range({'starter':3,'growing':5,'challenge':7}[payload.difficulty]):
            options = RANDOM.sample(words, 3)
            answer = RANDOM.randrange(3)
            speech = await synthesize(options[answer], learner.language)
            challenges.append({"id": index, "options": options, "answer": answer, "audio_base64": speech["audio_base64"]})
    elif payload.game in ['syllable', 'picture', 'rhythm']:
        activities = (await db.execute(select(ReviewedActivity).where(ReviewedActivity.learner_id == learner_id,
            ReviewedActivity.active.is_(True), ReviewedActivity.kind == payload.game, ReviewedActivity.language == learner.language,
            ReviewedActivity.min_age <= learner.age, ReviewedActivity.max_age >= learner.age))).scalars().all()
        activities = [activity for activity in activities if activity.content.get('difficulty', 'starter') == payload.difficulty]
        if not activities:
            activities=built_in_activities(learner.language,payload.game,payload.difficulty)
        if payload.game == 'picture' and (len({item.content['picture'] for item in activities}) < 3 or len({item.word for item in activities}) < 3):
            activities=built_in_activities(learner.language,payload.game,payload.difficulty)
        challenges = []
        for index in range({'starter':3,'growing':5,'challenge':7}[payload.difficulty] if payload.game=='syllable' else 3):
            activity = activities[index % len(activities)]
            item = {'id': index, 'activity_id': str(activity.id), 'source': getattr(activity,'source','clinician_authored'),
                'word': activity.word, 'instruction': activity.instruction, 'goal_id': str(activity.goal_id) if activity.goal_id else None}
            if payload.game == 'syllable':
                shuffled = list(enumerate(activity.content['syllables'])); RANDOM.shuffle(shuffled)
                item.update(pieces=[piece for _, piece in shuffled], answer=[next(j for j, (original, _) in enumerate(shuffled) if original == i) for i in range(len(shuffled))])
            elif payload.game == 'picture':
                by_picture = {entry.content['picture']: entry for entry in activities}
                candidates = list({entry.word: entry for picture, entry in by_picture.items()
                    if picture != activity.content['picture'] and entry.word != activity.word}.values())
                if len(candidates) < 2:
                    raise HTTPException(422, 'Add unambiguous reviewed picture-word associations for three different objects')
                others = RANDOM.sample(candidates, 2)
                options = [activity, *others]; RANDOM.shuffle(options)
                item.update(picture=activity.content['picture'], options=[entry.word for entry in options], answer=options.index(activity))
            else:
                item.update(beat_intervals=activity.content['beat_intervals'])
            challenges.append(item)
    else:
        challenges = [{"id": index, "prompt": prompt, "word": goals[index % len(goals)].practice_word if goals else None}
                      for index, prompt in enumerate(STORY_PROMPTS[learner.language])]
    await lock_learner(db, user, learner_id)
    current_consent = await require_practice_consent(db, learner_id)
    if payload.game == 'listening' and not current_consent.cloud_processing_allowed:
        raise HTTPException(403, 'Cloud speech permission was withdrawn')
    for challenge in challenges:
        challenge['difficulty'] = payload.difficulty
    challenges[0]['start_request'] = payload.model_dump(mode='json', exclude={'request_id'})
    challenges[0]['cooperative'] = payload.cooperative
    session = GameSession(id=payload.request_id or uuid.uuid4(), learner_id=learner_id, game=payload.game, challenges=challenges, responses=[])
    db.add(session)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        user = await db.get(User, actor_id, populate_existing=True)
        if user is None:
            raise HTTPException(401, 'Sign in again before resuming this game')
        await lock_learner(db, user, learner_id)
        await require_practice_consent(db, learner_id)
        existing = await db.get(GameSession, payload.request_id) if payload.request_id else None
        if not existing:
            raise HTTPException(409, 'Game setup changed concurrently; retry')
        return requested_game(existing, learner_id, payload)
    return public_session(session)


class GameAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_id: uuid.UUID
    challenge: int = Field(ge=0, le=19)
    choice: int | None = Field(default=None, ge=0, le=2)
    pair: list[int] | None = Field(default=None, min_length=2, max_length=2)
    text: str | None = Field(default=None, max_length=1000)
    order: list[int] | None = Field(default=None, min_length=2, max_length=8)
    tap_intervals: list[float] | None = Field(default=None, min_length=2, max_length=8)


@router.get("/games/{session_id}")
async def resume_game(session_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = await db.get(GameSession, session_id)
    if session is None:
        raise HTTPException(404, "Game session not found")
    await accessible_learner(db, user, session.learner_id)
    return public_session(session)


@router.post("/games/{session_id}/answer")
async def answer_game(session_id: uuid.UUID, payload: GameAnswer,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = (await db.execute(select(GameSession).where(GameSession.id == session_id).with_for_update())).scalar_one_or_none()
    if session is None:
        raise HTTPException(404, "Game session not found")
    await accessible_learner(db, user, session.learner_id)
    await require_practice_consent(db, session.learner_id)
    prior = next((item for item in session.responses if item["request_id"] == str(payload.request_id)), None)
    if prior:
        fields = ['challenge', 'pair'] if session.game == 'memory' else ['challenge', 'choice'] if session.game in ['listening', 'picture'] else ['challenge', 'order'] if session.game == 'syllable' else ['challenge', 'tap_intervals'] if session.game == 'rhythm' else ['challenge', 'text']
        if any(prior.get(field) != getattr(payload, field) for field in fields):
            raise HTTPException(409, 'Request ID was used for a different answer')
        return {"completed": session.completed, "result": prior, "reward_kind": "participation"}
    if session.completed:
        raise HTTPException(409, "This session is already complete")
    if session.game in ['listening','syllable','story'] and session.challenges[0].get('start_request',{}).get('voice_only',False):
        raise HTTPException(422,'This adventure accepts recorded voice answers only')
    if payload.challenge != len(session.responses):
        raise HTTPException(409, "Answer the next challenge in order")
    result = {"request_id": str(payload.request_id), "challenge": payload.challenge, "source": "interaction_task"}
    if session.game == "memory":
        if session.challenges[0].get('cooperative'):
            result['assigned_turn'] = 'participant' if len(session.responses) % 2 == 0 else 'supporter'
            result['turn_source'] = 'shared_device_turn_assignment_not_verified_identity'
        pair = payload.pair
        card_count = len(session.challenges[0]['cards'])
        if pair is None or pair[0] == pair[1] or any(index < 0 or index >= card_count for index in pair):
            raise HTTPException(422, "Choose two different cards")
        matched = {index for item in session.responses if item.get("matched") for index in item["pair"]}
        if any(index in matched for index in pair):
            raise HTTPException(409, "These cards are already matched")
        result.update(pair=pair, matched=session.challenges[0]["cards"][pair[0]] == session.challenges[0]["cards"][pair[1]])
        session.completed = len(matched) + (2 if result["matched"] else 0) == card_count or len(session.responses) >= 19
    elif session.game in ["listening", 'picture']:
        if payload.choice is None or payload.challenge >= len(session.challenges):
            raise HTTPException(422, "Select a word")
        result.update(choice=payload.choice, matched=payload.choice == session.challenges[payload.challenge]["answer"])
        session.completed = payload.challenge == len(session.challenges)-1
    elif session.game == 'syllable':
        expected = session.challenges[payload.challenge]['answer']
        if payload.order is None or sorted(payload.order) != list(range(len(expected))):
            raise HTTPException(422, 'Arrange each syllable tile once')
        pieces = session.challenges[payload.challenge]['pieces']
        result.update(order=payload.order, matched=[pieces[index] for index in payload.order] == [pieces[index] for index in expected])
        session.completed = payload.challenge == len(session.challenges)-1
    elif session.game == 'rhythm':
        expected = session.challenges[payload.challenge]['beat_intervals']
        if payload.tap_intervals is None or len(payload.tap_intervals) != len(expected) or any(not .05 <= value <= 30 for value in payload.tap_intervals):
            raise HTTPException(422, 'Provide the measured intervals for this pattern')
        result.update(tap_intervals=payload.tap_intervals, source='browser_reported_tap_intervals',
            mean_interval_difference_seconds=sum(abs(left - right) for left, right in zip(expected, payload.tap_intervals)) / len(expected),
            clinical_interpretation=False)
        session.completed = payload.challenge == 2
    else:
        if not payload.text or payload.challenge >= 3:
            raise HTTPException(422, "Share a thought or a communication-board message")
        result["text"] = payload.text
        session.completed = payload.challenge == 2
    session.responses = [*session.responses, result]
    if session.completed:
        session.completed_at = datetime.now(timezone.utc)
        db.add(LearnerReward(learner_id=session.learner_id, session_id=session.id, stars=3))
    await db.commit()
    return {"result": result, "completed": session.completed, "stars_awarded": 3 if session.completed else 0,
            "reward_kind": "participation", "pronunciation_score": None}


@router.post('/games/{session_id}/recordings/{recording_id}')
async def link_recording(session_id: uuid.UUID, recording_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = await db.get(GameSession, session_id)
    if not session:
        raise HTTPException(404, 'Game not found')
    await lock_learner(db, user, session.learner_id)
    await require_practice_consent(db, session.learner_id)
    record = await db.get(SpeechRecording, recording_id)
    if not record or record.learner_id != session.learner_id:
        raise HTTPException(404, 'Recording not found')
    if not await db.get(GameRecording, (session_id, recording_id)):
        db.add(GameRecording(session_id=session_id, recording_id=recording_id, linked_by=user.id)); await db.commit()
    return {'linked': True, 'source': 'participant_linked_recording'}


class VoiceAnswer(BaseModel):
    model_config=ConfigDict(extra='forbid')
    recording_id:uuid.UUID
    request_id:uuid.UUID
    challenge:int=Field(ge=0,le=19)


def spoken_key(text):
    return ''.join(char for char in unicodedata.normalize('NFC',text or '').casefold() if unicodedata.category(char)[0] in 'LNM')


@router.post('/games/{session_id}/voice-answer')
async def voice_answer(session_id:uuid.UUID,payload:VoiceAnswer,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    session=await db.get(GameSession,session_id)
    if not session:raise HTTPException(404,'Game not found')
    learner=await accessible_learner(db,user,session.learner_id,owner_only=True)
    consent=await require_practice_consent(db,session.learner_id)
    if not consent.cloud_processing_allowed or not consent.retain_audio_allowed:
        raise HTTPException(403,'Voice play needs cloud processing and private audio retention permission')
    if session.game not in ['listening','syllable','story']:raise HTTPException(422,'Choose a voice adventure')
    if payload.challenge>=len(session.challenges):raise HTTPException(422,'Unknown game step')
    challenge=session.challenges[payload.challenge]
    cached=next((attempt for attempt in challenge.get('voice_attempts',[]) if attempt['request_id']==str(payload.request_id)),None)
    if cached:
        if cached['recording_id']!=str(payload.recording_id):raise HTTPException(409,'This voice request belongs to another recording')
        return {**cached,'result':session.responses[payload.challenge] if cached['advanced'] else None,'session':public_session(session)}
    if session.completed or payload.challenge!=len(session.responses):raise HTTPException(409,'Answer the current voice challenge')
    recording=await db.get(SpeechRecording,payload.recording_id)
    if not recording or recording.learner_id!=session.learner_id:raise HTTPException(404,'Recording not found')
    if recording.language!=learner.language or not recording.storage_key:raise HTTPException(422,'Use a retained recording in the game language')
    binding=recording.quality.get('voice_game')
    if recording.quality.get('maya_call_id'):raise HTTPException(409,'Use a fresh game recording, not a saved Maya call')
    other_game=(await db.execute(select(GameRecording).where(GameRecording.recording_id==payload.recording_id,GameRecording.session_id!=session_id))).scalars().first()
    if other_game:raise HTTPException(409,'This recording already belongs to another game')
    if binding and binding!={'session_id':str(session_id),'challenge':payload.challenge}:
        raise HTTPException(409,'This recording already belongs to another voice challenge')
    expected=challenge['options'][challenge['answer']] if session.game=='listening' else challenge['word'] if session.game=='syllable' else ''
    transcript=recording.transcript or '';language=recording.language;game=session.game;actor=user.id
    recording.expected_text=expected
    recording.quality={**recording.quality,'voice_game':{'session_id':str(session_id),'challenge':payload.challenge}}
    if not await db.get(GameRecording,(session_id,payload.recording_id)):
        db.add(GameRecording(session_id=session_id,recording_id=payload.recording_id,linked_by=user.id))
    await db.commit()
    # Intent matching is not sound assessment. A transcript never proves a /p/.
    skip=spoken_key(transcript) in {spoken_key(word) for word in ['skip','skip this','next','छोड़ो','अगला','ഒഴിവാക്കൂ','അടുത്തത്']}
    minimum={'starter':2,'growing':4,'challenge':6}[challenge.get('difficulty','starter')]
    wrong_option=game=='listening' and any(spoken_key(transcript)==spoken_key(word) and spoken_key(word)!=spoken_key(expected) for word in challenge['options'])
    coaching=None
    if not skip and not wrong_option:
        from learners.speech_coaching import coach,CoachingRequest
        coaching=await coach(payload.recording_id,CoachingRequest(mode='story' if game=='story' else 'listen_then_say',allow_model_audio=True),user,db)
    state='skipped' if skip else 'different_word' if wrong_option else 'story_too_short' if game=='story' and len(transcript.split())<minimum else 'story_shared' if game=='story' else (coaching or {}).get('content',{}).get('state','insufficient_evidence')
    advance=skip or state=='story_shared' or (state=='no_clear_difference' and spoken_key(transcript)==spoken_key(expected))
    if state=='no_clear_difference' and not advance:state='insufficient_evidence'
    feedback=(coaching or {}).get('content',{}).get('summary') or {
        'en':'Listen once more, then say the word. You can say “skip” to continue.',
        'hi':'फिर सुनें और शब्द बोलें। आगे बढ़ने के लिए “अगला” कह सकते हैं।',
        'ml':'വീണ്ടും കേട്ടിട്ട് വാക്ക് പറയൂ. തുടരാൻ “അടുത്തത്” എന്ന് പറയാം.'}[language]
    if wrong_option:feedback={'en':f'I heard “{transcript}”. Listen for “{expected}” and try that word.',
        'hi':f'मुझे “{transcript}” सुनाई दिया। “{expected}” सुनें और फिर कहें।',
        'ml':f'“{transcript}” എന്നാണ് കേട്ടത്. “{expected}” കേട്ടിട്ട് പറഞ്ഞുനോക്കൂ.'}[language]
    if state=='story_too_short':feedback={'en':f'Tell me a little more: try at least {minimum} words.',
        'hi':f'थोड़ा और बताइए: कम से कम {minimum} शब्द बोलें।',
        'ml':f'കുറച്ചുകൂടി പറയാമോ? കുറഞ്ഞത് {minimum} വാക്കുകൾ ഉപയോഗിക്കാം.'}[language]
    if advance and game!='story':feedback={'en':'Your attempt is saved. Let’s travel to the next challenge.',
        'hi':'आपका प्रयास सहेजा गया। अब अगले पड़ाव पर चलें।',
        'ml':'നിങ്ങളുടെ ശ്രമം സൂക്ഷിച്ചു. ഇനി അടുത്ത ഘട്ടത്തിലേക്ക് പോകാം.'}[language]
    user=await db.get(User,actor)
    if not user:raise HTTPException(401,'Sign in again')
    session=(await db.execute(select(GameSession).where(GameSession.id==session_id).with_for_update().execution_options(populate_existing=True))).scalar_one()
    await accessible_learner(db,user,session.learner_id,owner_only=True)
    current_consent=await require_practice_consent(db,session.learner_id)
    if not current_consent.cloud_processing_allowed or not current_consent.retain_audio_allowed:raise HTTPException(403,'Voice play permission was withdrawn')
    cached=next((attempt for attempt in session.challenges[payload.challenge].get('voice_attempts',[]) if attempt['request_id']==str(payload.request_id)),None)
    if cached:
        if cached['recording_id']!=str(payload.recording_id):raise HTTPException(409,'This voice request belongs to another recording')
        return {**cached,'result':session.responses[payload.challenge] if cached['advanced'] else None,'session':public_session(session)}
    if len(session.responses)!=payload.challenge:raise HTTPException(409,'This game step changed; reload saved progress')
    attempt={'request_id':str(payload.request_id),'recording_id':str(payload.recording_id),'challenge':payload.challenge,
        'state':state,'advanced':advance,'feedback':feedback,'content':{key:value for key,value in (coaching or {}).get('content',{}).items() if key in ['summary','concerns','teaching_plan']},'source':'recorded_voice_with_audio_evidence','pronunciation_score':None}
    updated=[dict(item) for item in session.challenges]
    updated[payload.challenge]['voice_attempts']=[*updated[payload.challenge].get('voice_attempts',[])[-19:],attempt];session.challenges=updated
    if advance:
        result={**attempt,'matched':state=='no_clear_difference','skipped':skip}
        if game=='listening':result['choice']=challenge['answer']
        if game=='syllable':result['order']=challenge['answer']
        if game=='story':result['text']=transcript
        session.responses=[*session.responses,result]
        session.completed=len(session.responses)==len(session.challenges)
        if session.completed:
            session.completed_at=datetime.now(timezone.utc)
            db.add(LearnerReward(learner_id=session.learner_id,session_id=session.id,stars=3))
    await db.commit()
    return {**attempt,'result':session.responses[-1] if advance else None,'session':public_session(session)}


@router.get("/learners/{learner_id}/adventure")
async def adventure(learner_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await accessible_learner(db, user, learner_id)
    stars = (await db.execute(select(func.coalesce(func.sum(LearnerReward.stars), 0))
                             .where(LearnerReward.learner_id == learner_id))).scalar_one()
    sessions = (await db.execute(select(GameSession).where(GameSession.learner_id == learner_id)
        .order_by(GameSession.created_at.desc()).limit(100))).scalars().all()
    since = datetime.now(timezone.utc) - timedelta(days=7)
    total = (await db.execute(select(func.count()).select_from(GameSession).where(
        GameSession.learner_id == learner_id, GameSession.completed.is_(True)))).scalar_one()
    recent = (await db.execute(select(func.count()).select_from(GameSession).where(
        GameSession.learner_id == learner_id, GameSession.completed.is_(True), GameSession.completed_at >= since))).scalar_one()
    return {"stars": stars, "completed_sessions": total,
            "last_7_days_completed": recent, "cosmetics": [name for threshold, name in [(0, "cloud"), (9, "moon"), (18, "aurora"), (30, "sunrise")] if stars >= threshold],
            "history": [{"id": str(session.id), "game": session.game, "completed": session.completed,
                         "created_at": session.created_at.isoformat()} for session in sessions[:20]],
            "reward_basis": "participation_not_pronunciation", "history_limit": 100}
