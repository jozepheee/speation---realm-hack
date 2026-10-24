"""One learner/language-scoped target plan shared by every learning activity."""
import uuid,re,json,hashlib,asyncio,time,copy
from functools import lru_cache
from fastapi import APIRouter,Depends,HTTPException,Query
from sqlalchemy import select,func
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import CareGoal,SpeechRecording
from learners.access import accessible_learner,require_practice_consent
from learners.learning_target_policy import suggested_targets
router=APIRouter(tags=['personal-learning-plan'])

# Vetted contrasts, not an LLM inventing a heard sound or a diagnosis.
WORD_CONTRASTS={'school':('cool','s','k'),'raining':('baining','ɹ','b'),'green':('breen','ɡ','b'),
 'cup':('coup','ʌ','u'),'red':('bed','ɹ','b'),'ring':('wing','ɹ','w'),'sip':('ship','s','ʃ'),
 'fan':('pan','f','p'),'key':('tea','k','t'),'goat':('boat','ɡ','b')}
SOUND_PAIRS={frozenset(['ɹ','b']):['red','bed'],frozenset(['s','k']):['see','key'],
 frozenset(['ɹ','w']):['ring','wing'],frozenset(['s','ʃ']):['sip','ship'],
 frozenset(['f','p']):['fan','pan'],frozenset(['k','t']):['key','tea'],
 frozenset(['ɡ','b']):['goat','boat'],frozenset(['ʌ','u']):['cup','coup']}

def listening_contrast(item,language):
    word=item['word'];expected=item.get('sound');produced=item.get('produced_phone')
    normalized=lambda value:{'g':'ɡ','r':'ɹ','uː':'u'}.get(value,value)
    expected,produced=normalized(expected),normalized(produced)
    if language=='ml':
        change=next((c for c in item.get('character_differences',[]) if c.get('word')==word),None)
        if not change:return None
        wanted=change.get('expected_character');heard=change.get('observed_character')
        if not wanted or not heard or wanted not in word:return None
        foil=word.replace(wanted,heard,1)
        return {'id':'personal','words':[word,foil],'label':wanted+' / '+heard,'same_target':True,
            'foil_is_practice_sound':True,'basis':'acoustic_character_hypothesis_not_verified_phone'}
    direct=WORD_CONTRASTS.get(word.casefold())
    if direct and (expected,produced)==direct[1:]:
        return {'id':'personal','words':[word,direct[0]],'label':str(expected or '')+' / '+str(produced or ''),'same_target':True,
            'foil_is_practice_sound':direct[0] in ['baining','breen'],'basis':'supported_sound_contrast'}
    words=SOUND_PAIRS.get(frozenset([expected,produced])) if expected and produced else None
    if not produced and item.get('source')=='assigned_clinician_goal':
        words=next((pair for phones,pair in SOUND_PAIRS.items() if expected in phones),None)
    if words:return {'id':'personal','words':words,'label':str(expected or '')+' / '+str(produced or ''),'same_target':False,
        'foil_is_practice_sound':False,'basis':'same_sound_contrast_in_familiar_words'}
    return None

async def plan(db,learner_id,language):
    goals=(await db.execute(select(CareGoal).where(CareGoal.learner_id==learner_id,CareGoal.language==language,CareGoal.active.is_(True))
        .order_by(CareGoal.created_at.desc()).limit(8))).scalars().all()
    targets=[{'word':goal.practice_word,'sound':goal.sound,'source':'assigned_clinician_goal','goal_id':str(goal.id),
        'requires_confirmation':False,'recording_ids':[],'observation_count':0} for goal in goals if goal.practice_word]
    targets+=await suggested_targets(db,learner_id,language)
    unique={}
    for item in targets:
        key=item['word'].casefold()
        if key not in unique:unique[key]=dict(item)
        elif unique[key].get('source')=='assigned_clinician_goal':
            unique[key].update({name:value for name,value in item.items() if name not in ['word','sound','source','goal_id','requires_confirmation']})
    for item in unique.values():item['listening']=listening_contrast(item,language)
    matches=lambda word: bool(re.search(r'[\u0d00-\u0d7f]',word)) and not re.search(r'[A-Za-z]',word) if language=='ml' else bool(re.search(r'[A-Za-z]',word)) and not re.search(r'[\u0d00-\u0d7f\u0900-\u097f]',word) if language=='en' else True
    targets=[item for item in unique.values() if matches(item['word'])][:8]
    # Fresh, confirmed daily observations seed practice; assigned goals remain available.
    targets.sort(key=lambda item:bool(item.get('intent_confirmed_recording_ids')),reverse=True)
    # A direct path back to a real confirmed daily message for My Message.
    from models.speech_workflow import MessageTranslation
    ids={uuid.UUID(value) for item in targets for value in item.get('intent_confirmed_recording_ids',[])}
    translations=(await db.execute(select(MessageTranslation.id,MessageTranslation.recording_id).where(
        MessageTranslation.recording_id.in_(ids),MessageTranslation.learner_id==learner_id,MessageTranslation.confirmed_at.is_not(None))
        .order_by(MessageTranslation.confirmed_at.desc()))).all() if ids else []
    for item in targets:
        translation=next((row for row in translations if str(row.recording_id) in item.get('intent_confirmed_recording_ids',[])),None)
        if translation:item['translation_id']=str(translation.id)
    pending=(await db.execute(select(func.count()).select_from(SpeechRecording).where(SpeechRecording.learner_id==learner_id,SpeechRecording.language==language,SpeechRecording.quality['daily_observation']['state'].as_string().in_(['queued','processing'])))).scalar_one()
    from learners.conversation_intent import public as meaning_public
    meanings=(await db.execute(select(MessageTranslation).join(SpeechRecording,SpeechRecording.id==MessageTranslation.recording_id)
        .where(MessageTranslation.learner_id==learner_id,SpeechRecording.language==language,MessageTranslation.confirmed_at.is_(None),
            MessageTranslation.provenance['state'].as_string()=='proposed',
            MessageTranslation.provenance['automatically_queued'].as_boolean().is_(True))
        .order_by(MessageTranslation.created_at.desc()).limit(8))).scalars().all()
    waiting=[{**meaning_public(item),'call_id':item.provenance['call_id']} for item in meanings if item.provenance.get('state')=='proposed']
    from models.speech_workflow import LiveCall
    latest=(await db.execute(select(LiveCall.id,LiveCall.status).where(LiveCall.learner_id==learner_id,LiveCall.language==language,
        LiveCall.mode.in_(['conversation','daily_moment']),LiveCall.ended_at.is_not(None)).order_by(LiveCall.created_at.desc()).limit(1))).first()
    conversation={'id':str(latest.id),'status':latest.status} if latest else None
    revision=hashlib.sha256(json.dumps({'conversation_id':conversation['id'] if conversation else None,'targets':targets},sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:24]
    return {'revision':revision,'latest_conversation':conversation,'meaning_confirmations':waiting,'pending_observations':pending,'language':language,'targets':targets,'active_target':targets[0] if targets else None,
        'source':'clinician_goals_and_supported_audio_observations','automatic_mastery':False,
        'instruction':'Offer one useful target. Let the learner choose, pause or use another message. Unconfirmed suggestions need meaning confirmation.'}

@lru_cache(maxsize=128)
def _plan_slot(learner_id,language):
    return {'lock':asyncio.Lock(),'until':0,'value':None,'invalidated':0}

def invalidate_plan(learner_id,language):
    slot=_plan_slot(learner_id,language)
    slot['until']=0;slot['invalidated']+=1

async def cached_plan(db,learner_id,language):
    # Only call after access/consent checks. Release the read transaction before
    # waiting: duplicate browser tabs must not fill the SQL pool with waiters.
    await db.commit()
    slot=_plan_slot(learner_id,language)
    async with slot['lock']:
        if slot['value'] is None or time.monotonic()>=slot['until']:
            invalidated=slot['invalidated']
            value=await plan(db,learner_id,language)
            await db.commit()
            slot.update(value=value,until=time.monotonic()+5 if invalidated==slot['invalidated'] else 0)
        return copy.deepcopy(slot['value'])

@router.get('/learners/{learner_id}/personal-learning-plan')
async def get_plan(learner_id:uuid.UUID,language:str=Query('en',pattern='^(en|ml|hi)$'),user:User=Depends(get_current_user),db=Depends(get_db)):
    await accessible_learner(db,user,learner_id);await require_practice_consent(db,learner_id)
    return await cached_plan(db,learner_id,language)
