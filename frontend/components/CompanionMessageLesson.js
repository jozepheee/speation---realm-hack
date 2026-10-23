import {useEffect,useRef,useState} from 'react';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import MessagePractice from './MessagePractice';
import styles from '../styles/maya-learning.module.css';

export default function CompanionMessageLesson({learner,personalTarget,immersive=false,draftScope='',onHear,onStopSpeech,onBeforeRecord,onBusyChange,onFeedback,onCompare}){
 const [recording,setRecording]=useState(null),[proposal,setProposal]=useState(null),[text,setText]=useState('');
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[capturing,setCapturing]=useState(false),[practising,setPractising]=useState(false),[playing,setPlaying]=useState(false),[played,setPlayed]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),request=useRef(null),proposalRequest=useRef(null);
 useEffect(()=>{request.current=new AbortController();return()=>{generation.current++;request.current?.abort();onStopSpeech?.();};},[learner.id]);
 useEffect(()=>{onBusyChange?.(busy||capturing||practising||playing);return()=>onBusyChange?.(false);},[busy,capturing,practising,playing]);
 async function propose(record){
  const current=generation.current;setBusy(true);setError('');setRecording(record);proposalRequest.current||=crypto.randomUUID();
  try{const value=await portalApi(`/recordings/${record.id}/message-proposals`,{method:'POST',body:{request_id:proposalRequest.current,mode:'recognized_only'},signal:request.current.signal,timeoutMs:20000});
   if(current!==generation.current)return;setProposal(value);setText(value.candidates[0]||record.transcript||'');setEditing(!value.candidates.length);
  }catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 async function speak(value){setPlaying(true);setPlayed(false);try{if(await onHear(value)===false)throw Error('Maya’s audio could not play. Use Hear my message to retry.');setPlayed(true);}catch(err){setError(err.message);}finally{setPlaying(false);}}
 async function confirm(event){event.preventDefault();setBusy(true);setError('');const current=generation.current;
  try{const value=await portalApi(`/translations/${proposal.id}/confirm`,{method:'POST',body:{text:text.trim(),confirms_intended_message:true},signal:request.current.signal,timeoutMs:20000});
   if(current!==generation.current)return;setProposal(value);await speak(value.confirmed_text);
  }catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 async function resume(id){setBusy(true);setError('');try{const value=await portalApi(`/translations/${id}`,{signal:request.current.signal});setProposal(value);setText(value.confirmed_text);}catch(err){setError(err.message);}finally{setBusy(false);}}
 function another(){onStopSpeech?.();setRecording(null);setProposal(null);setText('');setEditing(false);setError('');proposalRequest.current=null;}
 return <section lang={learner.language} translate="no" className={`${styles.panel} ${immersive?styles.messageDock:''}`} aria-label="Your message with Maya"><h2>{learner.age>=16?'Say what matters to you':'Tell Maya something'}</h2><p>{learner.age>=16?'Use a real message from college, work or daily life.':'Tell me something you want to say at school or at home.'}</p>{personalTarget&&<div><p>Try using your practice word: <strong>{personalTarget.word}</strong>.</p>{personalTarget.translation_id&&!proposal&&<button disabled={busy||capturing} onClick={()=>resume(personalTarget.translation_id)}>Use my confirmed daily message</button>}</div>}
 {!recording&&!proposal&&<RecordingStudio draftScope={draftScope} learner={learner} task="conversation" maxDuration={20} quietFinishMs={3000} showSendButton assessFeedback={false} showFeedback={false} beforeRecord={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onBusyChange={setCapturing} onRecorded={propose}/>}
 {recording&&!proposal&&<button disabled={busy} onClick={()=>propose(recording)}>Retry preparing my message</button>}
 {proposal&&!proposal.confirmed_text&&<form onSubmit={confirm}><h3>Did you mean?</h3>{editing?<label>My intended message<textarea required maxLength={1000} value={text} onChange={event=>setText(event.target.value)}/></label>:<blockquote>{text}</blockquote>}<button disabled={busy||!text.trim()}>{busy?'Saving…':"Yes, that’s what I mean"}</button>{!editing&&<button type="button" disabled={busy} onClick={()=>setEditing(true)}>Edit message</button>}</form>}
 {proposal?.confirmed_text&&<><h3>Your message</h3><p>{proposal.confirmed_text}</p><button disabled={busy||practising||playing} onClick={()=>speak(proposal.confirmed_text)}>Hear my message</button>{playing&&<button onClick={()=>{onStopSpeech?.();setPlaying(false);}}>Stop voice</button>}
 <MessagePractice preferredWord={personalTarget?.word} onCompare={onCompare} draftScope={draftScope} learner={learner} translation={proposal} onResume={resume} autoStart={played} autoListen messagePlaying={playing||busy} onBusyChange={setPractising} onStart={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onHear={onHear} onStopSpeech={onStopSpeech} onFeedback={onFeedback}/></>}
 {(recording||proposal)&&<button disabled={busy||capturing||practising||playing} onClick={another}>Start another message</button>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
