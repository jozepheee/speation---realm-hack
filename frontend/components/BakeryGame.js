import {createContext,useCallback,useEffect,useRef,useState} from 'react';
import Head from 'next/head';
import RecordingStudio from './RecordingStudio';
import {portalApi} from '../lib/portalApi';
import {wordRecognition} from '../lib/wordRecognition';
import App from '../vendor/bakery/App';
import {setLearnerScope} from '../vendor/bakery/game/storage';
export const BakerySpeech=createContext(null);
function Attempt({learner,attempt,onDone,onError,onCaptureStateChange,onLevelChange}){
 const [token,setToken]=useState(0);
 useEffect(()=>{setToken(1);},[]);
 return <div hidden><RecordingStudio learner={learner} task="word" expectedText={attempt.word} autoStartToken={token} assessFeedback={false} recognizeAudio={false} showFeedback={false} maxDuration={12} quietFinishMs={1800} minSignalRms={.001} onLevelChange={onLevelChange} onCaptureStateChange={onCaptureStateChange} onError={onError} onRecorded={async record=>{
  const assessment=await portalApi(`/recordings/${record.id}/maya-coaching`,{method:'POST',body:{mode:'practice',allow_model_audio:true,...(attempt.soundId?{practice_sound:attempt.soundId,practice_level:attempt.level}:{})},signal:attempt.controller.signal,timeoutMs:25000});
  const feedback=assessment.content;
  const status=feedback.state==='no_clear_difference'&&!feedback.concerns?.length&&wordRecognition(attempt.word,record.transcript)!=='different_word'?'correct':feedback.state==='tentative_observation'?'missed':'uncertain';
  onDone({status,heardOptions:record.transcript?[record.transcript]:[],soundSwap:feedback.concerns?.[0]?.produced_phone||null,feedback});
 }}/></div>;
}
export default function BakeryGame({learner}){
 setLearnerScope(learner.id+':'+learner.language);
 const pending=useRef(null),[attempt,setAttempt]=useState(null),[error,setError]=useState('');
 const [captureState,setCaptureState]=useState('idle');
 const [inputLevel,setInputLevel]=useState(0);
 const cancel=useCallback(()=>{const prior=pending.current;pending.current=null;prior?.controller.abort();prior?.resolve({status:'cancelled',heardOptions:[]});setAttempt(null);},[]);
 const finish=useCallback((identifier,result)=>{const prior=pending.current;if(prior?.id!==identifier)return;pending.current=null;prior.resolve(result);setAttempt(null);},[]);
 const listen=useCallback((word,soundId,level='word')=>{if(pending.current)return Promise.resolve({status:'busy',heardOptions:[]});setError('');return new Promise(resolve=>{const row={id:crypto.randomUUID(),word,soundId,level,resolve,controller:new AbortController()};pending.current=row;setAttempt(row);});},[]);
 useEffect(()=>()=>{const prior=pending.current;pending.current=null;prior?.controller.abort();prior?.resolve({status:'cancelled',heardOptions:[]});},[learner.id]);
 const allowed=learner.consent?.practice_allowed&&learner.consent?.cloud_processing_allowed&&learner.consent?.retain_audio_allowed;
 if(!allowed)return <section role="status" translate="no"><h1>Speech bakery</h1><p>Enable speech practice, cloud processing and private recording retention in your learner settings to use audio feedback.</p><a href="/family">Learner settings</a></section>;
 return <div translate="no" lang={learner.language} className="bakery-page" style={{position:'fixed',inset:0,zIndex:90,overflow:'auto'}}>
  <Head><title>The Speakery · Speation</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&display=swap"/></Head>
  <a className="bakery-exit" href="/journey">← Speation</a>
  <BakerySpeech.Provider value={{listen,cancel,captureState:attempt?captureState:'idle',inputLevel:attempt?inputLevel:0,practiceLevel:attempt?.level}}><App/></BakerySpeech.Provider>
  {attempt&&<Attempt key={attempt.id} learner={learner} attempt={attempt} onLevelChange={setInputLevel} onCaptureStateChange={setCaptureState} onDone={result=>finish(attempt.id,result)} onError={message=>{if(pending.current?.id!==attempt.id)return;setError(message);finish(attempt.id,{status:message.includes('No microphone signal')?'no_audio':'error',heardOptions:[]});}}/>}
  {error&&<div role="alert" className="bakery-service-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
 </div>;
}
