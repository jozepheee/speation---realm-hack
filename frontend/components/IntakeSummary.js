import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function IntakeSummary({learner,clinical=false}){
 const {t}=useLocale();const [data,setData]=useState(null),[plan,setPlan]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setBusy(true);setError('');setData(null);setPlan(null);
  portalApi(`/learners/${learner.id}/intake`,{signal:controller.signal}).then(async row=>{
   if(controller.signal.aborted)return;
   if(row?.completed_at){const report=await portalApi(`/intake/${row.id}/report`,{signal:controller.signal});if(!controller.signal.aborted)setData(report);
    if(!clinical){const today=await portalApi(`/learners/${learner.id}/daily-plan`,{method:'POST',signal:controller.signal});if(!controller.signal.aborted)setPlan(today);}
   }else setData(row);
  }).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();
 },[learner.id,clinical]);
 async function review(event){event.preventDefault();const note=new FormData(event.currentTarget).get('note');setBusy(true);setError('');try{await portalApi(`/intake/${data.id}/review`,{method:'POST',body:{note}});setData(await portalApi(`/intake/${data.id}/report`));}catch(err){setError(err.message);}finally{setBusy(false);}}
 async function done(id){setBusy(true);setError('');try{setPlan(await portalApi(`/learners/${learner.id}/daily-plan/complete`,{method:'POST',body:{task_id:id}}));}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <section className={styles.panel}><p className={styles.eyebrow}>{t('A FIRST CONVERSATION')}</p><h2>{t(clinical?'Maya’s introductory report':'Your daily practice with Maya')}</h2>
 {busy&&<p role="status">{t('Loading patient activity…')}</p>}{error&&<p role="alert">{t(error)}</p>}
 {!busy&&!error&&!data?.completed_at&&<><p>{t(clinical?'The learner has not completed their first conversation yet.':learner.age>=16?'Practise mature vocabulary, explain a project and respond to interview and teamwork situations. Pause, skip or return later.':'Start with a few words, a sentence and a conversation. No clinician assignment is needed to begin.')}</p>{!clinical&&<Link className={styles.linkButton} href={`/maya-checkin?learner=${learner.id}`}>{t(data?'Continue first conversation':'Meet Maya for your first conversation')} →</Link>}</>}
 {data?.report&&<><p>{t('Recorded prompts')}: {data.report.recorded_prompts} · {t('Skipped prompts')}: {data.report.skipped_prompts} · {t(data.report.status==='reviewed'?'Clinician reviewed':'Awaiting clinician review')}</p><p>{t('This introductory sample suggests practice areas; it is not a diagnosis or a standardized speech test.')}</p>
 {clinical&&<><h3>{t('Possible practice areas')}</h3>{!data.possible_practice_areas?.length&&<p>{t('No supported sound concern was available. This does not establish that speech is error-free.')}</p>}{data.possible_practice_areas?.map((item,index)=><article className={styles.detail} key={index}><strong>{item.word}</strong><p>{item.observation}</p><p>{item.practice_tip}</p><small>{item.uncertainty}</small></article>)}
 <details><summary>{t('Saved recording evidence')}</summary>{data.report.evidence.map(item=><article className={styles.detail} key={item.recording_id}><strong>{item.expected_text||t('Talk together')}</strong><p>{item.transcript}</p><small>{item.model||t('Audio feedback unavailable')} · {item.recording_id}</small><p>{t('Replay and assess these recordings in Recording reviews.')}</p></article>)}</details>
 <form className={styles.form} onSubmit={review}><label>{t('Clinician review note')}<textarea name="note" required maxLength={2000}/></label><button disabled={busy}>{t('Save report review')}</button></form><p>{t('Author or update treatment goals below to guide the next daily plan. AI suggestions remain separate from your assessment.')}</p></>}
 {!!data.reviews?.length&&<details><summary>{t('Review history')}</summary>{data.reviews.map((item,index)=><p key={index}>{item.created_at} · {item.note}</p>)}</details>}</>}
 {plan&&<><h3>{t('Today’s practice')}</h3><p>{plan.date} · {plan.timezone}</p>{plan.tasks.map(task=><article className={styles.detail} key={task.id}><strong>{task.word||t('A moment of my day')}</strong><p>{task.instruction||t('Listen to Maya and try a short repeat.')}</p><small>{t(task.source==='clinician_authored_goal'?'Clinician-authored goal':task.source==='unvalidated_audio_hypothesis'?'Optional AI practice suggestion':'General communication practice')}</small><div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}><Link className={styles.linkButton} href={learner.age>=16&&task.kind==='daily_conversation'?'/speaking-lab':task.kind==='reviewed_goal'?{pathname:'/practice-hub',query:{learner:learner.id,goal:task.goal_id}}:{pathname:'/companion',query:{learner:learner.id,mode:task.word?'listen_then_say':'daily_moment',...(task.word?{practice:task.word}:{})}}}>{t('Start practice')} →</Link><button disabled={busy||!!task.completed_at} onClick={()=>done(task.id)}>{t(task.completed_at?'Reported complete':'I practised this')}</button></div></article>)}<small>{t('Completion records participation, not pronunciation correctness.')}</small></>}
 </section>;
}
