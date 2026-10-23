import {useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import RecordingStudio from './RecordingStudio';
import {practiceOutcome} from '../lib/childSpeechPractice';
import {wordRecognition} from '../lib/wordRecognition';
import useSpeechPlayer from '../hooks/useSpeechPlayer';
import ArticulationCoach from './ArticulationCoach';
import PronunciationResult from './PronunciationResult';
import styles from '../styles/student-studio.module.css';
export default function StudentWordPractice({learner,word,onClose,onBusyChange,onSaved,onCompleted}){
 const {t}=useLocale(),audio=useSpeechPlayer(learner.id,word.language,'',.85);
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [done,setDone]=useState(false);
 const [lastRecord,setLastRecord]=useState(null);
 async function recorded(record){setBusy(true);onBusyChange?.(true);setError('');try{
  const response=await portalApi(`/speaking-words/${word.id}/attempts`,{method:'POST',body:{recording_id:record.id},timeoutMs:60000});setResult(response.content);setLastRecord(record);
  const passed=practiceOutcome(response.content,'word',wordRecognition(word.word,record.transcript)==='different_word')==='offer_sentence';setDone(passed);await onSaved?.();
  if(passed)onCompleted?.(response.content);else void audio.speak(word.word);
 }catch(err){setError(err.message);}finally{setBusy(false);onBusyChange?.(false);}}
 return <section className={styles.card} aria-label={t('Word rehearsal')}><div className={styles.row}><h3 lang={word.language}>{word.word}</h3><button disabled={busy} onClick={()=>{audio.stop();onClose();}}>{t('Close')}</button></div>
  <p>{t('Hear the model, try once, then use the word in your next rehearsal.')}</p><button disabled={busy||audio.speaking} onClick={()=>audio.speak(word.word)}>{t('Hear the word')}</button><button onClick={audio.stop}>{t('Stop voice')}</button>
  {result&&<PronunciationResult content={result} record={lastRecord} expected={word.word} onHear={text=>audio.speak(text)} onStopSpeech={audio.stop}/>}
  {result?.teaching_plan?.[0]&&<ArticulationCoach word={word.word} phone={result.teaching_plan[0].expected_phone||''} age={learner.age} disabled={busy} onHear={(text,options)=>audio.speak(text,'maya',options?.slow?0.75:1)}/>}
  {!done&&<RecordingStudio key={attempt} learner={{...learner,language:word.language}} task="word" expectedText={word.word} maxDuration={20} quietFinishMs={1800} assessFeedback={false} showFeedback={false} beforeRecord={audio.stop} disabled={busy||audio.speaking} onBusyChange={onBusyChange} onRecorded={recorded}/>}
  {done?<p role="status">{t('That sounded clear. Take it into your next conversation.')}</p>:result&&<><p>{result.summary}</p>{result.teaching_plan?.slice(0,1).map(plan=><p key={plan.word}>{plan.practice_tip}</p>)}<button disabled={busy||audio.speaking} onClick={()=>{setResult(null);setAttempt(value=>value+1);}}>{t('Try again')}</button></>}
  {(error||audio.error)&&<p role="alert">{t(error||audio.error)}</p>}
 </section>;
}
