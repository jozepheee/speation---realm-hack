import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import StudentWordPractice from './StudentWordPractice';
import AttemptReplay from './AttemptReplay';
import useSpeechPlayer from '../hooks/useSpeechPlayer';
import styles from '../styles/student-studio.module.css';

export default function RehearsalRetry({learner,session,onUpdated,onBusyChange}){
 const {t}=useLocale(),originals=session.content.turns.filter(turn=>!turn.retry_of);
 const [selected,setSelected]=useState(originals[0]?.recording_id||''),[wordText,setWordText]=useState(session.content.support?.target_word||''),[word,setWord]=useState(null),[stage,setStage]=useState('choose'),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const mounted=useRef(true),request=useRef(null),audio=useSpeechPlayer(learner.id,session.language);
 useEffect(()=>{onBusyChange?.(busy||recording||audio.speaking);return()=>onBusyChange?.(false);},[busy,recording,audio.speaking,onBusyChange]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
 const original=originals.find(turn=>turn.recording_id===selected),step=session.content.steps[original?.position];
 const suggestions=(original?.sound_check?.concerns||[]).filter(c=>c.word?.trim());
 if(!original)return null;
 async function prepareWord(value){setBusy(true);setError('');request.current=new AbortController();try{
  const saved=await portalApi(`/learners/${learner.id}/speaking-words`,{method:'POST',body:{word:value.trim(),language:session.language,context:original.heard.slice(0,600)},signal:request.current.signal});
  if(mounted.current){setWord(saved);setWordText(value);setStage('word');}
 }catch(err){if(mounted.current&&err.name!=='AbortError')setError(err.message);}finally{if(mounted.current)setBusy(false);}}
 async function recorded(record){setBusy(true);setError('');request.current=new AbortController();try{
  const row=await portalApi(`/speaking-rehearsals/${session.id}/retry`,{method:'POST',body:{original_recording_id:original.recording_id,recording_id:record.id,support_used:word?`Guided word practice: ${word.word}`:'Reviewed original feedback and answer outline'},signal:request.current.signal,timeoutMs:45000});
  if(mounted.current){onUpdated(row);setStage('done');setAttempt(n=>n+1);}
 }catch(err){if(mounted.current&&err.name!=='AbortError')setError(err.message);}finally{if(mounted.current)setBusy(false);}}
 return <section className={styles.card} aria-label={t('Practise and retry the same answer')}>
  <h3>{t('One focused practice. Then try your answer again.')}</h3>
  <label>{t('Choose the answer to work on')}<select disabled={busy||recording} value={selected} onChange={e=>{audio.stop();setSelected(e.target.value);setStage('choose');setWord(null);setWordText('');}}>{originals.map((turn,i)=><option key={turn.recording_id} value={turn.recording_id}>{i+1}. {session.content.steps[turn.position]?.prompt}</option>)}</select></label>
  <blockquote><strong>{step?.prompt}</strong><p>{original.heard}</p></blockquote><AttemptReplay key={original.recording_id} id={original.recording_id} disabled={busy||recording} onBeforePlay={audio.stop}/>
  <p><strong>{t('One thing to try')}: </strong>{original.feedback?.suggestion||t('Explain one main idea, then add a concrete example.')}</p>
  {stage==='choose'&&<><p>{t('Choose a useful word yourself, or confirm a tentative audio suggestion. You can also work on the complete answer without a word drill.')}</p>
   {suggestions.map(c=><button key={c.word} disabled={busy} onClick={()=>prepareWord(c.word)}>{t('I meant')} “{c.word}” · {t('Practise')}</button>)}
   <label>{t('A word I want to practise')}<input maxLength={100} value={wordText} onChange={e=>setWordText(e.target.value)}/></label><button disabled={busy||!wordText.trim()} onClick={()=>prepareWord(wordText)}>{t('Hear and practise this word')}</button>
   <button disabled={busy} onClick={()=>setStage('answer')}>{t('Work on my complete answer')}</button></>}
  {stage==='word'&&word&&<><StudentWordPractice key={word.id} learner={learner} word={word} onBusyChange={setRecording} onClose={()=>setStage('answer')} onCompleted={()=>{}}/>
   <button disabled={recording} onClick={()=>{audio.stop();setStage('answer');}}>{t('Return to this question and try my answer')}</button></>}
  {stage==='answer'&&<><h4>{t('Same question. A fresh answer.')}</h4><p>{t('Keep your own meaning. Use the word or explanation you just practised; there is no need to rush.')}</p>
   {original.feedback?.example&&<details><summary>{t('Example structure, not a script to copy')}</summary><p>{original.feedback.example}</p></details>}
   <RecordingStudio key={`${selected}:${attempt}`} rehearsalMode manualFinish showSendButton draftScope={`rehearsal-retry:${session.id}:${selected}`} learner={{...learner,language:session.language}} preferredProvider={session.content.recognition_provider} task="conversation" maxDuration={178} assessFeedback={false} showFeedback={false} beforeRecord={audio.stop} disabled={busy} onBusyChange={setRecording} onRecorded={recorded}/>
  </>}
  {stage==='done'&&<><p role="status">{t('Your original and retry are saved below. Compare the evidence; a changed number alone is not proof of improvement.')}</p><button onClick={()=>setStage('choose')}>{t('Choose another practice')}</button></>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
