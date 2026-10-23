import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {useLocale} from '../context/LocaleContext';
import {portalApi,privateAudio} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import {AnswerMeasurements} from './RehearsalReport';
import useSpeechPlayer from '../hooks/useSpeechPlayer';
import RehearsalSupportBar from './RehearsalSupportBar';
import {DEFAULT_REHEARSAL_SUPPORT} from './RehearsalPreferences';
import {MeetingIcon as Icon} from './GroupDiscussionRoom';
import styles from '../styles/discussion-meeting.module.css';
const COMMANDS={
 en:{'next slide':'next','next question':'next','previous slide':'back','go back':'back','start q&a':'qa','start q and a':'qa','questions and answers':'qa','finish presentation':'finish','finish interview':'finish','finish rehearsal':'finish'},
 hi:{'अगली स्लाइड':'next','अगला सवाल':'next','पिछली स्लाइड':'back','पीछे जाओ':'back','सवाल शुरू करें':'qa','प्रस्तुति समाप्त':'finish','इंटरव्यू समाप्त':'finish'},
 ml:{'അടുത്ത സ്ലൈഡ്':'next','അടുത്ത ചോദ്യം':'next','മുൻപത്തെ സ്ലൈഡ്':'back','തിരികെ പോകൂ':'back','ചോദ്യങ്ങൾ തുടങ്ങൂ':'qa','അവതരണം അവസാനിപ്പിക്കൂ':'finish','അഭിമുഖം അവസാനിപ്പിക്കൂ':'finish'}
};
export default function MayaRehearsalMeeting({learner,session,onUpdated,onBusyChange}){
 const [support,setSupport]=useState({...DEFAULT_REHEARSAL_SUPPORT,...session.content.support}),[slow,setSlow]=useState(false);
 const {t}=useLocale(),audio=useSpeechPlayer(learner.id,session.language,'',slow?0.8:1);
 const [open,setOpen]=useState(true),[ready,setReady]=useState(false),[panel,setPanel]=useState(''),[working,setWorking]=useState(false),[recording,setRecording]=useState(false),[micActive,setMicActive]=useState(false),[playing,setPlaying]=useState(false),[speaker,setSpeaker]=useState(''),[caption,setCaption]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[cue,setCue]=useState(''),[preview,setPreview]=useState(''),[previewFailed,setPreviewFailed]=useState(false),[elapsed,setElapsed]=useState(0);
 const [listenToken,setListenToken]=useState(0),[cancelToken,setCancelToken]=useState(0),[automaticMic,setAutomaticMic]=useState(true),[extraTime,setExtraTime]=useState(false),[ending,setEnding]=useState(false);
 const ended=useRef(false),autoMicWanted=useRef(true),latestSession=useRef(session);latestSession.current=session;
 const request=useRef(null),generation=useRef(0),mounted=useRef(true),dialog=useRef(null),transcript=useRef(null),played=useRef(new Set()),pendingSpeech=useRef([]);
 const meeting=session.content.meeting,isPresentation=session.scenario==='presentation',active=session.status==='active',step=session.content.steps[session.position],last=session.content.turns.at(-1);
 const people=[...meeting.participants,{id:'learner',name:t('You'),role:isPresentation?'Presenter':'Candidate'}];
 const material=meeting.material,slideNumber=step.kind==='slide'?step.section:material?.sections.length,slide=material?.sections[slideNumber-1];
 useEffect(()=>{mounted.current=true;setReady(true);return()=>{mounted.current=false;generation.current++;request.current?.abort();audio.stop();};},[]);
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setElapsed(value=>value+1),1000);return()=>clearInterval(timer);},[active]);
 useEffect(()=>{if(!ready||!open)return;const prior=document.body.style.overflow,app=document.getElementById('__next'),inert=app?.inert,focus=document.activeElement;document.body.style.overflow='hidden';if(app)app.inert=true;dialog.current?.focus();return()=>{document.body.style.overflow=prior;if(app)app.inert=inert;if(focus?.isConnected)focus.focus();};},[open,ready]);
 useEffect(()=>{onBusyChange?.(working||recording||playing);return()=>onBusyChange?.(false);},[working,recording,playing,onBusyChange]);
 useEffect(()=>{
  if(!ready||!open||!active)return;
  const messages=meeting.messages.filter(message=>message.speaker!=='learner');
  const initial=session.position===0?messages.slice(0,1):messages.filter(message=>message.position===session.position).slice(-1);
  if(!initial.length)initial.push({id:`resume:${session.position}`,speaker:step.speaker||'maya',text:step.prompt});
  for(const message of messages)if(!initial.some(item=>item.id===message.id))played.current.add(message.id);
  const pending=initial.filter(message=>!played.current.has(message.id));if(pending.length)void narrate(pending,session.scenario==='interview'||step.kind==='question');
 },[ready,open,session.id]);
 useEffect(()=>{setCue(step.cue||'');},[session.position]);
 useEffect(()=>{if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight;},[meeting.messages.length,panel]);
 useEffect(()=>{
  setPreview('');setPreviewFailed(false);if(!isPresentation||!material?.has_preview)return;
  const controller=new AbortController();let url;
  privateAudio(`/speaking-materials/${material.id}/pages/${slideNumber}`,{signal:controller.signal}).then(blob=>{if(controller.signal.aborted)return;url=URL.createObjectURL(blob);setPreview(url);}).catch(err=>{if(err.name!=='AbortError')setPreviewFailed(true);});
  return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
 },[material?.id,slideNumber,isPresentation]);
 function pause(){generation.current++;audio.stop();setPlaying(false);setSpeaker('');}
 async function narrate(messages,listenAfter=false,rate=slow?0.8:1){pause();const current=generation.current;let completed=false;setPlaying(true);try{
  for(let index=0;index<messages.length;index++){const message=messages[index];if(!mounted.current||generation.current!==current)break;pendingSpeech.current=messages.slice(index);setSpeaker(message.speaker);setCaption(message.text);
   const success=await audio.speak(message.text,message.speaker||'maya',rate);
   const following=messages[index+1];if(following)void audio.prefetch(following.text,following.speaker||'maya');
   if(!success||generation.current!==current)break;played.current.add(message.id);pendingSpeech.current=messages.slice(index+1);if(index===messages.length-1)completed=true;
   if(support.repeat_questions&&listenAfter){const repeated=await audio.speak(message.text,message.speaker||'maya',rate);if(!repeated||generation.current!==current){completed=false;break;}}
  }
 }finally{if(mounted.current&&generation.current===current){setPlaying(false);setSpeaker('');
  if(completed&&listenAfter&&autoMicWanted.current&&!ended.current&&latestSession.current.status==='active'){
   setListenToken(value=>value+1);
   const row=latestSession.current,next=row.content.steps[row.position+1];
   if(next?.kind==='question')void audio.prefetch(next.prompt,next.speaker||'maya');
  }
 }}}
 function updated(row){
  if(!mounted.current||ended.current)return;onUpdated(row);setAttempt(value=>value+1);
  const known=new Set(meeting.messages.map(message=>message.id)),fresh=row.content.meeting.messages.filter(message=>message.speaker!=='learner'&&!known.has(message.id));
  if(fresh.length)void narrate(fresh,row.status==='active'&&(row.scenario==='interview'||row.content.steps[row.position].kind==='question'));
 }
 async function finishMeeting(){
  if(ending)return;ended.current=true;request.current?.abort();autoMicWanted.current=false;setAutomaticMic(false);setCancelToken(value=>value+1);pause();setEnding(true);setError('');
  request.current=new AbortController();try{
   const row=await portalApi(`/speaking-rehearsals/${session.id}/move`,{method:'POST',body:{position:latestSession.current.position,action:'finish'},signal:request.current.signal});
   if(mounted.current){onUpdated(row);setOpen(false);setWorking(false);}
  }catch(err){if(mounted.current&&err.name!=='AbortError'){ended.current=false;setError(err.message);}}finally{if(mounted.current)setEnding(false);}
 }
 async function move(action){if(action==='finish'){await finishMeeting();return;}pause();setWorking(true);setError('');request.current=new AbortController();try{
  const row=await portalApi(`/speaking-rehearsals/${session.id}/move`,{method:'POST',body:{position:session.position,action},signal:request.current.signal});updated(row);if(action==='finish'&&mounted.current)setOpen(false);
 }catch(err){if(mounted.current&&err.name!=='AbortError')setError(err.message);}finally{if(mounted.current)setWorking(false);}}
 async function recorded(record){
  if(ended.current)return;
  const words=(record.transcript||'').trim().toLocaleLowerCase().replace(/[.!?।]+$/,'');const command=COMMANDS[session.language]?.[words];
  if(command){await move(command);return;}
  pause();setWorking(true);setError('');request.current=new AbortController();try{
   const row=await portalApi(`/speaking-rehearsals/${session.id}/turns`,{method:'POST',body:{position:session.position,recording_id:record.id},signal:request.current.signal,timeoutMs:45000});updated(row);
  }catch(err){if(mounted.current&&!ended.current&&err.name!=='AbortError')setError(err.message);}finally{if(mounted.current&&!ended.current)setWorking(false);}
 }
 async function saveCue(){setWorking(true);setError('');request.current=new AbortController();try{
  const row=await portalApi(`/speaking-rehearsals/${session.id}/cue`,{method:'POST',body:{position:session.position,text:cue},signal:request.current.signal});if(mounted.current)onUpdated(row);
 }catch(err){if(mounted.current&&err.name!=='AbortError')setError(err.message);}finally{if(mounted.current)setWorking(false);}}
 async function updateSupport(next){setSupport(next);try{const row=await portalApi('/speaking-rehearsals/'+session.id+'/support',{method:'PATCH',body:next});if(!ended.current)onUpdated(row);}catch(err){setError(err.message);}}
 function closeView(){pause();setOpen(false);}
 async function supportAction(kind){
  pause();if(kind==='moment'){autoMicWanted.current=false;setAutomaticMic(false);setCaption('Take your time. Select Take the floor when you are ready.');}
  if(kind==='rephrase'){setPanel('notes');setCue(cue||'Main idea → one reason → a concrete example → what I learned.');}
  try{const row=await portalApi(`/speaking-rehearsals/${session.id}/repair`,{method:'POST',body:{phrase:kind}});if(!ended.current)onUpdated(row);}catch(err){if(!ended.current)setError(err.message);}
  if(kind==='repeat'||kind==='slower'){if(kind==='slower')setSlow(true);void narrate([{id:'support-repeat',speaker:step.speaker||'maya',text:step.prompt}],false,kind==='slower'?0.8:1);}
 }
 function toggle(value){setPanel(current=>current===value?'':value);}
 function trap(event){if(event.key==='Escape'){setPanel('');return;}if(event.key!=='Tab')return;const nodes=dialog.current?.querySelectorAll('button:not(:disabled),a[href],textarea:not(:disabled),[tabindex="0"]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 const positions={maya:'0% 0%',asha:'100% 0%',rohan:'0% 100%',neha:'100% 100%'};
 function tile(person,small=false){const self=person.id==='learner',talking=self?micActive:speaker===person.id;return <article key={person.id} aria-label={person.name} className={`${styles.tile} ${talking?styles.talking:''} ${self?styles.selfTile:''} ${small?styles.railTile:''}`}><div className={styles.tileTop}><span>{t(person.role)}</span><span aria-label={t(talking?'Speaking':'Microphone off')} className={styles.micState}><Icon name={talking?'wave':'micOff'}/></span></div><div className={styles.portraitArea}>{self?<div className={styles.selfAvatar}>{(learner.display_name||t('You')).slice(0,1).toUpperCase()}</div>:<div role="img" aria-label={`${person.name} · ${t('AI-generated portrait')}`} className={styles.portrait} style={{backgroundPosition:positions[person.id]}}/>}<div className={styles.voiceHalo}/></div><div className={styles.tileBottom}><strong>{person.name}</strong><small>{t(self?(micActive?'Microphone on':'Mic off'):'AI')}</small></div></article>;}
 const unread=meeting.messages.filter(message=>message.speaker!=='learner'&&!played.current.has(message.id));
 if(!ready)return null;
 if(!open)return <section className={styles.returnCard}><strong>{t(active?'Rehearsal in progress':'Rehearsal complete')}</strong><button onClick={()=>setOpen(true)}>{t('Return to meeting')}</button></section>;
 return createPortal(<section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t(isPresentation?'Presentation meeting':'Interview meeting')} onKeyDown={trap} className={styles.meeting}>
  <header className={styles.topbar}><div className={styles.brand}><span className={styles.brandMark}>S</span><div><strong>{t(isPresentation?'Presentation room':'Interview with Maya')}</strong><span>{t(isPresentation?'Maya and your AI audience':'One-to-one interview')}</span></div></div><div className={styles.meetingTitle}><h1 title={session.content.goal}>{session.content.goal}</h1><span>{t(active?(isPresentation&&step.kind==='question'?'AUDIENCE Q&A':isPresentation?'PRESENTING':'INTERVIEW'):'Rehearsal complete')} · {t({en:'English',hi:'Hindi',ml:'Malayalam'}[session.language])}</span></div><div className={styles.headerActions}><span className={styles.timer}><i/>{Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</span><button aria-label={t('Minimise meeting')} disabled={working||recording} onClick={closeView}><Icon name="minimise"/></button></div></header>
  <div className={`${styles.body} ${panel?styles.withPanel:''}`}><main className={styles.stage}>
   <div className={styles.stageInfo}><span className={styles.simulation}>{t('AI PRACTICE ROOM')}</span><span>{t(isPresentation?'Your slides · AI audience':meeting.question_source==='reviewed_resume'?'Questions tailored to your reviewed résumé':'Questions based on your role and goal')}</span><span>{session.position+1} / {session.content.steps.length}</span></div>
   {active&&<RehearsalSupportBar support={support} onManual={value=>updateSupport({...support,manual_finish:value})} onPause={()=>supportAction('moment')} onRepeat={()=>supportAction('repeat')} onSlow={()=>supportAction('slower')} onOutline={()=>supportAction('rephrase')} disabled={working||recording||ending}/>}
   {active&&support.outline_prompts&&<p>{t(isPresentation?'Key point → explain why → give an example → takeaway.':'Background → what I did → example or result → what I learned.')}</p>}
   {isPresentation?<div className={styles.presentationLayout}><section className={styles.slideColumn} aria-label={t('Uploaded presentation')}>
    <div className={styles.slideToolbar}><strong>{material.title}</strong><span>{t('Slide')} {slideNumber} / {material.sections.length}</span></div>
    {step.kind==='question'&&<div className={styles.audienceQuestion}><strong>{people.find(person=>person.id===step.speaker)?.name||'Maya'} · {t('AUDIENCE Q&A')}</strong><p lang={session.language}>{step.prompt}</p></div>}
    <div className={styles.slideSurface}>{preview?<img src={preview} alt={`${t('Uploaded slide')} ${slideNumber}`} onError={()=>{setPreview('');setPreviewFailed(true);}}/>:<div className={styles.slideText}><span>{t(material.has_preview&&!previewFailed?'Loading slide preview…':'Reviewed slide text')}</span><h2>{slide.title}</h2><p>{slide.text}</p></div>}</div>
    {previewFailed&&<small>{t('Original preview unavailable. Showing your reviewed slide text.')}</small>}
    {active&&<div className={styles.slideNavigation}><button disabled={working||recording||session.position===0} onClick={()=>move('back')}><Icon name="back"/>{t('Previous slide')}</button><button disabled={working||recording} onClick={()=>move('next')}>{t(step.kind==='slide'?'Next slide':'Skip question')}<Icon name="next"/></button>{step.kind==='slide'&&<button disabled={working||recording} onClick={()=>move('qa')}>{t('Start Q&A')}</button>}</div>}
   </section><aside className={styles.audienceRail} aria-label={t('AI audience')}>{people.map(person=>tile(person,true))}</aside></div>:<div className={styles.interviewLayout}>
    {tile(people[0])}<div className={styles.interviewSide}>{tile(people[1],true)}<section className={styles.interviewQuestion}><span>{t(step.follow_up?'MAYA’S FOLLOW-UP':'MAYA’S QUESTION')}</span><h2 lang={session.language}>{active?step.prompt:t('Your interview is complete.')}</h2><p>{t(active?'Give one short answer. Maya will ask a follow-up and continue the interview.':'Open Coaching or return to your summary to review your answers.')}</p>{active&&<button disabled={working||recording} onClick={()=>move('next')}>{t('Skip question')}<Icon name="next"/></button>}</section></div>
   </div>}
   <div className={styles.caption} aria-live="polite"><strong>{playing?people.find(person=>person.id===speaker)?.name:micActive?t('You'):'Maya'}</strong><p>{working?t('Checking your contribution…'):micActive?t(support.manual_finish?'Listening. Select Send contribution now when you finish.':'Listening. Pause when you finish; your answer sends automatically.'):playing?caption:!active?t('Your rehearsal is finished. Your feedback and summary are ready.'):caption?caption:isPresentation?t('Present in short sections. Say “next slide”, “previous slide”, “start Q and A” or “finish presentation” as a separate command in your language.'):t('Select Listen to hear Maya, then take the floor to answer.')}</p></div>
   {audio.loading&&<p role="status" className={styles.audioStatus}>{t('Preparing Maya’s voice…')}</p>}
   {(error||audio.error||last?.feedback_error)&&<div role="alert" className={styles.error}><p>{t(error||audio.error||last.feedback_error)}</p>{audio.autoplayBlocked&&<button disabled={working||recording} onClick={()=>narrate(pendingSpeech.current,active&&(session.scenario==='interview'||step.kind==='question'))}>{t('Enable audio')}</button>}</div>}
  </main>
  {panel&&<aside className={styles.sidepanel} aria-label={t(panel==='transcript'?'Meeting transcript':panel==='notes'?'Private speaking notes':'Your feedback')}><header><h2>{t(panel==='transcript'?'Meeting transcript':panel==='notes'?'Private speaking notes':'Your feedback')}</h2><button aria-label={t('Close panel')} onClick={()=>setPanel('')}><Icon name="close"/></button></header>
   {panel==='transcript'?<div ref={transcript} className={styles.transcript} role="log">{meeting.messages.map(message=><article key={message.id} className={message.speaker==='learner'?styles.myMessage:styles.message}><strong>{people.find(person=>person.id===message.speaker)?.name}</strong><p>{message.text}</p></article>)}</div>:panel==='notes'?<div className={styles.panelContent}><p>{t('These notes are private cues for your current slide or question.')}</p><textarea aria-label={t('My speaking notes')} maxLength={1500} value={cue} disabled={working||recording||!active} onChange={event=>setCue(event.target.value)}/><button disabled={working||recording||!active} onClick={saveCue}>{t('Save my cue')}</button><button disabled={working||recording||!cue.trim()} onClick={()=>narrate([{id:'cue',speaker:'maya',text:cue}])}>{t('Speak this cue')}</button></div>:<div className={styles.panelContent}>
    <span className={styles.feedbackBadge}>{t('Communication coaching')}</span>{!session.content.turns.length&&<p>{t('Coaching appears after your first contribution.')}</p>}{session.content.turns.map((turn,index)=><article key={turn.recording_id} className={styles.answerFeedback}><strong>{t('Answer')} {index+1}</strong><p>{turn.heard}</p><AnswerMeasurements turn={turn}/>{turn.feedback?<><h3>{t('One thing that worked')}</h3><p>{turn.feedback.strength}</p><h3>{t('One thing to try')}</h3><p>{turn.feedback.suggestion}</p><h3>{t('A possible way to explain it')}</h3><p>{turn.feedback.example}</p></>:<p>{t(turn.feedback_error)}</p>}<Link onClick={closeView} href={{pathname:'/speech-translator',query:{recording:turn.recording_id}}}>{t('Confirm my message and check sounds')}</Link></article>)}<p className={styles.note}>{t('Feedback concerns your ideas and participation. Sound practice is separate.')}</p>
   </div>}
  </aside>}
  </div>
  <footer className={styles.callbar}><div className={styles.callInfo}><span className={styles.privateDot}/><span>{t('Private practice')}<small>{t('Camera off · audio only when you record')}</small></span></div><div className={styles.controls}>
   <button disabled={working||recording} onClick={()=>playing?pause():narrate(pendingSpeech.current.length?pendingSpeech.current:unread.length?unread:[{id:'repeat-current',speaker:step.speaker||'maya',text:active?step.prompt:t('Your rehearsal is finished. Your feedback and summary are ready.')}],active&&(session.scenario==='interview'||step.kind==='question'))} aria-label={t(playing?'Pause playback':'Hear Maya')}><Icon name={playing?'pause':'speaker'}/><span>{t(playing?'Pause':'Listen')}</span></button>
   {active&&<RecordingStudio key={attempt} meetingMode manualFinish={support.manual_finish} autoStartToken={listenToken} cancelToken={cancelToken} preferredProvider={session.content.recognition_provider} learner={{...learner,language:session.language}} task="conversation" maxDuration={178} quietFinishMs={extraTime?8000:support.pause_seconds*1000} assessFeedback={false} showFeedback={false} beforeRecord={pause} disabled={working||ending} onBusyChange={setRecording} onRecordingChange={setMicActive} onRecorded={recorded}/>}
   <button aria-pressed={panel==='transcript'} onClick={()=>toggle('transcript')}><Icon name="chat"/><span>{t('Transcript')}</span></button><button aria-pressed={panel==='notes'} onClick={()=>toggle('notes')}><Icon name="notes"/><span>{t('Notes')}</span></button><button aria-pressed={panel==='feedback'} onClick={()=>toggle('feedback')}><Icon name="coach"/><span>{t('Coaching')}</span>{last?.feedback&&<i className={styles.notification}/>}</button>
  </div>{active&&<div className={styles.autoMicOptions}><label><input type="checkbox" checked={automaticMic} disabled={ending} onChange={event=>{autoMicWanted.current=event.target.checked;setAutomaticMic(event.target.checked);if(!event.target.checked&&micActive)setCancelToken(value=>value+1);if(event.target.checked&&!playing&&!working)setListenToken(value=>value+1);}}/>{t('Automatic microphone')}</label><label><input type="checkbox" checked={extraTime} disabled={recording||ending} onChange={event=>setExtraTime(event.target.checked)}/>{t('More time between words')}</label></div>}<button className={styles.leave} disabled={ending} aria-label={t(active?(isPresentation?'End presentation':'End interview'):'View my summary')} onClick={()=>active?finishMeeting():closeView()}><Icon name="leave"/><span>{t(ending?'Saving report…':active?(isPresentation?'End presentation':'End interview'):'View my summary')}</span></button></footer>
 </section>,document.body);
}
