import {useEffect,useRef,useState} from 'react';
import {portalApi,privateAudio} from '../lib/portalApi';
import {startLearningSession,saveLearningEvent} from '../lib/learningSessionClient';
import LessonSpeechPractice from './LessonSpeechPractice';
import ArticulationCoach from './ArticulationCoach';
import styles from '../styles/wordy.module.css';

export default function Wordy({learner,scope,target,personalTarget,onHear,onStopSpeech,onBeforeRecord,onBusyChange,onFeedback}){
 const ml=learner.language==='ml',label=(en,mal)=>ml?mal:en;
 const [session,setSession]=useState(null),[video,setVideo]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[practiceBusy,setPracticeBusy]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[slow,setSlow]=useState(false),[finished,setFinished]=useState(false);
 const player=useRef(null),generation=useRef(0),downloaded=useRef('');
 const key=`speation:wordy:${scope}:${learner.language}:${target}`;
 useEffect(()=>{const current=++generation.current;let active=true;setSession(null);setVideo(null);setError('');setFinished(false);downloaded.current='';setBusy(true);
  (async()=>{try{
   let value;const previous=localStorage.getItem(key);
   if(previous){try{value=await portalApi(`/learning-sessions/${previous}`);if(value.status==='finished')value=null;}catch{}}
   if(!value)value=await startLearningSession(scope,{kind:'model',feature:'wordy',target,language:learner.language,lesson_version:2,personalized:true});
   if(!active||current!==generation.current)return;setSession(value);localStorage.setItem(key,value.id);setVideo(await portalApi(`/wordy/${value.id}/video`));
  }catch(err){if(active)setError(err.message);}finally{if(active)setBusy(false);}})();
  return()=>{active=false;generation.current++;player.current?.pause();onStopSpeech?.();};
 },[key]);
 useEffect(()=>{onBusyChange?.(busy||practiceBusy||playing);return()=>onBusyChange?.(false);},[busy,practiceBusy,playing]);
 useEffect(()=>{if(!session||!video||!['submitting','pending','queued','processing','in_progress'].includes(video.status))return;let cancelled=false;
  const timer=setTimeout(async()=>{try{const value=await portalApi(`/wordy/${session.id}/video`);if(!cancelled){setVideo(value);setError('');}}catch(err){if(!cancelled){setError(err.message);setVideo(previous=>({...previous,pollRetry:Date.now()}));}}},30000);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[session?.id,video]);
 useEffect(()=>{if(video?.status!=='completed'||!video.content_path||downloaded.current===video.content_path)return;const controller=new AbortController();let value;
  privateAudio(video.content_path,{signal:controller.signal}).then(blob=>{if(controller.signal.aborted)return;value=URL.createObjectURL(blob);downloaded.current=video.content_path;setUrl(value);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);});
  return()=>{controller.abort();if(value)URL.revokeObjectURL(value);};
 },[video?.status,video?.content_path]);
 useEffect(()=>{setUrl('');},[key]);
 async function createVideo(){if(!session)return;const current=generation.current;setBusy(true);setError('');try{const value=await portalApi(`/wordy/${session.id}/video`,{method:'POST',timeoutMs:45000});if(current===generation.current)setVideo(value);}catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}}
 const pending=video&&['submitting','pending','queued','processing','in_progress'].includes(video.status);
 return <section className={styles.world} lang={learner.language} aria-label="Wordy word practice">
  <header><span>WORDY</span><h2>{label('One word. Your next small win.','ഒരു വാക്ക്. ഒരു ചെറിയ മുന്നേറ്റം.')}</h2><p>{label('Practise a word from your saved conversation or assigned goal.','നിങ്ങളുടെ സംഭാഷണത്തിൽനിന്നോ പരിശീലന ലക്ഷ്യത്തിൽനിന്നോ ഒരു വാക്ക് പരിശീലിക്കാം.')}</p></header>
  <div className={styles.word}>{target}</div>
  <div className={styles.steps}><span>1 · {label('Watch & listen','കാണാം, കേൾക്കാം')}</span><span>2 · {label('Say your word','പറയാം')}</span><span>3 · {label('Check & retry','പരിശോധിക്കാം')}</span></div>
  <div className={styles.split}><section className={styles.reference}>
   {url?<><video ref={player} src={url} controls playsInline preload="metadata" onPlay={()=>{onStopSpeech?.();setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/><button disabled={practiceBusy} aria-pressed={slow} onClick={()=>{const next=!slow;setSlow(next);if(player.current)player.current.playbackRate=next ? 0.65 : 1;}}>{label('Slow video','വീഡിയോ പതുക്കെ')}</button><small>{label('AI-generated illustration. Mouth movements and audio have not been independently verified.','AI ഒരുക്കിയ മാതൃക. ചുണ്ടുകളുടെ ചലനവും ശബ്ദവും സ്വതന്ത്രമായി പരിശോധിച്ചിട്ടില്ല.')}</small></>:
    <div className={styles.videoPlaceholder}><span aria-hidden="true">▶</span><h3>{label('Your word, brought to life','നിങ്ങളുടെ വാക്കിന്റെ വീഡിയോ')}</h3><p>{pending?label('Your video is generating. It can take a few minutes. You can practise with the audio now.','വീഡിയോ തയ്യാറാക്കുന്നു. കുറച്ച് മിനിറ്റ് എടുത്തേക്കാം. അതുവരെ മാതൃക കേട്ട് പരിശീലിക്കാം.'):label('Create a short video showing the word naturally, then slowly.','വാക്ക് സ്വാഭാവികമായും പതുക്കെയും പറയുന്ന ചെറിയ വീഡിയോ ഒരുക്കാം.')}</p>{!pending&&<button disabled={busy||practiceBusy||!session} onClick={createVideo}>{label('Create video reference','വീഡിയോ മാതൃക ഒരുക്കാം')}</button>}</div>}
   {video?.error&&<p role="alert">{video.error}</p>}
   <div className={styles.audio}><button disabled={busy||practiceBusy} onClick={()=>{player.current?.pause();onHear(target);}}>{label('Hear the word','വാക്ക് കേൾക്കാം')}</button><button disabled={busy||practiceBusy} onClick={()=>{player.current?.pause();onHear(target,{slow:true});}}>{label('Hear slowly','പതുക്കെ കേൾക്കാം')}</button></div>
   <section><h3>{label('Watch how to make the sound','ശബ്ദം എങ്ങനെ പറയാമെന്ന് കാണാം')}</h3><ArticulationCoach age={learner.age} word={target} phone={personalTarget?.sound||''} onHear={onHear} disabled={practiceBusy}/></section>
  </section><section className={styles.practice}>
   {busy&&!session&&<p role="status">{label('Opening your word practice…','പരിശീലനം തുറക്കുന്നു…')}</p>}
   {session&&!finished&&<LessonSpeechPractice key={session.id} learner={learner} scope={scope} session={session} target={target} onHear={onHear} onStopSpeech={()=>{player.current?.pause();onStopSpeech?.();}} onBeforeRecord={onBeforeRecord} onBusyChange={setPracticeBusy} onFeedback={onFeedback} onComplete={async()=>{await saveLearningEvent(scope,session,{action:'finish',index:session.position||0});localStorage.removeItem(key);setFinished(true);}}/>}
   {finished&&<h3>{label('Word practice saved. Choose your next word above.','പരിശീലനം സൂക്ഷിച്ചു. മുകളിൽ അടുത്ത വാക്ക് തിരഞ്ഞെടുക്കാം.')}</h3>}
  </section></div>{error&&<p role="alert">{error}</p>}
 </section>;
}
