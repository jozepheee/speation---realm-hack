import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import {AnswerMeasurements} from './RehearsalReport';
import useSpeechPlayer from '../hooks/useSpeechPlayer';
import RehearsalSupportBar from './RehearsalSupportBar';
import {DEFAULT_REHEARSAL_SUPPORT} from './RehearsalPreferences';
import styles from '../styles/discussion-meeting.module.css';

export default function GroupDiscussionRoom({learner,session,onUpdated,onBusyChange}){
 const [support,setSupport]=useState({...DEFAULT_REHEARSAL_SUPPORT,...session.content.support}),[slow,setSlow]=useState(false),[respondTo,setRespondTo]=useState('asha'),[ending,setEnding]=useState(false),[cancelToken,setCancelToken]=useState(0),[outline,setOutline]=useState(false);
 const {t}=useLocale(),audio=useSpeechPlayer(learner.id,session.language,'',slow?0.8:1);
 const [working,setWorking]=useState(false),[recording,setRecording]=useState(false),[playing,setPlaying]=useState(false),[speaker,setSpeaker]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(true),[panel,setPanel]=useState(''),[caption,setCaption]=useState(null),[elapsed,setElapsed]=useState(0),[ready,setReady]=useState(false),[micActive,setMicActive]=useState(false);
 const queue=useRef(0),played=useRef(new Set()),request=useRef(null),mounted=useRef(true),transcript=useRef(null),dialog=useRef(null),pendingSpeech=useRef([]),ended=useRef(false);
 const room=session.content.discussion,active=session.status==='active',last=session.content.turns.at(-1);
 const people=[...room.participants,{id:'learner',name:t('You'),role:'Participant'}];
 useEffect(()=>setRespondTo(['asha','rohan','neha'][session.position%3]),[session.position]);
 useEffect(()=>{setReady(true);},[]);
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setElapsed(value=>value+1),1000);return()=>clearInterval(timer);},[active]);
 useEffect(()=>{if(!open||!ready)return;const before=document.body.style.overflow;const app=document.getElementById('__next'),wasInert=app?.inert;document.body.style.overflow='hidden';if(app)app.inert=true;dialog.current?.focus();return()=>{document.body.style.overflow=before;if(app)app.inert=wasInert;};},[open,ready]);
 useEffect(()=>{if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight;},[room.messages.length,panel]);
 function pause(){queue.current++;audio.stop();setPlaying(false);setSpeaker('');}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;queue.current++;request.current?.abort();audio.stop();};},[]);
 useEffect(()=>{onBusyChange?.(working||recording||playing);return()=>onBusyChange?.(false);},[working,recording,playing,onBusyChange]);
 useEffect(()=>{
  if(!ready||!open||!active)return;
  const messages=room.messages.filter(item=>item.speaker!=='learner');
  const initial=session.position===0?messages.filter(item=>item.batch==='opening'):messages.filter(item=>item.position===session.position-1).slice(-1);
  for(const item of messages)if(!initial.some(message=>message.id===item.id))played.current.add(item.id);
  const pending=initial.filter(item=>!played.current.has(item.id));if(pending.length)void narrate(pending);
 },[ready,open,session.id]);
 async function narrate(items,rate=slow?0.8:1){
  pause();const current=queue.current;setPlaying(true);
  try{for(let index=0;index<items.length;index++){const item=items[index];
   if(current!==queue.current||!mounted.current)break;
   pendingSpeech.current=items.slice(index);setSpeaker(item.speaker);setCaption(item);const person=people.find(p=>p.id===item.speaker);
   const finished=await audio.speak(item.text,item.speaker,rate);
   const following=items[index+1];if(following)void audio.prefetch(following.text,following.speaker);
   if(finished&&current===queue.current&&support.repeat_questions&&item.speaker==='maya')await audio.speak(item.text,item.speaker,rate);
   if(!finished||current!==queue.current)break;played.current.add(item.id);pendingSpeech.current=items.slice(index+1);
  }}finally{if(current===queue.current&&mounted.current){setPlaying(false);setSpeaker('');}}
 }
 async function recorded(record){
  if(ended.current)return;
  pause();setWorking(true);setError('');request.current=new AbortController();
  try{
   const updated=await portalApi(`/speaking-rehearsals/${session.id}/turns`,{method:'POST',body:{position:session.position,recording_id:record.id,respond_to:respondTo},signal:request.current.signal,timeoutMs:45000});
   if(!mounted.current||ended.current)return;onUpdated(updated);setAttempt(value=>value+1);
   const replies=updated.content.discussion.messages.filter(item=>item.batch===record.id&&item.speaker!=='learner');
   if(replies.length)void narrate(replies);
  }catch(err){if(mounted.current&&!ended.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(mounted.current&&!ended.current)setWorking(false);}
 }
 async function finish(){if(ending)return;ended.current=true;request.current?.abort();setCancelToken(n=>n+1);pause();setEnding(true);setError('');request.current=new AbortController();try{
  const updated=await portalApi(`/speaking-rehearsals/${session.id}/move`,{method:'POST',body:{position:session.position,action:'finish'},signal:request.current.signal});
  if(mounted.current){onUpdated(updated);setOpen(false);setWorking(false);}
 }catch(err){if(mounted.current&&err.name!=='AbortError'){ended.current=false;setError(err.message);}}finally{if(mounted.current)setEnding(false);}}
 async function supportAction(kind){
  pause();if(kind==='rephrase')setOutline(true);
  if(kind==='moment')setCaption({text:'Take your time. Raise your hand or select Take the floor when you are ready.'});
  try{const row=await portalApi(`/speaking-rehearsals/${session.id}/repair`,{method:'POST',body:{phrase:kind}});if(!ended.current)onUpdated(row);}catch(err){if(!ended.current)setError(err.message);}
  if(kind==='repeat'||kind==='slower'){if(kind==='slower')setSlow(true);const item=room.messages.filter(m=>m.speaker===respondTo).at(-1)||room.messages.at(-1);if(item)void narrate([item],kind==='slower'?0.8:1);}
 }
 const unheard=room.messages.filter(item=>item.speaker!=='learner'&&!played.current.has(item.id));
 const positions={maya:'0% 0%',asha:'100% 0%',rohan:'0% 100%',neha:'100% 100%'};
 const clock=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${(elapsed%60).toString().padStart(2,'0')}`;
 function togglePanel(value){setPanel(current=>current===value?'':value);}
 async function updateSupport(next){setSupport(next);try{const row=await portalApi('/speaking-rehearsals/'+session.id+'/support',{method:'PATCH',body:next});if(!ended.current)onUpdated(row);}catch(err){setError(err.message);}}
 function closeView(){pause();setOpen(false);}
 function trap(event){
  if(event.key==='Escape'){if(panel)setPanel('');return;}
  if(event.key!=='Tab')return;
  const targets=dialog.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]');if(!targets?.length)return;
  const first=targets[0],last=targets[targets.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 if(!ready)return null;
 if(!open)return <section className={styles.returnCard}><strong>{t(active?'Discussion in progress':'Discussion complete')}</strong><button onClick={()=>setOpen(true)}>{t('Return to meeting')}</button></section>;
 return createPortal(<section ref={dialog} tabIndex={-1} onKeyDown={trap} className={styles.meeting} role="dialog" aria-modal="true" aria-label={t('Group discussion room')}>
  <header className={styles.topbar}>
   <div className={styles.brand}><span className={styles.brandMark}>S</span><div><strong>{t('Speation meeting')}</strong><span>{t('Maya + 3 AI candidates + you')}</span></div></div>
   <div className={styles.meetingTitle}><h1 title={session.content.goal}>{session.content.goal}</h1><span>{t(active?'Round':'Discussion complete')} {active?`${session.position+1} / 3`:''} · {t({en:'English',hi:'Hindi',ml:'Malayalam'}[session.language])}</span></div>
   <div className={styles.headerActions}><span className={styles.timer}><i/>{clock}</span><button disabled={working||recording} onClick={closeView} aria-label={t('Minimise meeting')} title={t('Minimise meeting')}><MeetingIcon name="minimise"/></button></div>
  </header>
  <div className={`${styles.body} ${panel?styles.withPanel:''}`}>
   <main className={styles.stage}>
    <div className={styles.stageInfo}><span className={styles.simulation}>{t('AI PRACTICE ROOM')}</span><span>{t('Original AI portraits · spoken simulation')}</span><span>{t('5 participants')}</span></div>
    {active&&<><RehearsalSupportBar support={support} onManual={value=>updateSupport({...support,manual_finish:value})} onPause={()=>supportAction('moment')} onRepeat={()=>supportAction('repeat')} onSlow={()=>supportAction('slower')} onOutline={()=>supportAction('rephrase')} disabled={working||recording||ending}/>
     <div className={styles.stageInfo}><label>{t('I want to respond to')} <select value={respondTo} disabled={working||recording||ending} onChange={e=>setRespondTo(e.target.value)}>{room.participants.filter(p=>p.id!=='maya').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={working||recording||ending} onClick={()=>{pause();setCaption({text:`You have the floor. Respond to ${respondTo}, then select Take the floor to record.`});}}>{t('Raise my hand')}</button></div>
     {(outline||support.outline_prompts)&&<p>{t('Refer to their point → state your view → give one reason or example → invite a response.')}</p>}
    </>}
    <div className={styles.gallery}>{people.map(person=>{
     const isYou=person.id==='learner',talking=isYou?micActive:speaker===person.id;
     return <article key={person.id} className={`${styles.tile} ${talking?styles.talking:''} ${isYou?styles.selfTile:''}`} aria-label={person.name}>
      <div className={styles.tileTop}><span>{t(isYou?'You':person.id==='maya'?'Moderator':'AI candidate')}</span><span className={styles.micState} aria-label={t(talking?'Speaking':'Microphone off')}><MeetingIcon name={talking?'wave':'micOff'}/></span></div>
      <div className={styles.portraitArea}>{isYou?<div className={styles.selfAvatar}>{(learner.display_name||t('You')).slice(0,1).toUpperCase()}</div>:<div role="img" aria-label={`${person.name} · ${t('AI-generated portrait')}`} className={styles.portrait} style={{backgroundPosition:positions[person.id]}}/>}<div className={styles.voiceHalo}/></div>
      <div className={styles.tileBottom}><div><strong>{person.name}</strong><small>{t(person.role)}</small></div>{talking?<span className={styles.speakingBars}><i/><i/><i/><i/></span>:<span className={styles.tileStatus}>{t(isYou?'Mic off':'AI')}</span>}</div>
     </article>;
    })}
    <article className={`${styles.tile} ${styles.promptTile}`}><span>{t(active?'YOUR NEXT CONTRIBUTION':'DISCUSSION COMPLETE')}</span><h2 lang={session.language}>{active?session.content.steps[session.position].prompt:t('Your voice belongs in the conversation.')}</h2><p>{t(active?'Respond to a candidate, give a reason, or connect two ideas.':'Review your feedback and take one idea into your next conversation.')}</p>{!active&&<button onClick={closeView}>{t('View my summary')}</button>}</article>
    </div>
    <div className={styles.caption} aria-live="polite"><strong>{working?t('Maya'):playing?people.find(p=>p.id===speaker)?.name:micActive?t('You'):t('Maya')}</strong><p>{working?t('The candidates are considering your contribution…'):micActive?t(support.manual_finish?'Listening. Select Send contribution now when you finish.':'Listening. Pause when you finish; your answer sends automatically.'):playing?caption?.text:active?(caption?.text||t('Take the floor when you are ready. The candidates will pause when you record.')):t('Your discussion is complete. Open Coaching for feedback or view your summary.')}</p></div>
    {audio.loading&&<p role="status" className={styles.audioStatus}>{t('Preparing Maya’s voice…')}</p>}
    {(error||audio.error||last?.feedback_error)&&<div role="alert" className={styles.error}><p>{t(error||audio.error||last.feedback_error)}</p>{audio.autoplayBlocked&&<button disabled={working||recording} onClick={()=>narrate(pendingSpeech.current)}>{t('Enable audio')}</button>}</div>}
   </main>
   {panel&&<aside className={styles.sidepanel} aria-label={t(panel==='transcript'?'Discussion transcript':panel==='feedback'?'Your participation feedback':'Participants')}>
    <header><h2>{t(panel==='transcript'?'Discussion transcript':panel==='feedback'?'Your participation feedback':'Participants')}</h2><button onClick={()=>setPanel('')} aria-label={t('Close panel')}><MeetingIcon name="close"/></button></header>
    {panel==='transcript'&&<div ref={transcript} className={styles.transcript} role="log">{room.messages.map(item=><article className={item.speaker==='learner'?styles.myMessage:styles.message} key={item.id}><strong>{people.find(p=>p.id===item.speaker)?.name}</strong><p lang={session.language}>{item.text}</p></article>)}</div>}
    {panel==='feedback'&&<div className={styles.panelContent}>{last?.feedback?<><AnswerMeasurements turn={last}/><span className={styles.feedbackBadge}>{t('Communication coaching')}</span><h3>{t('One thing that worked')}</h3><p>{last.feedback.strength}</p><h3>{t('One thing to try')}</h3><p>{last.feedback.suggestion}</p><h3>{t('A possible way to explain it')}</h3><p>{last.feedback.example}</p><Link href={{pathname:'/speech-translator',query:{recording:last.recording_id}}} onClick={closeView}>{t('Confirm my message and check sounds')}</Link></>:<p>{t('Coaching appears after your first contribution.')}</p>}<p className={styles.note}>{t('Feedback concerns your ideas and participation. Sound practice is separate.')}</p></div>}
    {panel==='people'&&<div className={styles.panelContent}>{people.map(person=><div key={person.id} className={styles.personRow}><span className={styles.personDot}>{person.name.slice(0,1)}</span><div><strong>{person.name}</strong><small>{t(person.role)}</small><small>{t(person.id==='learner'?'You':'AI simulation')}</small></div></div>)}<p className={styles.note}>{t('Three simulated AI candidates. Maya moderates. You contribute your own views.')}</p></div>}
   </aside>}
  </div>
  <footer className={styles.callbar}>
   <div className={styles.callInfo}><span className={styles.privateDot}/><span>{t('Private practice')}<small>{t('Camera off · audio only when you record')}</small></span></div>
   <div className={styles.controls}>
    <button disabled={working||recording} onClick={()=>playing?pause():narrate(pendingSpeech.current.length?pendingSpeech.current:unheard.length?unheard:room.messages.filter(item=>item.speaker!=='learner').slice(-4))} aria-label={t(playing?'Pause discussion':'Hear the discussion')}><MeetingIcon name={playing?'pause':'speaker'}/><span>{t(playing?'Pause':'Listen')}</span></button>
    {active&&<RecordingStudio key={attempt} meetingMode manualFinish={support.manual_finish} cancelToken={cancelToken} preferredProvider={session.content.recognition_provider} learner={{...learner,language:session.language}} task="conversation" maxDuration={178} quietFinishMs={support.pause_seconds*1000} assessFeedback={false} showFeedback={false} beforeRecord={pause} disabled={working||ending} onBusyChange={setRecording} onRecordingChange={setMicActive} onRecorded={recorded}/>}
    <button aria-pressed={panel==='transcript'} onClick={()=>togglePanel('transcript')}><MeetingIcon name="chat"/><span>{t('Transcript')}</span></button>
    <button aria-pressed={panel==='feedback'} onClick={()=>togglePanel('feedback')}><MeetingIcon name="coach"/><span>{t('Coaching')}</span>{last?.feedback&&<i className={styles.notification}/>}</button>
    <button aria-pressed={panel==='people'} onClick={()=>togglePanel('people')}><MeetingIcon name="people"/><span>{t('People')}</span></button>
   </div>
   <button className={styles.leave} disabled={ending} onClick={active?finish:closeView}><MeetingIcon name="leave"/><span>{t(ending?'Saving report…':active?'End discussion':'View my summary')}</span></button>
  </footer>
 </section>,document.body);
}

export function MeetingIcon({name}){
 const paths={next:'m9 5 7 7-7 7',back:'m15 5-7 7 7 7',notes:'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h3',screen:'M3 4h18v13H3V4Zm9 13v4m-4 0h8',minimise:'M5 12h14',close:'m6 6 12 12M18 6 6 18',micOff:'m3 3 18 18M9 9v3a3 3 0 0 0 5 2M15 9V5a3 3 0 0 0-6 0M5 10v2a7 7 0 0 0 12 5M12 19v3M8 22h8',wave:'M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4',speaker:'M11 5 6 9H3v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',pause:'M8 5v14M16 5v14',chat:'M4 4h16v12H9l-5 4V4Zm4 4h8m-8 4h5',coach:'m12 3 9 5-9 5-9-5 9-5Zm-6 8v6c4 3 8 3 12 0v-6M21 8v8',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-7a4 4 0 0 1 0 8m4 9v-2a4 4 0 0 0-3-4',leave:'M3 14c5-5 13-5 18 0l-3 4-4-2v-3h-4v3l-4 2-3-4Z'};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.chat}/></svg>;
}
