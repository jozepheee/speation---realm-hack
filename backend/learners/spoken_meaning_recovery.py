"""Reconcile actual provider clarification + retained affirmative audio after a call.

No inferred agreement: both original and answer must uniquely match saved turns.
"""
import re,uuid
from difflib import SequenceMatcher
from datetime import datetime,timezone
from sqlalchemy import select
from models.care import SpeechRecording
from models.speech_workflow import CallRecording,MessageTranslation
from learners.conversation_intent import affirmative

def normalized(text):
    words=re.findall(r'[\w\u0d00-\u0d7f]+',str(text).casefold())
    return ' '.join(word for word in words if word not in {'uh','um','umm','uhh'})

def candidate_from_question(text,language):
    text=re.sub(r'^\[[^\]]+\]\s*','',text).strip()
    if not text.endswith(('?','？')):return None
    if language=='en':
        match=re.fullmatch(r'(?:do|did) you mean\s*[,：:]?\s*[“"\']?(.+?)[”"\']?[?？]',text,re.I)
        if not match:return None
        value=match[1].strip(' “”."\'')
        # Convert the agent's possessive address back to the learner's voice.
        value=re.sub(r'\byour\b','my',value,flags=re.I)
        return value[:1].upper()+value[1:]+'.' if value else None
    if language=='ml':
        match=re.fullmatch(r'(?:നിങ്ങൾ പറഞ്ഞത്\s*)?[“"\']?(.+?)[”"\']?\s*എന്നാണോ(?: പറഞ്ഞത്)?[?？]',text)
        return match[1].strip(' “”"\'') if match else None
    return None

def assessment_reference(original,candidate,language):
    # A conversational paraphrase ("in my college" -> "at my college")
    # establishes meaning, not a mispronounced preposition. Preserve such words
    # from the original turn while assessing its confirmed content words.
    if language!='en':return candidate
    heard=normalized(original).split();wanted=normalized(candidate).split()
    prepositions={'in','at','on','by','to','from','with','near','inside','outside'}
    for tag,a,b,c,d in SequenceMatcher(a=heard,b=wanted,autojunk=False).get_opcodes():
        if tag=='replace' and b-a==d-c:
            for offset in range(b-a):
                if heard[a+offset] in prepositions and wanted[c+offset] in prepositions:wanted[c+offset]=heard[a+offset]
    return ' '.join(wanted)

def confirmations(turns,language):
    found=[]
    for index in range(1,len(turns)-1):
        before,question,answer=turns[index-1:index+2]
        if [before.get('role'),question.get('role'),answer.get('role')]!=['user','agent','user']:continue
        if any(turn.get('source')!='elevenlabs_conversation_api' for turn in [before,question,answer]):continue
        times=[turn.get('time_in_call_seconds') for turn in [before,question,answer]]
        if any(not isinstance(t,(int,float)) for t in times) or not times[0]<times[1]<times[2]:continue
        candidate=candidate_from_question(question.get('text',''),language)
        if not candidate or not affirmative(answer.get('text','')):continue
        found.append({'original':before['text'],'question':question['text'],'answer':answer['text'],'candidate':candidate})
    return found

async def reconcile(db,call):
    if call.mode not in ['conversation','daily_moment']:return []
    records=(await db.execute(select(SpeechRecording).join(CallRecording,CallRecording.recording_id==SpeechRecording.id)
        .where(CallRecording.call_id==call.id,SpeechRecording.learner_id==call.learner_id,SpeechRecording.language==call.language)
        .order_by(SpeechRecording.created_at))).scalars().all()
    matched=[]
    for event in confirmations(call.transcript,call.language):
        def matches(text):return [record for record in records if record.storage_key and normalized((record.quality.get('daily_observation') or {}).get('transcript_hint',''))==normalized(text)]
        originals=matches(event['original']);responses=matches(event['answer'])
        if len(originals)!=1 or len(responses)!=1:continue
        original,response=originals[0],responses[0]
        if original.id==response.id or original.created_at>=response.created_at or original.quality.get('confirmed_meaning'):continue
        if response.quality.get('meaning_confirmation_response'):continue
        item=(await db.execute(select(MessageTranslation).where(MessageTranslation.recording_id==original.id,
            MessageTranslation.learner_id==call.learner_id,MessageTranslation.confirmed_at.is_(None))
            .order_by(MessageTranslation.created_at.desc()).limit(1))).scalar_one_or_none()
        if not item:
            item=MessageTranslation(learner_id=call.learner_id,recording_id=original.id,request_id=uuid.uuid5(original.id,'provider-spoken-confirmation-v1'),
                proposed_by=call.started_by,candidates=[event['candidate']],provenance={})
            db.add(item);await db.flush()
        previous=list(item.candidates)
        item.candidates=[event['candidate']];item.confirmed_text=event['candidate'];item.confirmed_by=call.started_by;item.confirmed_at=datetime.now(timezone.utc)
        item.provenance={**item.provenance,'state':'confirmed','language':call.language,'call_id':str(call.id),
            'confirmation_source':'retained_spoken_response_with_matching_provider_transcript',
            'confirmation_question':event['question'],'confirmation_response':event['answer'],
            'confirmation_recording_id':str(response.id),'previous_unconfirmed_candidates':previous,
            'recognition_is_not_phonetic_evidence':True,'recovery_version':'provider-question-v1'}
        response.quality={**response.quality,'meaning_confirmation_response':str(item.id)}
        reference=assessment_reference(event['original'],item.confirmed_text,call.language)
        item.provenance={**item.provenance,'assessment_reference':reference,'paraphrase_is_not_a_sound_error':True}
        original.quality={**original.quality,'confirmed_meaning':{'translation_id':str(item.id),'text':item.confirmed_text,'confirmation_recording_id':str(response.id),'source':'verified_retained_spoken_confirmation'},
            'daily_observation':{**original.quality.get('daily_observation',{}),'state':'queued','claim':None,'call_id':str(call.id),'translation_id':str(item.id),'confirmed_text':reference,'intent_confirmed':True}}
        matched.append(str(original.id))
    return matched
