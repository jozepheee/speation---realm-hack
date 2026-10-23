import {useEffect,useRef,useState} from 'react';
import {privateAudio} from '../lib/portalApi';
const LABELS={no_clear_difference:'No clear difference heard',tentative_observation:'Practice suggested',insufficient_evidence:'Uncertain'};
export default function PracticeEvidenceTimeline({groups=[]}){
 const [preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const version=useRef(0),url=useRef(null),controller=useRef(null);
 useEffect(()=>()=>{version.current++;controller.current?.abort();if(url.current)URL.revokeObjectURL(url.current);},[]);
 async function play(id){const current=++version.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');
  try{const blob=await privateAudio(`/recordings/${id}/audio`,{signal:controller.current.signal});if(current!==version.current)return;if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(blob);setPreview({id,url:url.current});}
  catch(err){if(current===version.current&&err.name!=='AbortError')setError(err.message);}finally{if(current===version.current)setBusy(false);}
 }
 if(!groups.length)return null;
 return <section lang="en" translate="no"><h3>Compare the same practice task</h3><p>These attempts share the target, language, exact wording and assessment model. Word practice and sentence practice are shown separately. AI observations remain provisional.</p>
 {groups.map((group,index)=><details key={index}><summary>{group.word} · {group.phase==='sentence'?'In a sentence':'Word'} · {group.attempts.length} attempts</summary>
 <ol>{group.attempts.map(item=><li key={item.recording_id}><strong>{item.date} · {LABELS[item.state]||'Not assessed'}</strong>
 {item.cue_response?.preceding_cues?.map((cue,n)=><p key={n}>Support before this attempt: {cue.practice_tip}</p>)}
 {item.visual_articulation&&<p>Camera: {Math.round(item.visual_articulation.tracking_fraction*100)}% of sampled frames tracked. Visible movement support only; no pronunciation grade.</p>}
 <button disabled={busy} onClick={()=>play(item.recording_id)}>Replay this attempt</button>
 {preview?.id===item.recording_id&&<audio controls src={preview.url}/>}</li>)}</ol></details>)}
 <p>A result after a cue does not prove that the cue caused improvement.</p>{error&&<p role="alert">{error}</p>}</section>;
}
