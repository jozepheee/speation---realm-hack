import {useEffect,useRef,useState} from 'react';
import {portalApi} from '../lib/portalApi';
import {startLearningSession,saveLearningEvent} from '../lib/learningSessionClient';
import LessonSpeechPractice from './LessonSpeechPractice';
import ArticulationLesson from './ArticulationLesson';
import styles from '../styles/wordy.module.css';

export default function Wordy({learner,scope,target,personalTarget,onHear,onStopSpeech,onBeforeRecord,onBusyChange,onFeedback}){
 const ml=learner.language==='ml',label=(en,mal)=>ml?mal:en;
 const [session,setSession]=useState(null),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[practiceBusy,setPracticeBusy]=useState(false),[lessonBusy,setLessonBusy]=useState(false),[error,setError]=useState(''),[finished,setFinished]=useState(false),[reload,setReload]=useState(0);
 const generation=useRef(0),replays=useRef(0),attemptRevision=useRef(0);
 const key=`speation:wordy:${scope}:${learner.language}:${target}`;
 useEffect(()=>{const current=++generation.current;let active=true;setSession(null);setPlan(null);setError('');setFinished(false);setBusy(true);replays.current=0;attemptRevision.current++;
  (async()=>{try{
   let value;const previous=localStorage.getItem(key);
   if(previous){try{value=await portalApi(`/learning-sessions/${previous}`);if(value.status==='finished')value=null;}catch{}}
   if(!value)value=await startLearningSession(scope,{kind:'model',feature:'wordy',target,language:learner.language,lesson_version:2,personalized:true});
   if(!active||current!==generation.current)return;setSession(value);localStorage.setItem(key,value.id);
   const lesson=await portalApi(`/wordy/${value.id}/articulation`);
   if(active&&current===generation.current)setPlan(lesson);
  }catch(err){if(active)setError(err.message);}finally{if(active)setBusy(false);}})();
  return()=>{active=false;generation.current++;attemptRevision.current++;onStopSpeech?.();};
 },[key,reload]);
 useEffect(()=>{onBusyChange?.(busy||practiceBusy||lessonBusy);return()=>onBusyChange?.(false);},[busy,practiceBusy,lessonBusy]);
 async function updateAttempt(value){const current=generation.current,revision=++attemptRevision.current;
  try{const next=await portalApi(`/wordy/${session.id}/articulation?recording_id=${encodeURIComponent(value.id)}`);if(current===generation.current&&revision===attemptRevision.current)setPlan(next);}
  catch(err){if(current===generation.current)setError(label('Your result is saved. Updating the demonstration needs retry: ','ഫലം സൂക്ഷിച്ചു. മാതൃക പുതുക്കാൻ വീണ്ടും ശ്രമിക്കാം: ')+err.message);}
 }
 return <section className={styles.world} lang={learner.language} aria-label="Wordy word practice">
  <header><span>WORDY</span><h2>{label('Watch it. Hear it. Your turn.','കാണാം. കേൾക്കാം. ഇനി പറയാം.')}</h2><p>{label('Your saved practice word, with a sound-specific teaching demonstration.','നിങ്ങളുടെ പരിശീലന വാക്കും അതിലെ ശബ്ദത്തിനുള്ള ചലന മാതൃകയും.')}</p></header>
  <div className={styles.word}>{target}</div>
  <div className={styles.steps}><span>1 · {label('Watch & listen','കാണാം, കേൾക്കാം')}</span><span>2 · {label('Say your word','പറയാം')}</span><span>3 · {label('Check & retry','പരിശോധിക്കാം')}</span></div>
  <div className={styles.split}><section className={styles.reference}>
   {busy&&<p role="status">{label('Opening your saved sound lesson…','നിങ്ങളുടെ ശബ്ദ പരിശീലനം തുറക്കുന്നു…')}</p>}
   {plan&&<ArticulationLesson key={`${key}:${plan.cache_key}`} plan={plan} disabled={practiceBusy||finished} onHear={onHear} onStopSpeech={onStopSpeech} onBusyChange={setLessonBusy} onWatched={async({slow})=>{
    replays.current=Math.min(30,replays.current+1);await saveLearningEvent(scope,session,{action:'model_watch',index:session.position||0,replays:replays.current,slow,expected_text:target});
   }}/>}
   {!busy&&!plan&&<button onClick={()=>setReload(value=>value+1)}>{label('Retry opening the lesson','വീണ്ടും തുറക്കാം')}</button>}
   <div className={styles.audio}><button disabled={busy||practiceBusy||lessonBusy} onClick={()=>onHear(target)}>{label('Hear the word','വാക്ക് കേൾക്കാം')}</button><button disabled={busy||practiceBusy||lessonBusy} onClick={()=>onHear(target,{slow:true})}>{label('Hear slowly','പതുക്കെ കേൾക്കാം')}</button></div>
  </section><section className={styles.practice}>
   {session&&!finished&&<LessonSpeechPractice key={session.id} learner={learner} scope={scope} session={session} target={target} disabled={lessonBusy} onHear={onHear} onStopSpeech={onStopSpeech} onBeforeRecord={onBeforeRecord} onBusyChange={setPracticeBusy} onFeedback={onFeedback} onAttemptResult={updateAttempt} onComplete={async()=>{await saveLearningEvent(scope,session,{action:'finish',index:session.position||0});localStorage.removeItem(key);setFinished(true);}}/>}
   {finished&&<h3>{label('Word practice saved. Choose your next word above.','പരിശീലനം സൂക്ഷിച്ചു. മുകളിൽ അടുത്ത വാക്ക് തിരഞ്ഞെടുക്കാം.')}</h3>}
  </section></div>{error&&<p role="alert">{error}</p>}
 </section>;
}
