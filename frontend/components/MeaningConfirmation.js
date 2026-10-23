import {useEffect,useState} from 'react';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
export default function MeaningConfirmation({learner,item,onHear,onBeforeRecord,onBusyChange,onResolved}){
 const ml=learner.language==='ml', [started,setStarted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[answered,setAnswered]=useState(null);
 const [capturing,setCapturing]=useState(false);
 useEffect(()=>{onBusyChange?.(busy||capturing);return()=>onBusyChange?.(false);},[busy,capturing,onBusyChange]);
 async function begin(){setBusy(true);setError('');try{
  await portalApi(`/live-calls/${item.call_id}/meaning-proposals/${item.id}/activate`,{method:'POST'});
  if(await onHear(item.question)===false)throw Error(ml?'ശബ്ദം കേൾക്കാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.':'Could not play Maya’s question. Try again.');
  setStarted(true);
 }catch(err){setError(err.message);}finally{setBusy(false);}}
 async function recorded(record){setBusy(true);setError('');try{
  await portalApi(`/live-calls/${item.call_id}/recordings/${record.id}`,{method:'POST',body:{}});
  const result=await portalApi(`/live-calls/${item.call_id}/meaning-proposals/${item.id}/answer`,{method:'POST',body:{response_text:record.transcript||'',confirmation_recording_id:record.id}});
  setAnswered(result.state);setStarted(false);await onResolved?.(result);
 }catch(err){setError(err.message);}finally{setBusy(false);}}
 if(answered)return <p role="status">{answered==='confirmed'?(ml?'നിങ്ങളുടെ സന്ദേശം സൂക്ഷിച്ചു. പഴയ ശബ്ദരേഖ പരിശോധിക്കുന്നു…':'Your meaning is saved. Checking the original recording…'):(ml?'സമ്മതമായി രേഖപ്പെടുത്തിയിട്ടില്ല. മായയോട് വീണ്ടും പറയാം.':'That was not recorded as agreement. You can tell Maya the message again.')}</p>;
 return <section aria-label={ml?'സന്ദേശം ഉറപ്പാക്കാം':'Confirm your message'}><h3>{ml?'നിങ്ങൾ ഉദ്ദേശിച്ചത് ഇതാണോ?':'Is this what you meant?'}</h3><p lang={learner.language}>{item.candidate}</p><p>{ml?'മായ ചോദിച്ചശേഷം “അതെ” അല്ലെങ്കിൽ “അല്ല” എന്ന് പറയൂ.':'After Maya asks, say “yes” or “no.”'}</p>
 {!started&&<button disabled={busy} onClick={begin}>{ml?'മായയുടെ ചോദ്യം കേൾക്കാം':'Hear Maya’s question'}</button>}
 {started&&<RecordingStudio key={item.id} learner={learner} task="conversation" maxDuration={8} quietFinishMs={1500} assessFeedback={false} showFeedback={false} showSendButton beforeRecord={onBeforeRecord} onBusyChange={setCapturing} onRecorded={recorded}/>}
 {error&&<p role="alert">{error}</p>}</section>;
}
