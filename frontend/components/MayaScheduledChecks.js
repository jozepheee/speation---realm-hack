import {useEffect,useState} from 'react';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';

// Scheduled checks are unaided fresh samples, not another modelled repetition.
export default function MayaScheduledChecks({learner,goals=[],onBeforeRecord,onStopSpeech,onBusyChange,onActiveChange}){
 const [missions,setMissions]=useState([]),[selected,setSelected]=useState(null),[record,setRecord]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();portalApi(`/learners/${learner.id}/missions`,{signal:abort.signal}).then(setMissions).catch(()=>{});return()=>abort.abort();},[learner.id]);
 useEffect(()=>{onActiveChange?.(!!selected);return()=>onActiveChange?.(false);},[selected]);
 const due=missions.filter(item=>!item.completed_at&&['retention','transfer'].includes(item.kind)&&(!item.due_at||new Date(item.due_at)<=new Date()));
 const mission=due.find(item=>item.id===selected),goal=goals.find(item=>item.id===mission?.goal_id&&item.active!==false);
 async function finish(){
  setBusy(true);onBusyChange?.(true);setError('');
  try{await portalApi(`/missions/${mission.id}/report`,{method:'POST',body:{recording_id:record.id,report:mission.kind==='retention'?'Fresh word attempt recorded without a model.':'Fresh sentence or everyday message recorded in a new context.'}});
   setMissions(rows=>rows.map(item=>item.id===mission.id?{...item,completed_at:new Date().toISOString()}:item));setSelected(null);setRecord(null);
  }catch(err){setError(`Your recording is saved. Retry linking this check: ${err.message}`);}finally{setBusy(false);onBusyChange?.(false);}
 }
 if(!due.length)return null;
 return <section lang="en" translate="no" aria-label="Your scheduled practice checks"><h3>Ready to try it in your own words?</h3><p>Your therapist has scheduled {due.length} follow-up {due.length===1?'check':'checks'}. These use a fresh attempt before hearing an example.</p>
 {!mission?due.map(item=><button key={item.id} onClick={()=>{onStopSpeech?.();setSelected(item.id);setRecord(null);setError('');}}>{item.title}</button>):<><h4>{mission.title}</h4><p>{mission.instruction}</p>
 {goal?<><p>{mission.kind==='retention'?`Try “${goal.practice_word}” without listening first.`:'Use your target in a new sentence or a real-life message.'}</p>
 <RecordingStudio key={mission.id} learner={{...learner,language:goal.language}} task={mission.kind==='retention'?'word':'conversation'} expectedText={mission.kind==='retention'?goal.practice_word:''} showSendButton assessFeedback={false} beforeRecord={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onBusyChange={onBusyChange} onRecorded={setRecord}/>
 <button disabled={!record||busy} onClick={finish}>{busy?'Saving check…':'Save my check'}</button></>:<p>This goal is no longer available. Your therapist can update it.</p>}
 <button disabled={busy} onClick={()=>{setSelected(null);setRecord(null);onBusyChange?.(false);}}>Return to my lesson</button></>}
 {error&&<p role="alert">{error}</p>}</section>;
}
