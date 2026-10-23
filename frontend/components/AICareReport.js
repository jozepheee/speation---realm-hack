import {useEffect,useRef,useState} from 'react';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/aiReport.module.css';
import PracticeEvidenceTimeline from './PracticeEvidenceTimeline';
const outcomes=[['no_clear_difference','No clear difference heard','#2f775a'],['tentative_observation','Suggested practice','#d29a39'],['insufficient_evidence','Could not assess clearly','#826fa5'],['not_assessed','Not checked yet','#d4dce3']];
export default function AICareReport({learner,clinical=false}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const request=useRef(null),version=useRef(0);
 async function load(generate=false){
  const current=++version.current;request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setError('');
  try{
   let result=await portalApi(`/learners/${learner.id}/ai-care-report`,{signal:controller.signal});
   if(current!==version.current)return;setData(result);
   if(generate&&result.stale&&(result.metrics.recordings||result.metrics.learning_sessions)&&learner.consent?.cloud_processing_allowed){
    result=await portalApi(`/learners/${learner.id}/ai-care-report`,{method:'POST',signal:controller.signal,timeoutMs:55000});
    if(current===version.current)setData(result);
   }
  }catch(err){if(current===version.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(current===version.current)setBusy(false);}
 }
 useEffect(()=>{setData(null);setNote('');void load(!clinical);return()=>{version.current++;request.current?.abort();};},[learner.id]);
 async function decide(status){
  setBusy(true);setError('');const current=version.current;
  try{const report=await portalApi(`/learners/${learner.id}/ai-care-report/${data.report.id}/review`,{method:'PUT',body:{status,note},signal:request.current?.signal});if(current===version.current)setData({...data,report});}
  catch(err){if(current===version.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(current===version.current)setBusy(false);}
 }
 const metrics=data?.metrics,report=data?.report;
 const total=metrics?.recordings||0;let angle=0;const slices=outcomes.map(([key,label,color])=>{const start=angle;angle+=(metrics?.ai_outcomes?.[key]||0)/Math.max(total,1)*360;return `${color} ${start}deg ${angle}deg`;});
 return <section translate="no" lang="en" className={styles.report} aria-label="AI progress report">
  <header><div><p className={styles.eyebrow}>PRACTICE INSIGHTS · CLINICIAN IN THE LOOP</p><h2>Your progress, explained.</h2><p>What went well, what needs support, and what to practise next.</p></div><button disabled={busy} onClick={()=>load(true)}>{busy?'Reviewing practice…':'Update AI report'}</button></header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {!clinical&&!learner.consent?.cloud_processing_allowed&&<p>Enable cloud processing in learner settings to generate an AI report. Activity charts work without it.</p>}
  {busy&&<p role="status">{report?'Updating your report. The last report remains visible.':'Preparing an evidence-linked report for your family and clinician…'}</p>}
  {metrics&&<>
   {!!metrics.visible_movement_evidence?.length&&<details><summary>Camera movement evidence · {metrics.visible_movement_evidence.length} attempts</summary><p>Visible lip movement supports teaching. It does not establish whether a sound was correct.</p>{metrics.visible_movement_evidence.slice(0,12).map(item=><p key={item.recording_id}><strong>{item.expected_text||'Own message'}</strong> · {Math.round(item.summary.tracking_fraction*100)}% tracked frames · {item.summary.valid_frames?`Opening range ${item.summary.opening_min?.toFixed(2)}–${item.summary.opening_max?.toFixed(2)}`:'No usable tracking; audio considered separately.'}</p>)}</details>}
   <div className={styles.metrics}>{[[total,'recorded attempts'],[metrics.practice_minutes,'minutes of practice'],[metrics.practice_days,'practice days'],[Object.values(metrics.human_outcomes||{}).reduce((a,b)=>a+b,0),'clinician-reviewed observations']].map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
   {!!metrics.personal_practice_targets?.length&&<article><h3>Personal practice targets</h3><p>{metrics.confirmed_daily_messages||0} daily messages have saved meaning confirmations.</p><ul>{metrics.personal_practice_targets.map(item=><li key={item.word}><strong>{item.word}</strong> · {item.source==='assigned_clinician_goal'?'therapist goal':`${item.observation_count||item.recording_ids?.length||1} audio observation(s)`}{item.requires_confirmation?' · intended word needs confirmation':''}</li>)}</ul><p>These targets guide Maya’s stories, listening, demonstrations and message practice. Observations remain separate from clinician-reviewed findings.</p></article>}
   <div className={styles.charts}>
    <figure><figcaption>Practice feedback</figcaption>{total?<div className={styles.pie} role="img" aria-label={outcomes.map(([key,label])=>`${label}: ${metrics.ai_outcomes[key]||0}`).join('; ')} style={{background:`conic-gradient(${slices.join(',')})`}}><span>{total}<small>attempts</small></span></div>:<p>No attempts yet.</p>}<ul className={styles.legend}>{outcomes.map(([key,label,color])=><li key={key}><i style={{background:color}}/>{label}<strong>{metrics.ai_outcomes[key]||0}</strong></li>)}</ul><p>AI practice observations are provisional. Unclear attempts are not counted as wrong.</p></figure>
    <figure><figcaption>Practice over time</figcaption><div className={styles.bars}>{metrics.timeline.slice(-14).map(day=><div key={day.date}><span>{day.recordings}</span><div style={{height:`${Math.max(4,day.recordings/Math.max(1,...metrics.timeline.map(item=>item.recordings))*125)}px`}}/><small>{day.date.slice(5)}</small></div>)}</div><p>Recorded attempts per day. Activity counts show participation, not speech accuracy.</p></figure>
   </div><p>{metrics.truncated?'Showing a limited snapshot, up to 100 recordings and 100 learning activities.':'Charts cover the available snapshot, up to 100 recordings and 100 learning activities.'}</p>
   {!!metrics.learning_sessions&&<article><h3>Learning activities</h3><p>{metrics.completed_learning_sessions} of {metrics.learning_sessions} saved activities completed. This measures participation.</p>{metrics.listening_choices.total>0&&<p>Listening choices: {metrics.listening_choices.correct} matched out of {metrics.listening_choices.total}. This is not pronunciation accuracy.</p>}<ul>{metrics.learning_history.map(item=><li key={item.id}>{item.date} · {item.kind==='story'?'Story adventure':item.kind==='model'?'Watch & try together':'Listen & choose'} · {item.status}
 {item.kind==='listening'&&item.support_tracking_available&&<div><p>{item.independent_listening_correct} choices matched without help · {item.supported_choices} choices used support · {item.replays} plays</p><meter min="0" max={Math.max(1,item.listening_choices_total)} value={item.independent_listening_correct} aria-label="Listening choices matched without extra help"/><small>Listening choices only, not pronunciation accuracy.</small></div>}
 {item.kind==='model'&&<p>{item.model_steps?.filter(step=>step.action==='model_watch').length||0} model viewings · {item.model_steps?.filter(step=>step.action==='model_together').length||0} speaking-together steps · {item.recording_ids?.length||0} independent recordings</p>}
 {clinical&&!!item.recording_ids?.length&&<details><summary>Linked practice recordings</summary>{item.recording_ids.map(id=><p key={id}>{id}</p>)}</details>}</li>)}</ul></article>}
  </>}
  <PracticeEvidenceTimeline key={learner.id} groups={metrics?.comparable_practice||[]}/>
  {report?<>
   <div className={styles.status}><strong>{report.status==='approved'?'Reviewed by your clinician':report.status==='needs_revision'?'Clinician requested changes':'AI draft · awaiting clinician review'}</strong><span>{report.model} · {new Date(report.created_at).toLocaleString()}</span></div>
   <p>{report.content.summary}</p>
   {data.stale&&<p>New practice is available. Update the report to include it.</p>}
   <div className={styles.findings}>{[['strengths','What went well'],['needs_support','Where support may help'],['next_steps','Try next']].map(([key,title])=><article key={key}><h3>{title}</h3>{report.content[key].length?<ul>{report.content[key].map((finding,index)=><li key={index}>{finding.text}<details><summary>Evidence</summary>{finding.evidence_ids.map((id,number)=>{const evidence=report.metrics?.evidence_index?.[id];return <p key={id}>{evidence?`${evidence.date} · ${{recorded_activity:'Recorded practice',unvalidated_ai_practice_observation:'AI practice observation',clinician_review:'Clinician review'}[evidence.kind]||'Practice evidence'}`:`Supporting practice observation ${number+1}`}</p>;})}</details></li>)}</ul>:<p>Not enough evidence yet.</p>}</article>)}</div>
   <details><summary>Questions for the clinician and report limits</summary><ul>{[...report.content.clinician_questions,...report.content.limitations].map((item,index)=><li key={index}>{item}</li>)}</ul></details>
   {report.review_note&&<blockquote><strong>Clinician note</strong><p>{report.review_note}</p></blockquote>}
   {clinical&&report.status==='awaiting_clinician'&&<div className={styles.review}><label>Your review note<textarea maxLength={2000} value={note} onChange={event=>setNote(event.target.value)} disabled={busy}/></label><button disabled={busy||!note.trim()} onClick={()=>decide('approved')}>Approve report</button><button disabled={busy||!note.trim()} onClick={()=>decide('needs_revision')}>Request changes</button><p>Approving the summary does not change individual recording assessments.</p></div>}
  </>:!busy&&<p>Your AI report will appear after practice is reviewed. Charts remain available independently.</p>}
  {data&&<p className={styles.delivery}>{data.delivery.state==='available_in_assigned_clinician_queue'?'Saved reports are available in your assigned clinician’s report queue.':'No clinician is assigned yet. Your family can view the report; it has not been delivered to a clinician.'}</p>}
 </section>;
}
