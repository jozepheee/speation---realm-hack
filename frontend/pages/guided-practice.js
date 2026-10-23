import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import WordRecognition from '../components/WordRecognition';
import {practiceFeedbackTitle,wordRecognition} from '../lib/wordRecognition';
import ExerciseCamera from '../components/ExerciseCamera';
import {nextExercise} from '../public/face-tracking/exercise-vision';
import useLearners from '../hooks/useLearners';
import { portalApi } from '../lib/portalApi';
import { useLocale } from '../context/LocaleContext';
import styles from '../styles/guided-practice.module.css';
import shared from '../styles/workspace.module.css';
const groups = {
 mouth: [['mouth-wide','Open mouth demonstration'],['say-o','Rounded lips demonstration'],['say-e','Spread lips demonstration']],
 tongue: [['tongue-down','Tongue down demonstration'],['tongue-right','Tongue right demonstration'],['tongue-left','Tongue left demonstration']]
};
export default function GuidedPractice() {
 const {t}=useLocale(), router=useRouter();
 const {learners,learner,selected,setSelected,error:profileError,loading}=useLearners();
 const activity=['tongue','picture','word'].includes(router.query.activity)?router.query.activity:'mouth';
 const [step,setStep]=useState(0),[session,setSession]=useState(null),[record,setRecord]=useState(null),[watched,setWatched]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reference,setReference]=useState(''),[history,setHistory]=useState([]),[analysis,setAnalysis]=useState(null);
 const [answerLanguage,setAnswerLanguage]=useState('en'),[recordingBusy,setRecordingBusy]=useState(false);
 useEffect(()=>{setAnswerLanguage(learner?.language||'en');},[learner?.id,learner?.language]);
 const [round,setRound]=useState(1),[routineDone,setRoutineDone]=useState(false),[cameraActive,setCameraActive]=useState(false),[routine,setRoutine]=useState('');
 const autoLock=useRef(null),startedStep=useRef(null),demo=useRef(null);
 const generation=useRef(0),player=useRef(null),request=useRef(null);
 const exercise=groups[activity]?.[step];
 useEffect(()=>{setRound(1);setRoutineDone(false);setRoutine(crypto.randomUUID());setCameraActive(false);autoLock.current=null;startedStep.current=null;generation.current+=1;setStep(0);setSession(null);setRecord(null);setWatched(false);setReference('');setError('');setBusy(false);setAnalysis(null);setHistory([]);request.current=null;player.current?.pause();
   if(!selected)return;const controller=new AbortController();portalApi(`/learners/${selected}/guided-practice`,{signal:controller.signal}).then(setHistory).catch(err=>{if(!controller.signal.aborted)setError(err.message);});return()=>{generation.current+=1;controller.abort();player.current?.pause();};
 },[selected,activity]);
 async function start(practiceWord) {
  const current=generation.current;setBusy(true);setError('');setRecord(null);setReference('');player.current?.pause();
  request.current ||= crypto.randomUUID();
  try {const result=await portalApi(`/learners/${selected}/guided-practice`,{method:'POST',body:{request_id:request.current,kind:exercise?'exercise':activity,exercise_id:exercise?.[0]||null,...(['picture','word'].includes(activity)?{language:answerLanguage}:{}),...(activity==='word'&&typeof practiceWord==='string'?{practice_word:practiceWord}:{})}});if(current!==generation.current)return;setSession(result);if(result.content.state==='error'){request.current=null;throw new Error('The picture could not be generated. Please request a new picture.');}}
  catch(err){if(current===generation.current){setError(err.message);setSession(null);request.current=null;}}
  finally{if(current===generation.current)setBusy(false);}
 }
 async function changeAnswerLanguage(language){
  if(busy||recordingBusy)return;
  if(!session){setAnswerLanguage(language);return;}
  const current=generation.current;setBusy(true);setError('');player.current?.pause();setReference('');
  try{const result=await portalApi(`/guided-practice/${session.id}/language`,{method:'PATCH',body:{language}});if(current===generation.current){setSession(result);setAnswerLanguage(language);}}
  catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 async function speak(text=session.content.expected_text) {
  const current=generation.current;setBusy(true);setError('');
  try {const result=await portalApi(`/learners/${selected}/speak`,{method:'POST',body:{text,language:session.language}});if(current===generation.current)setReference(`data:audio/mpeg;base64,${result.audio_base64}`);}
  catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 async function complete(recording = record) {
  const current=generation.current;setBusy(true);setError('');
  try {const result=await portalApi(`/guided-practice/${session.id}/complete`,{method:'POST',body:{recording_id:recording?.id||session.recording_id||null,watched_demonstration:watched,...(analysis?{analysis:{...analysis,routine_id:routine,set_number:round,repetitions_target:3}}:{})},timeoutMs:activity==='picture'?35000:45000});if(current!==generation.current)return;setSession(result);if(result.feedback_error)setError(result.feedback_error);void portalApi(`/learners/${selected}/guided-practice`).then(saved=>{if(current===generation.current)setHistory(saved);}).catch(()=>{});return result;}
  catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 function next() {autoLock.current=null;setAnalysis(null);generation.current+=1;player.current?.pause();setSession(null);setRecord(null);setWatched(false);setReference('');request.current=null;setBusy(false);if(exercise){const next=nextExercise(step,round);setStep(next.step);setRound(next.round);setRoutineDone(next.done);}}
 async function saveAndAdvance(){if(!session||busy)return;autoLock.current=session.id;const current=generation.current;const saved=await complete();if(saved&&current===generation.current)next();}
 useEffect(()=>{if(!exercise||!cameraActive||routineDone)return;const key=`${routine}:${round}:${exercise[0]}`;if(startedStep.current===key)return;startedStep.current=key;void start();demo.current?.play().catch(()=>{});},[cameraActive,routine,round,exercise?.[0],routineDone]);
 useEffect(()=>{if(!exercise||routineDone||busy||!session||session.completed_at||!watched||analysis?.exercise_id!==exercise[0]||analysis.reps<3||autoLock.current===session.id)return;void saveAndAdvance();},[analysis,session,watched,busy,routineDone]);
 const speechFeedback=record?.coaching?.content||(record?.coaching_error?{state:'insufficient_evidence',summary:t(record.coaching_error),teaching_plan:[]}:null);
 const titles={mouth:'Mouth video practice',tongue:'Tongue video practice',picture:'Tell a picture story',word:'Listen and repeat'};
 return <ProtectedRoute><Head><title>{t(titles[activity])} {t('· Speation')}</title></Head><Navbar/><main className={`${shared.main} ${styles.main} ${exercise?styles.exerciseMain:''}`}>
  <header className={styles.header}><div><p className={shared.eyebrow}>{t('WATCH. LISTEN. TRY.')}</p><h1>{t(titles[activity])}</h1><p>{exercise?t('Follow the video beside your live camera. Save your movement counts for clinician review.'):t('One activity at a time. Your saved recordings are available to your assigned clinician.')}</p></div><Link className={shared.linkButton} href="/practice-hub">{t('All practice activities')}</Link></header>
  <nav className={styles.modes} aria-label={t('Guided activities')}>{Object.entries(titles).map(([key,title])=><Link key={key} href={{pathname:'/guided-practice',query:{activity:key}}} aria-current={key===activity?'page':undefined}>{t(title)}</Link>)}</nav>
  {profileError&&<p role="alert" className={shared.error}>{t(profileError)}</p>}{error&&<p role="alert" className={shared.error}>{t(error)}</p>}
  <label className={styles.profile}>{t('Learner')}<select value={selected} disabled={loading||!learners.length} onChange={event=>setSelected(event.target.value)}>{!learners.length&&<option value="">{loading?t('Loading profiles…'):t('Create a profile in Family Hub')}</option>}{learners.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
  {!loading&&!learner&&<Link className={shared.linkButton} href="/family">{t('Create a learner profile')}</Link>}
  {learner&&<div className={`${styles.layout} ${exercise?styles.exerciseLayout:''}`}>
    <section className={styles.stage}>
      {exercise?<><p className={shared.eyebrow}>{t('Demonstration')} {step+1} / {groups[activity].length}</p><h2>{t(exercise[1])}</h2><video ref={demo} key={exercise[0]} controls muted autoPlay={cameraActive&&!routineDone} playsInline preload="metadata" onEnded={()=>setWatched(true)} onError={()=>setError('The demonstration video could not load. Please retry.')} aria-label={t(exercise[1])}><source src={session?.content.video||`/videos/${{'mouth-wide':'mouth_wide','say-o':'say_o','say-e':'say_e','tongue-down':'tongue_down','tongue-right':'tongue_right','tongue-left':'tongue_left'}[exercise[0]]}.mp4`} type="video/mp4"/></video><p>{t('Watch first. Follow only exercises recommended by your clinician. You can pause or stop at any time.')}</p></>:
       activity==='picture'?<>{session?.content.image_data_url?<img className={styles.picture} src={session.content.image_data_url} alt={t('AI-generated practice scene')}/>:<div className={styles.placeholder}><span aria-hidden="true">✦</span><h2>{t('A new picture, a new story')}</h2><p>{t('Generate a picture, then tell us what you notice: who is there, what is happening, and what might happen next.')}</p></div>}<p>{t('AI-generated illustration. Describe what you actually see; the generation prompt is not an answer key.')}</p></>:
       <div className={styles.wordStage}><p>{t('Your practice word')}</p><h2 lang={session?.language||learner.language}>{session?.content.expected_text||'…'}</h2><p>{t('Hear it, take your time, then say it in your own voice.')}</p>{session&&<button disabled={busy||!learner.consent?.cloud_processing_allowed} onClick={()=>speak()}>{t('Hear the word')}</button>}{reference&&<audio ref={player} src={reference} controls/>}</div>}
    </section>
    <section className={styles.actions}>
      {['picture','word'].includes(activity)&&<label className={shared.form}>{t(activity==='word'?'Practice language':'Answer language')}<select value={session?.language||answerLanguage} disabled={busy||recordingBusy||!!session?.completed_at} onChange={event=>changeAnswerLanguage(event.target.value)}>{[['en','English'],['hi','Hindi'],['ml','Malayalam']].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select><small>{t(activity==='word'?'Practise words in this language. Playback and feedback use it too.':'Describe the picture in this language. Your feedback will use it too.')}</small></label>}
      {exercise?<>
       <ExerciseCamera key={`${selected}:${activity}:${routine}`} exerciseId={exercise[0]} disabled={!learner.consent?.practice_allowed||routineDone} paused={busy||routineDone||!!session?.completed_at} finished={routineDone} onProgress={setAnalysis} onStarted={()=>setCameraActive(true)} onStopped={()=>setCameraActive(false)}/>
       <div className={styles.exerciseSave}>
        <p role="status">{t('Set')} {round} / 3 · {t('Exercise')} {step+1} / 3 · {t('Repetitions')}: {routineDone?3:Math.min(analysis?.reps||0,3)} / 3</p>
        <progress max={27} value={routineDone?27:(round-1)*9+step*3+Math.min(analysis?.reps||0,3)} aria-label={t('Routine progress')}/>
        <p>{groups[activity].map((item,i)=><span key={item[0]} aria-current={i===step?'step':undefined} className={i===step?styles.currentExercise:''}>{t(item[1])}{i<2?' → ':''}</span>)}</p>
        {routineDone?<><h2>{t('Routine complete')}</h2><p>{t('All three exercises and three sets are saved for clinician review.')}</p><button className={shared.linkButton} onClick={()=>{setRound(1);setStep(0);setRoutineDone(false);setRoutine(crypto.randomUUID());startedStep.current=null;}}>{t('Start a new routine')}</button></>:
         <><p>{busy?t('Saving your set before the next exercise…'):analysis?.reps>=3&&!watched?t('Finish watching the demonstration to continue.'):t('Complete three repetitions. The next exercise opens automatically.')}</p>{error&&!session&&cameraActive&&<button className={shared.linkButton} disabled={busy} onClick={start}>{t('Retry')}</button>}{error&&session&&<button className={shared.linkButton} disabled={busy||!watched||!analysis?.reps} onClick={saveAndAdvance}>{t('Retry saving and continue')}</button>}<small>{t('Your camera stays on between exercises. Return to rest between repetitions. You can stop at any time.')}</small></>}
       </div>
      </>:!session?<><h2>{t('Ready when you are')}</h2><p>{t('Start an activity, record your attempt and save it for review.')}</p><button className={shared.linkButton} onClick={start} disabled={busy||!learner.consent?.practice_allowed||activity==='picture'&&!learner.consent?.cloud_processing_allowed}>{busy?t('Preparing your activity…'):activity==='picture'?t('Generate a new picture'):t('Start this activity')}</button>{activity==='picture'&&!learner.consent?.cloud_processing_allowed&&<p>{t('Enable cloud processing in Family Hub to generate an AI picture.')}</p>}</>:
       session.content.state==='generating'?<><p role="status">{t('Your picture is being generated. Check again in a moment.')}</p><button onClick={start} disabled={busy}>{t('Check picture')}</button></>:
       session.completed_at?<><h2>{t('Activity saved')}</h2><p>{record?.audio_retained?t('Your recording is saved for clinician review.'):t('Audio was not retained on the server.')}</p><button onClick={next}>{t('Try another')}</button></>:
       <><h2>{t('Your turn')}</h2><RecordingStudio key={`${selected}:${session.id}:${session.language}:${session.content.expected_text}`} learner={{...learner,language:session.language}} disabled={busy} showSendButton={['picture','word'].includes(activity)} showFeedback={false} completionLabel={activity==='word'?'Saving your attempt…':'Checking your answer and preparing a reply…'} recognizeAudio={activity!=='picture'||!learner.consent?.cloud_processing_allowed||!learner.consent?.retain_audio_allowed} onBusyChange={setRecordingBusy} beforeRecord={()=>player.current?.pause()} task={activity==='picture'?'story':'word'} expectedText={session.content.expected_text} onRecorded={async data=>{setRecord(data);const saved=await complete(data);if(!saved)throw new Error('Your recording is kept. Retry to finish checking this activity.');}}/></>}
      {activity==='picture'&&session?.completed_at&&!session.content.answer_feedback&&<button disabled={busy} onClick={()=>complete()}>{busy?t('Checking your picture answer…'):t('Retry picture feedback')}</button>}
      {activity==='picture'&&session?.content.answer_feedback&&<section className={shared.panel} role="status" lang={session.language}>
       <h2>{t({matches_picture:'Your description matches the picture',needs_revision:'Some details need correction',unclear:'Could not check this answer clearly'}[session.content.answer_feedback.verdict])}</h2>
       <p>{session.content.answer_feedback.summary}</p>
       <h3>{t('What we heard')}</h3><p>{session.content.answer_feedback.heard_text}</p>
       {!!session.content.answer_feedback.strengths.length&&<><h3>{t('What went well')}</h3><ul>{session.content.answer_feedback.strengths.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
       {!!session.content.answer_feedback.improvements.length&&<><h3>{t('How to improve')}</h3><ul>{session.content.answer_feedback.improvements.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
       {session.content.answer_feedback.example_sentence&&<><h3>{t('Try this sentence')}</h3><p>{session.content.answer_feedback.example_sentence}</p><button disabled={busy} onClick={()=>speak(session.content.answer_feedback.example_sentence)}>{t('Hear the example')}</button></>}
       {session.content.answer_feedback.practice_word&&<p><strong>{t('Word to practise')}:</strong> {session.content.answer_feedback.practice_word}</p>}
       {reference&&<audio ref={player} controls autoPlay src={reference}/>}
       <small>{t('This checks picture details and sentences. It does not establish pronunciation correctness.')}</small>
      </section>}
      {!exercise&&speechFeedback&&<section className={shared.panel} role="status" lang={session?.language||answerLanguage}><WordRecognition expected={session?.content.expected_text} heard={record?.transcript||session?.content.recognized_words} language={session?.language||answerLanguage}/><h2>{t(practiceFeedbackTitle(speechFeedback.state,session?.content.expected_text,record?.transcript||session?.content.recognized_words))}</h2>{!(speechFeedback.state==='insufficient_evidence'&&wordRecognition(session?.content.expected_text,record?.transcript||session?.content.recognized_words)==='different_word')&&<p>{speechFeedback.summary}</p>}<h3>{t('How to improve')}</h3>{speechFeedback.teaching_plan?.map((item,index)=><p key={index}>{item.practice_tip}</p>)}{activity==='word'&&session?.completed_at&&<button disabled={busy} onClick={()=>{request.current=crypto.randomUUID();void start(session.content.expected_text);}}>{t('Try this word again')}</button>}</section>}
    </section>
  </div>}
  {!!history.length&&<details className={styles.history}><summary>{t('Saved guided activities')}</summary>{history.filter(item=>item.completed_at).slice(0,12).map(item=><p key={item.id}>{t(item.content.title)} · {item.content.expected_text} · {item.recording_id?t('Recording attached'):t('Video participation')}</p>)}</details>}
 </main></ProtectedRoute>;
}
