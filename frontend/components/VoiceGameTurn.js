import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import styles from '../styles/speech-adventure.module.css';

export default function VoiceGameTurn({game,challenge,sessionId,learner,disabled,onOutcome}){
 const {t}=useLocale();const [feedback,setFeedback]=useState(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 const player=useRef(null),alive=useRef(true),request=useRef(new AbortController());
 useEffect(()=>{alive.current=true;if(request.current.signal.aborted)request.current=new AbortController();return()=>{alive.current=false;request.current.abort();player.current?.pause();};},[]);
 async function play(audio){
  player.current?.pause();const clip=new Audio(audio);player.current=clip;
  await new Promise(resolve=>{clip.onended=resolve;clip.onerror=resolve;clip.onpause=resolve;clip.play().catch(resolve);});
 }
 async function say(text){
  try{const speech=await portalApi(`/learners/${learner.id}/speak`,{method:'POST',body:{text,language:learner.language},signal:request.current.signal,timeoutMs:30000});
   if(alive.current)await play(`data:audio/mpeg;base64,${speech.audio_base64}`);
  }catch(err){if(alive.current)setError(err.message);}
 }
 async function hear(){
  setError('');
  if(game==='listening')await play(`data:audio/mpeg;base64,${challenge.audio_base64}`);
  else await say(game==='story'?challenge.prompt:challenge.word);
 }
 async function recorded(record){
  setWorking(true);setError('');
  try{
   const outcome=await portalApi(`/games/${sessionId}/voice-answer`,{method:'POST',body:{challenge:challenge.id,recording_id:record.id,request_id:record.id},signal:request.current.signal,timeoutMs:65000});
   if(!alive.current)return;
   setFeedback(outcome);
   const cue=outcome.advanced?outcome.feedback:outcome.content?.teaching_plan?.[0]?.practice_tip||outcome.feedback;
   await say(cue);
   if(alive.current&&outcome.advanced)onOutcome(outcome);
  }finally{if(alive.current)setWorking(false);}
 }
 return <div className={styles.story}>
  <button className={styles.primary} disabled={disabled||working} onClick={hear}>{t('Hear the challenge')}</button>
  <p>{game==='story'?t('Tell your story aloud. Your words move the adventure.'):t('Listen, then say the word aloud. Speak “skip” if you want to move on.')}</p>
  {game==='syllable'&&<h3 lang={learner.language}>{challenge.word}</h3>}
  {game==='story'&&<h3 lang={learner.language}>{challenge.prompt}</h3>}
  <RecordingStudio key={challenge.id} assessFeedback={false} compact autoSubmit beforeRecord={()=>player.current?.pause()} disabled={disabled||working} maxDuration={20} quietFinishMs={game==='story'?3000:1600} learner={learner} task={game==='story'?'story':'word'} expectedText={game==='syllable'?challenge.word:''} onRecorded={recorded}/>
  {feedback&&<div role="status" lang={learner.language}><p>{feedback.feedback}</p>{!feedback.advanced&&feedback.content?.teaching_plan?.[0]&&<p>{feedback.content.teaching_plan[0].practice_tip}</p>}</div>}
  {error&&<p role="alert">{t(error)}</p>}
 </div>;
}
