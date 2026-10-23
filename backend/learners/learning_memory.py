"""Saved educational targets and actual audio attempts; never an assessed outcome."""
from sqlalchemy import select
import uuid
from models.speech_workflow import LiveCall
from models.care import AcousticProposal,SpeechRecording,RecordingReview
from learners.review_evidence import current_review_filter

async def learning_memory(db,learner_id,language):
 calls=(await db.execute(select(LiveCall).where(LiveCall.learner_id==learner_id,LiveCall.language==language,LiveCall.mode.in_(['practice','listen_then_say','transfer']),LiveCall.context['active_practice_target']['expected_text'].as_string().is_not(None)).order_by(LiveCall.created_at.desc()).limit(1))).scalars().all()
 target=next((row.context.get('active_practice_target') for row in calls if row.context.get('active_practice_target')),None)
 rows=(await db.execute(select(AcousticProposal,SpeechRecording).join(SpeechRecording,SpeechRecording.id==AcousticProposal.recording_id).where(SpeechRecording.learner_id==learner_id,SpeechRecording.language==language,AcousticProposal.decision!='rejected',AcousticProposal.request['purpose'].as_string()=='maya_coaching').order_by(AcousticProposal.created_at.desc()).limit(20))).all()
 attempts=[]
 for proposal,record in rows:
  if proposal.request.get('purpose')!='maya_coaching':continue
  if proposal.decision=='rejected':continue
  if not record.expected_text:continue
  if target and record.expected_text!=target['expected_text']:continue
  if not target:target={'expected_text':record.expected_text,'word':record.expected_text,'sound':'','source':'saved_audio_practice_target'}
  if any(item['recording_id']==str(record.id) for item in attempts):continue
  attempts.append({'recording_id':str(record.id),'proposal_id':str(proposal.id),'created_at':proposal.created_at.isoformat(),'state':proposal.content.get('state'),'summary':proposal.content.get('summary'),'concerns':proposal.content.get('concerns',[]),'teaching_plan':proposal.content.get('teaching_plan',[]),'source':'unvalidated_audio_practice_hypothesis'})
  if len(attempts)==4:break
 responses=(calls[0].context.get('lesson') or {}).get('cue_responses',[]) if calls else []
 response_ids=[]
 for response in responses:
  try:response_ids.append(uuid.UUID(response.get('recording_id','')))
  except (ValueError,TypeError,AttributeError):pass
 blocked=set()
 if response_ids:
  rejected=(await db.execute(select(AcousticProposal.recording_id).join(SpeechRecording,
   SpeechRecording.id==AcousticProposal.recording_id).where(SpeechRecording.learner_id==learner_id,
   AcousticProposal.recording_id.in_(response_ids),AcousticProposal.decision=='rejected'))).scalars().all()
  contradicted=(await db.execute(select(RecordingReview.recording_id).join(SpeechRecording,
   SpeechRecording.id==RecordingReview.recording_id).where(SpeechRecording.learner_id==learner_id,
   RecordingReview.recording_id.in_(response_ids),RecordingReview.outcome.in_(['difficulty','uncertain']),
   current_review_filter()))).scalars().all()
  blocked={str(identifier) for identifier in [*rejected,*contradicted]}
 helpful=[];seen_cues=set()
 for response in reversed(responses):
  if response.get('result_state')!='no_clear_difference' or response.get('recording_id') in blocked:continue
  for plan in response.get('preceding_cues',[])[:1]:
   key=(plan.get('word','').casefold(),plan.get('practice_tip'))
   if not key[1] or key in seen_cues:continue
   helpful.append({'word':plan.get('word'),'practice_tip':plan['practice_tip'],
    'recording_id':response['recording_id'],'source':'cue_preceding_clear_audio_observation','causal_effectiveness_established':False});seen_cues.add(key)
   if len(helpful)>=3:break
  if len(helpful)>=3:break
 return {'last_target':target,'recent_attempts':attempts,'previous_support':helpful,'assessment':False,'instruction':'Ask if the learner wants to revisit this target. You may offer a previously used cue for the same word as a familiar starting point. Prior AI suggestions and cue associations are not proof of errors, improvement or effectiveness.'}

def learning_opening(language,target):
 phrase=target.get('word') or target['expected_text']
 return {'en':f'Last time we practised {phrase}. Would you like to try it again, or choose a different sound?',
  'hi':f'पिछली बार हमने {phrase} का अभ्यास किया था। क्या फिर से कोशिश करें, या कोई दूसरी ध्वनि चुनें?',
  'ml':f'കഴിഞ്ഞ തവണ നമ്മൾ {phrase} പരിശീലിച്ചിരുന്നു. വീണ്ടും ശ്രമിക്കണോ, അതോ മറ്റൊരു ശബ്ദം പരിശീലിക്കണോ?'}[language]
