import ListenChooseLesson from './ListenChooseLesson';
import WatchTogetherLesson from './WatchTogetherLesson';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {portalApi} from '../lib/portalApi';
import {saveLearningEvent,startLearningSession} from '../lib/learningSessionClient';
import {pronunciationResult} from '../lib/pronunciationResult';
import PronunciationResult from './PronunciationResult';
import ArticulationCoach from './ArticulationCoach';
import {supportedContrast} from '../lib/supportedContrast';
import {childSpeechPractice} from '../lib/childSpeechPractice';
import StoryScene from './StoryScene';
import RecordingStudio from './RecordingStudio';
import CompanionMessageLesson from './CompanionMessageLesson';
import MayaScheduledChecks from './MayaScheduledChecks';
import {speechExampleCache} from '../lib/speechExampleCache';
import {offlineStoryPackage} from '../lib/offlineStoryPackage';
import styles from '../styles/maya-learning.module.css';

export default function MayaLearningActivities({activityChoice,onActivityChange,hideNavigation=false,immersiveMessage=false,onMirrorHost,assessment,learner,goals=[],suggestedTarget,onHear,onTeachingSpeech,onStopSpeech,onFeedback,onChooseTarget,onBusyChange,onBeforeRecord,onCompare}){
 const {user}=useAuth(),scope=`${user?.id}:${learner.id}`,storageKey=`speation:adventure:${scope}`;
 const [activity,setActivity]=useState('message'),[target,setTarget]=useState(suggestedTarget||''),[interest,setInterest]=useState('');
 const [messageBusy,setMessageBusy]=useState(false),[checkBusy,setCheckBusy]=useState(false),[checkActive,setCheckActive]=useState(false);
 const [story,setStory]=useState(null),[storySession,setStorySession]=useState(null),[step,setStep]=useState(0),[attempt,setAttempt]=useState(null),[storyFeedback,setStoryFeedback]=useState(null),[storyTurn,setStoryTurn]=useState(0),[done,setDone]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false),[notice,setNotice]=useState(''),[filmPlaying,setFilmPlaying]=useState(false);
 const request=useRef(null),version=useRef(0);
 useEffect(()=>{if(activityChoice&&['message','story','listen','model'].includes(activityChoice)){onStopSpeech?.();setActivity(activityChoice);setError('');}},[activityChoice]);
 useEffect(()=>{if(suggestedTarget&&!target)setTarget(suggestedTarget);},[suggestedTarget]);
 function syncStory(value){setStorySession(value);setStep(Math.min(2,value.position));setDone(['completed','finished'].includes(value.status));}
 useEffect(()=>{
  const current=++version.current;
  try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(value?.story?.scenes?.length===3){setStory({...value.story,session_id:value.session_id});setTarget(value.story.target);setStep(value.session_id?(value.step||0):0);setDone(!!value.done);
    if(value.session_id)portalApi(`/learning-sessions/${value.session_id}`).then(result=>{if(current===version.current)syncStory(result);}).catch(()=>{if(current===version.current)setNotice('Saved activity is available here. Reconnect to sync progress; no offline assessment is made.');});
   }
  }catch{}
  return()=>{version.current++;request.current?.abort();onStopSpeech?.();};
 },[storageKey]);
 useEffect(()=>{if(story)try{localStorage.setItem(storageKey,JSON.stringify({story,step,done,session_id:storySession?.id||story.session_id}));}catch{}},[story,step,done,storySession?.id,storageKey]);
 useEffect(()=>{onBusyChange?.(busy||recording||messageBusy||checkBusy||checkActive||filmPlaying);return()=>onBusyChange?.(false);},[busy,recording,messageBusy,checkBusy,checkActive,filmPlaying]);
 function choose(next){if(busy||recording||messageBusy)return;onStopSpeech?.();setActivity(next);onActivityChange?.(next);setError('');setNotice('');}
 async function createStorySession(value){return startLearningSession(scope,{kind:'story',target:value.target,story:{title:value.title,scenes:value.scenes}});}
 async function downloadStory(){
  setError('');setBusy(true);
  try{const examples={};let size=0;for(const scene of story.scenes){const saved=await speechExampleCache(scope,scene.sentence,'en').catch(()=>null);const audio=saved?.audio_base64;if(typeof audio==='string'&&/^[A-Za-z0-9+/=\r\n]+$/.test(audio)&&size+audio.length<15000000){examples[scene.sentence]=audio;size+=audio.length;}}
   const url=URL.createObjectURL(new Blob([offlineStoryPackage(story,examples)],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='speation-offline-story.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Offline story downloaded. It includes saved voice examples where available and does not record or grade speech.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function generate(){
  onStopSpeech?.();setBusy(true);setError('');const current=++version.current;request.current?.abort();request.current=new AbortController();
  try{const value=await portalApi(`/learners/${learner.id}/learning-adventure`,{method:'POST',body:{target:target.trim(),interest:interest.trim()},signal:request.current.signal,timeoutMs:45000});
   if(current!==version.current)return;setStory(value);setStep(0);setAttempt(null);setStoryFeedback(null);setDone(false);setStorySession(null);
   const saved=await createStorySession(value);if(current!==version.current)return;syncStory(saved);
  }catch(err){if(current===version.current&&err.name!=='AbortError')setError(err.message);}finally{if(current===version.current)setBusy(false);}
 }
 async function storyEvent(action,record=attempt){
  onStopSpeech?.();setBusy(true);setError('');const current=version.current;
  try{const session=storySession||await createStorySession(story);
   const saved=await saveLearningEvent(scope,session,{action,index:step,...(action==='scene'?{recording_id:record.id}:{})});
   if(current!==version.current)return;syncStory(saved);setAttempt(null);setStoryFeedback(null);
   if(saved.status==='paused')setNotice('Your place is saved. Resume when you are ready.');
  }catch(err){if(current===version.current)setError(`Your recording is kept. Retry saving this step: ${err.message}`);}finally{if(current===version.current)setBusy(false);}
 }
 const scene=story?.scenes[step],storyConcern=pronunciationResult(storyFeedback,story?.scenes[step]?.sentence).concerns[0];
 return <section lang="en" translate="no" className={`${styles.panel} ${immersiveMessage&&activity==='message'?styles.messageOverlay:''}`} aria-label="Learn with Maya activities">{!immersiveMessage&&!(activity==='story'&&story&&!done)&&<header className={styles.welcome}><span>YOUR LEARNING WORLD</span><h2>Let’s make something happen.</h2><p>Choose an adventure. Maya will help you along the way.</p></header>}


 {!hideNavigation&&<nav aria-label="Learning activities">{[['message','My message'],['story','Story adventure'],['listen','Hear the difference'],['model','Familiar example']].map(([id,label])=><button key={id} aria-pressed={activity===id} disabled={busy||recording||messageBusy||checkBusy||checkActive} onClick={()=>choose(id)}>{label}</button>)}</nav>} {!immersiveMessage&&!busy&&!recording&&!messageBusy&&<MayaScheduledChecks learner={learner} goals={goals} onBeforeRecord={onBeforeRecord} onStopSpeech={onStopSpeech} onBusyChange={setCheckBusy} onActiveChange={setCheckActive}/>}
 <fieldset disabled={checkActive} style={{border:0,padding:0,margin:0,minWidth:0}}>
 {activity==='message'&&<CompanionMessageLesson immersive={immersiveMessage} onCompare={onCompare} draftScope={scope} learner={learner} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setMessageBusy} onFeedback={onFeedback}/>}
 {activity==='story'&&<>
 {!story||done?<><h3>{done?(storySession?.completed?'Adventure complete':'Practice finished'):'Your speaking adventure'}</h3>{done&&<p>You helped finish the story! Your adventure is saved.</p>}{learner.age<16&&<div className={styles.pictures}>{[['Space','🚀'],['Animals','🐦'],['A park adventure','🌳'],['A bakery adventure','🧁']].map(([topic,picture])=><button key={topic} aria-pressed={interest===topic} disabled={busy} onClick={()=>setInterest(topic)}><span>{picture}</span>{topic}</button>)}</div>}<label>{learner.age>=16?'A situation or interest':'What should the adventure be about?'}<input value={interest} maxLength={120} onChange={e=>setInterest(e.target.value)} placeholder={learner.age>=16?'A college project or meeting':'Space, animals, football…'}/></label><label>A word or short phrase you want to practise<input value={target} maxLength={60} onChange={e=>setTarget(e.target.value)}/></label><small>Use a word from your own message or your practice goal.</small><button disabled={busy||!target.trim()||interest.trim().length<2||!learner.consent?.cloud_processing_allowed} onClick={generate}>{busy?'Preparing your adventure…':'Create my adventure'}</button></>:
 <><p>Scene {step+1} of 3</p><progress value={step} max={3}/><h3>{story.title}</h3><StoryScene key={`${story.title}:${step}`} scene={scene} title={story.title} index={step} onHear={onHear} onStopSpeech={onStopSpeech} onPlayingChange={setFilmPlaying} disabled={busy||recording}/><p className={styles.line}>{scene.sentence}</p><button disabled={busy||recording||filmPlaying} onClick={()=>onHear(scene.sentence)}>Hear my line</button>
 {storySession?.status==='paused'?<button disabled={busy} onClick={()=>storyEvent('resume')}>Resume story</button>:<RecordingStudio draftScope={scope} key={`${storySession?.id||story.title}:${step}:${storyTurn}`} learner={{...learner,language:'en'}} task="sentence" expectedText={scene.sentence} maxDuration={30} showSendButton disabled={busy||filmPlaying} beforeRecord={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onBusyChange={setRecording} showFeedback={false} readFeedback={false} onRecorded={async record=>{setAttempt(record);const content=record.coaching?.content;if(record.coaching)onFeedback?.(record.coaching);setError('');setStoryFeedback(content||{state:'insufficient_evidence',concerns:[],summary:record.coaching_error||'No audio assessment is available for this recording.'});try{if(content?.state==='no_clear_difference'&&!content.concerns?.length){await onHear('That sounded clear! You can continue the story, or try the line again.');return;}if(content){const concern=pronunciationResult(content,scene.sentence).concerns[0],plan=content.teaching_plan?.find(item=>item.word===concern?.word),word=concern?.word||scene.sentence;await onHear([supportedContrast(content,word)?.speech,childSpeechPractice('en',word,plan?.expected_phone||concern?.expected_phone,pronunciationResult(content,scene.sentence).state==='uncertain').speech].filter(Boolean).join(' '));}}catch(err){setNotice('Your result is saved below. Maya’s voice could not play; use Hear my line to retry.');}}} />}
 {attempt&&<PronunciationResult content={storyFeedback} record={attempt} expected={scene.sentence} onHear={onHear} onStopSpeech={onStopSpeech} disabled={busy||recording||filmPlaying} onRetry={()=>{onStopSpeech?.();setStoryFeedback(null);setAttempt(null);setStoryTurn(value=>value+1);}}/>}
 {storyConcern&&<ArticulationCoach word={storyConcern.word} phone={storyConcern.expected_phone||''} produced={storyConcern.produced_phone||''} contrast={supportedContrast(storyFeedback,storyConcern.word)} cameraSupport={storyFeedback.camera_support} onHear={onHear} disabled={busy||recording} age={learner.age}/>}
 <button disabled={busy||recording||!attempt||storySession?.status==='paused'} onClick={()=>storyEvent('scene')}>{step===2?'Finish adventure':'Continue the story'}</button><details><summary>Take another path</summary><button disabled={busy||recording||storySession?.status==='paused'} onClick={()=>storyEvent('skip')}>Skip this scene</button><button disabled={busy||recording} onClick={()=>storyEvent('pause')}>Take a break</button><button disabled={busy||recording} onClick={()=>storyEvent('finish')}>Finish for now</button></details></>}
 </>}
 {activity==='listen'&&<ListenChooseLesson learner={learner} scope={scope} target={target} expectedPhone={assessment?.concerns?.[0]?.expected_phone||''} producedPhone={assessment?.concerns?.[0]?.produced_phone||''} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setCheckBusy} onFeedback={onFeedback}/>}
 {activity==='model'&&<><label>Word or phrase for this example<input disabled={checkBusy} value={target} maxLength={120} onChange={e=>setTarget(e.target.value)}/></label>{target.trim()?<WatchTogetherLesson key={target.trim()} scope={scope} learner={learner} target={target.trim()} phone={assessment?.teaching_plan?.find(item=>item.word?.toLowerCase()===target.trim().toLowerCase())?.expected_phone||goals.find(item=>item.practice_word?.toLowerCase()===target.trim().toLowerCase())?.sound||''} onMirrorHost={onMirrorHost} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setCheckBusy} onFeedback={onFeedback}/>:<p>Choose a useful word or phrase from your message or practice goal.</p>}</>}
 {activity==='story'&&story&&<button disabled={busy||recording} onClick={downloadStory}>Download this story for offline practice</button>}
 </fieldset>{busy&&<p role="status">Saving or preparing your activity…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
