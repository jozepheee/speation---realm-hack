import {useState,useRef,useEffect} from 'react';
import RecordingStudio from './RecordingStudio';
import PronunciationResult from './PronunciationResult';
import ArticulationCoach from './ArticulationCoach';
import {pronunciationResult} from '../lib/pronunciationResult';
import {supportedContrast} from '../lib/supportedContrast';
import {saveLearningEvent} from '../lib/learningSessionClient';
import {boundedOperation} from '../lib/boundedOperation';
export default function LessonSpeechPractice({learner,scope,session,target,onHear,onStopSpeech,onBeforeRecord,onBusyChange,onFeedback,onAttemptResult,disabled=false,modelSource='maya',demonstrationId=null,onComplete}){
 const [phase,setPhase]=useState('word'),[expected,setExpected]=useState(target),[record,setRecord]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[turn,setTurn]=useState(0),[finished,setFinished]=useState(false),[speaking,setSpeaking]=useState(false),[sentence,setSentence]=useState(''),[capturing,setCapturing]=useState(false);
 const pending=useRef(null),attempts=useRef(0),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;onStopSpeech?.();};},[]);
 useEffect(()=>{onBusyChange?.(busy||speaking||capturing);return()=>onBusyChange?.(false);},[busy,speaking,capturing]);
 async function save(value){setBusy(true);setError('');pending.current=value;try{
  await saveLearningEvent(scope,session,{action:'practice_attempt',index:session.position||0,recording_id:value.id,phase,expected_text:expected,model_source:modelSource,demonstration_id:demonstrationId});
  if(!active.current)return;pending.current=null;setRecord(value);setResult(value.coaching?.content||{state:'insufficient_evidence',concerns:[],summary:value.coaching_error||'The audio check was unavailable.'});attempts.current++;if(value.coaching)onFeedback?.(value.coaching);
  const observation=pronunciationResult(value.coaching?.content,expected),first=observation.concerns[0],contrast=first&&supportedContrast(value.coaching?.content,first.word);setSpeaking(true);try{await boundedOperation(onHear(observation.noSpecificDifference?(learner.language==='ml'?'വാക്ക് സൂക്ഷിച്ചു. പ്രത്യേക വ്യത്യാസം കണ്ടെത്തിയില്ല. തുടരാം.':'Your word is saved. No specific difference was flagged. You can continue.'):observation.state==='clear'?(learner.language==='ml'?'നന്നായി കേട്ടു! ഒരു വാക്യത്തിൽ പറയണോ, അതോ ഇവിടെ നിർത്തണോ?':'That sounded clear! You can try a sentence or finish.'):observation.state==='practice'?(contrast?.speech||value.coaching?.content?.teaching_plan?.[0]?.practice_tip||(learner.language==='ml'?'നമുക്ക് ഒരുമിച്ച് പറയാം. ആദ്യം കേൾക്കൂ, പിന്നെ പറയൂ.':'Let’s try one word together. Listen to the example, then try once more.')):(learner.language==='ml'?'വ്യക്തമായി പരിശോധിക്കാനായില്ല. വീണ്ടും ശ്രമിക്കാം, അല്ലെങ്കിൽ ഇവിടെ നിർത്താം.':'I could not check that clearly. You can try again or finish.')),{timeoutMs:15000});}catch{setError('Your result is saved. Maya’s voice could not play.');}finally{if(active.current)setSpeaking(false);}
  if(active.current)await onAttemptResult?.(value);
 }catch(err){if(active.current)setError('Your recording is kept. Retry saving the lesson link: '+err.message);}finally{if(active.current)setBusy(false);}}
 async function hear(){setSpeaking(true);try{onStopSpeech?.();if(await onHear(expected)===false)throw Error('Audio could not play. Please retry.');}catch(err){setError(err.message);}finally{setSpeaking(false);}}
 const summary=pronunciationResult(result,expected),concern=summary.concerns[0];
 if(finished)return <section lang={learner.language} translate="no" aria-label="Speaking practice complete"><h3>All done for now!</h3><p>Your attempts are saved. Take this word into your next conversation.</p></section>;
 return <section lang={learner.language} translate="no" aria-label="Try it in your own voice"><fieldset disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}><h2>{phase==='word'?'Your turn':'Use it in a sentence'}</h2><p>{expected}</p><button disabled={busy||speaking} onClick={hear}>Hear my example</button>
 {!record&&!pending.current&&<RecordingStudio key={turn} draftScope={scope} learner={learner} task={phase} expectedText={expected} maxDuration={phase==='word'?20:30} showFeedback={false} readFeedback={false} showSendButton disabled={disabled||busy||speaking} beforeRecord={async()=>{onStopSpeech?.();await onBeforeRecord?.();}} onBusyChange={setCapturing} onRecorded={save}/>}
 {pending.current&&<button disabled={busy} onClick={()=>save(pending.current)}>Retry saving my attempt</button>}
 {record&&<PronunciationResult content={result} record={record} expected={expected} onHear={onHear} onStopSpeech={onStopSpeech} disabled={busy||speaking} onRetry={()=>{onStopSpeech?.();setRecord(null);setResult(null);setTurn(value=>value+1);}}/>}
 {concern&&<ArticulationCoach word={concern.word} phone={concern.expected_phone||''} produced={concern.produced_phone||''} contrast={supportedContrast(result,concern.word)} cameraSupport={result.camera_support} age={learner.age} onHear={onHear} disabled={busy||speaking}/>}
 {record&&summary.state==='clear'&&phase==='word'&&<div><h3>Want to try it in a sentence?</h3><label>Your sentence<input maxLength={300} value={sentence} placeholder={`I can say ${target}.`} onChange={e=>setSentence(e.target.value)}/></label><button disabled={busy||!sentence.trim().toLowerCase().includes(target.toLowerCase())} onClick={()=>{setExpected(sentence.trim());setPhase('sentence');setRecord(null);setResult(null);setTurn(value=>value+1);}}>Yes, try my sentence</button></div>}
 {record&&attempts.current>=3&&summary.state!=='clear'&&<p>You can take a break, replay the model or finish. You don’t have to keep repeating.</p>}
 <button disabled={busy||capturing||speaking} onClick={async()=>{onStopSpeech?.();setBusy(true);try{await onComplete?.();setFinished(true);}catch(err){setError(err.message);}finally{setBusy(false);}}}>{record&&summary.state==='clear'?'Finish for now':'Skip or finish practice'}</button>
 {error&&<p role="alert">{error}</p>}</fieldset></section>;
}
