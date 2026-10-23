"""Bounded, learner-scoped retrieval from saved chats and provider call transcripts."""
from sqlalchemy import select, or_
from sqlalchemy.orm import load_only
from models.experience import CompanionTurn
from models.speech_workflow import LiveCall

LEARNING = {'practice', 'listen_then_say', 'transfer'}
def surface(mode): return 'learn' if mode in LEARNING else 'daily'

async def recall(db, learner_id, mode):
    bucket = surface(mode)
    turns = (await db.execute(select(CompanionTurn).where(CompanionTurn.learner_id==learner_id)
        .where(CompanionTurn.mode.in_(LEARNING) if bucket=='learn' else CompanionTurn.mode.not_in(LEARNING))
        .order_by(CompanionTurn.created_at.desc()).limit(30))).scalars().all()
    calls = (await db.execute(select(LiveCall).options(load_only(LiveCall.id,LiveCall.mode,LiveCall.transcript,LiveCall.created_at,LiveCall.language,LiveCall.status)).where(LiveCall.learner_id==learner_id)
        .where(LiveCall.mode.in_(LEARNING) if bucket=='learn' else LiveCall.mode.not_in(LEARNING))
        .where(or_(LiveCall.transcript[0]['role'].as_string().is_not(None),LiveCall.status.in_(['finalizing','connected','prepared'])))
        .order_by(LiveCall.created_at.desc()).limit(10))).scalars().all()
    entries=[]
    for row in turns:
        if surface(row.mode)!=bucket: continue
        entries.append({'source':'saved_typed_conversation','source_id':str(row.id),'date':row.created_at.isoformat(),
            'language':row.language,'turns':[{'role':'user','text':row.user_text[:1000]},{'role':'agent','text':row.reply[:1500]}]})
    for row in calls:
        if surface(row.mode)!=bucket or not row.transcript: continue
        entries.append({'source':'saved_provider_call_transcript','source_id':str(row.id),'date':row.created_at.isoformat(),
            'language':row.language,'turns':[{'role':item['role'],'text':item.get('text','')[:1000]} for item in row.transcript[-10:] if item.get('role') in ['user','agent']]})
    entries.sort(key=lambda item:item['date'])
    return {'surface':bucket,'entries':entries[-8:],'scope':'recent_saved_conversations_not_clinical_evidence',
        'pending_calls_not_recalled':any(surface(row.mode)==bucket and not row.transcript and row.status in ['finalizing','connected','prepared'] for row in calls)}
