import {useEffect,useState} from 'react';
import Link from 'next/link';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';

export default function PronunciationTargets({learner,onRecording}){
 const [language,setLanguage]=useState('all'),[plans,setPlans]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let timer;
  setBusy(true);setError('');setPlans([]);
  const languages=language==='all'?['en','ml']:[language];
  Promise.allSettled(languages.map(value=>portalApi(`/learners/${learner.id}/personal-learning-plan?language=${value}`,{signal:controller.signal})))
   .then(results=>{
    if(controller.signal.aborted)return;
    const loaded=results.filter(item=>item.status==='fulfilled').map(item=>item.value);setPlans(loaded);
    const failed=results.find(item=>item.status==='rejected');if(failed)setError(failed.reason.message);
    if(loaded.some(plan=>plan.pending_observations))timer=setTimeout(()=>setRevision(value=>value+1),10000);
   }).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return()=>{controller.abort();clearTimeout(timer);};
 },[learner.id,language,revision]);
 const targets=plans.flatMap(plan=>plan.targets.filter(item=>item.recording_ids?.length&&!item.requires_confirmation).map(item=>({...item,language:plan.language})));
 return <section className={styles.panel} translate="no" aria-label="Words needing pronunciation practice">
  <h2>Words to practise</h2><p>Sound differences found in your recordings. These same words guide Learn with Maya.</p>
  <label>Speech language <select value={language} disabled={busy} onChange={event=>setLanguage(event.target.value)}><option value="all">English and Malayalam</option><option value="en">English</option><option value="ml">മലയാളം</option></select></label>{' '}
  <button disabled={busy} onClick={()=>setRevision(value=>value+1)}>{busy?'Loading words…':'Refresh words'}</button>
  {error&&<p role="alert">{error}</p>}
  {!busy&&!targets.length&&!error&&<p>No confirmed-message sound differences are ready for practice yet. Unclear audio is not counted as an error.</p>}
  {targets.length>0&&<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',borderCollapse:'collapse'}}><thead><tr><th>Intended word</th><th>Sound difference</th><th>Evidence</th><th>Review</th></tr></thead><tbody>{targets.map(item=>{
   const difference=item.character_differences?.find(change=>change.word===item.word);
   const contrast=difference?`${difference.expected_character} → ${difference.observed_character}`:item.produced_phone?`${item.sound} → ${item.produced_phone}`:`Check /${item.sound}/`;
   return <tr key={item.language+':'+item.word}><td style={{padding:'16px 8px'}} lang={item.language}><strong>{item.word}</strong><small style={{display:'block'}}>{item.language==='ml'?'മലയാളം':'English'}</small></td><td>{contrast}</td><td>{item.observation_count||item.recording_ids?.length||1} recording(s){onRecording&&item.recording_ids?.[0]&&<> · <button onClick={()=>onRecording(item.recording_ids[0])}>Review recording</button></>}</td><td>{item.reviewed_recording_ids?.length?'Clinician-reviewed difficulty':'AI observation · awaiting clinician review'}</td></tr>;
  })}</tbody></table></div>}
  {plans.some(plan=>plan.pending_observations>0)&&<p role="status">Recent recordings are still being checked. This list will refresh.</p>}
  {plans.some(plan=>plan.meaning_confirmations?.length>0)&&<p>Some messages still need meaning confirmation in Maya before they can become practice targets.</p>}
  <p>These observations are suggestions, not diagnoses. Clinicians can review and correct them.</p><Link href="/companion">Practise with Maya →</Link>
 </section>;
}
