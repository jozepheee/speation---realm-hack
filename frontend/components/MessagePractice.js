import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {portalApi,privateAudio} from '../lib/portalApi';
import {messageWords} from '../lib/messagePractice';
import {childSpeechPractice,practiceOutcome,childPracticeResult} from '../lib/childSpeechPractice';
import {practiceFeedbackTitle,wordRecognition} from '../lib/wordRecognition';
import {supportedContrast} from '../lib/supportedContrast';
import {correctionTarget,selfCheckPrompt} from '../lib/correctionFlow';
import ArticulationCoach from './ArticulationCoach';
import RecordingStudio from './RecordingStudio';
import WordRecognition from './WordRecognition';
import AttemptReplay from './AttemptReplay';
import styles from '../styles/workspace.module.css';

export default function MessagePractice({learner,draftScope='',translation,onResume,onBusyChange,onStart,messagePlaying=false,autoStart=false,onHear,onStopSpeech,autoListen=false,onFeedback,onCompare}) {
 const {t}=useLocale();
 const [analysis,setAnalysis]=useState(null),[target,setTarget]=useState(null),[phase,setPhase]=useState('word');
 const [feedback,setFeedback]=useState(null),[attempt,setAttempt]=useState(null),[history,setHistory]=useState([]),[saved,setSaved]=useState([]);
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[recordingBusy,setRecordingBusy]=useState(false),[error,setError]=useState(''),[turn,setTurn]=useState(0);
 const generation=useRef(0),request=useRef(null),audio=useRef(null),audioVersion=useRef(0);
 const [speaking,setSpeaking]=useState(false),autoStarted=useRef(null);
 const [outcome,setOutcome]=useState('retry');
 const [autoRecord,setAutoRecord]=useState(0),retries=useRef(0),externalSpeaking=useRef(false);
 const playedCue=useRef('');
 const [needsReady,setNeedsReady]=useState(false),[eventBusy,setEventBusy]=useState(false);
 const readyEvent=useRef(null),sourceProposal=useRef(null);
 const language=translation?.provenance.language||learner.language;
 const available=messageWords(translation?.confirmed_text);
 const expected=phase==='word'?target?.word:target?.sentence;
 useEffect(()=>{onBusyChange?.(busy||eventBusy||recordingBusy||speaking);return()=>onBusyChange?.(false);},[busy,eventBusy,recordingBusy,speaking,onBusyChange]);
 function stopAudio(){audioVersion.current++;audio.current?.pause();if(externalSpeaking.current){externalSpeaking.current=false;onStopSpeech?.();}setSpeaking(false);}
 async function hear(text,listenAfter=false,slow=false){
  stopAudio();const version=audioVersion.current,current=generation.current;
  playedCue.current='';
  setSpeaking(true);
  try{if(onHear){externalSpeaking.current=true;const played=await onHear(text,{slow});if(played===false)throw Error('Audio playback failed. Please try again.');}
  else{const result=await portalApi(`/learners/${learner.id}/speak`,{method:'POST',body:{text,language},signal:request.current.signal,timeoutMs:30000});
   if(current!==generation.current||version!==audioVersion.current)return;
   const clip=new Audio(`data:audio/mpeg;base64,${result.audio_base64}`);audio.current=clip;clip.playbackRate=.85;
   await new Promise((resolve,reject)=>{clip.onended=resolve;clip.onpause=resolve;clip.onerror=()=>reject(new Error('Audio playback failed. Please try again.'));clip.play().catch(reject);});}
   if(current===generation.current&&version===audioVersion.current){playedCue.current=text.slice(0,500);if(listenAfter&&autoListen)setAutoRecord(value=>value+1);}
  }catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}
  finally{externalSpeaking.current=false;if(current===generation.current&&version===audioVersion.current)setSpeaking(false);}
 }
 async function check(){
  if(!translation)return;const current=generation.current;setChecking(true);setError('');
  try{const result=await portalApi(`/translations/${translation.id}/practice-feedback`,{method:'POST',body:{},signal:request.current.signal,timeoutMs:60000});if(current===generation.current){setAnalysis(result);onFeedback?.(result);}}
  catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(current===generation.current)setChecking(false);}
 }
 useEffect(()=>{
  generation.current++;request.current?.abort();request.current=new AbortController();stopAudio();
  setAnalysis(null);setTarget(null);setFeedback(null);setAttempt(null);setHistory([]);setPhase('word');setError('');setBusy(false);setChecking(false);setRecordingBusy(false);setSaved([]);setOutcome('retry');setNeedsReady(false);setEventBusy(false);readyEvent.current=null;sourceProposal.current=null;
  const current=generation.current,signal=request.current.signal;
  portalApi(`/learners/${learner.id}/message-practice`,{signal}).then(rows=>{if(current===generation.current)setSaved(rows);}).catch(err=>{if(current===generation.current&&err.name!=='AbortError')setError(err.message);});
  if(translation){
   portalApi(`/translations/${translation.id}/practice-attempts`,{signal}).then(rows=>{if(current===generation.current)setHistory(rows);}).catch(()=>{});
   if(learner.consent?.cloud_processing_allowed&&learner.consent?.retain_audio_allowed&&translation.confirmed_text.length<=300)void check();
  }
  return()=>{generation.current++;request.current?.abort();stopAudio();};
 },[learner.id,learner.language,translation?.id]);
 useEffect(()=>{if(messagePlaying)stopAudio();},[messagePlaying]);
 useEffect(()=>{
  if(!autoStart||messagePlaying||!analysis?.suggested_words?.length||target||busy||autoStarted.current===translation?.id)return;
  autoStarted.current=translation.id;void choose(analysis.suggested_words[0]);
 },[autoStart,messagePlaying,analysis,target,busy,translation?.id]);
 function demonstration(word,result=analysis?.content,unclear=false){
  const plan=result?.teaching_plan?.find(item=>item.word===word),concern=result?.concerns?.find(item=>item.word===word);
  const model=childSpeechPractice(language,word,plan?.expected_phone||concern?.expected_phone,unclear,retries.current);
  const contrast=language==='en'?supportedContrast(result,word):null;
  return {...model,speech:[contrast?.speech,model.speech].filter(Boolean).join(' ')};
 }
 async function choose(word){
  const current=generation.current;setBusy(true);setError('');stopAudio();
  try{await onStart?.();const result=await portalApi(`/translations/${translation.id}/practice-words`,{method:'POST',body:{word},signal:request.current.signal});
   if(current!==generation.current)return;retries.current=0;setTarget(result);setPhase('word');setFeedback(null);setAttempt(null);setOutcome('retry');setTurn(value=>value+1);const gated=language==='en'&&correctionTarget(analysis?.content,word);setNeedsReady(!!gated);readyEvent.current=null;sourceProposal.current=analysis?.id;void hear(demonstration(word).speech,!gated);
  }catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(current===generation.current)setBusy(false);}
 }
 async function recorded(record){
  const current=generation.current;setBusy(true);setError('');setAttempt(record);
  try{const result=await portalApi(`/translations/${translation.id}/practice-attempts`,{method:'POST',body:{recording_id:record.id,word:target.word,phase,preceding_cue:playedCue.current,correction_event_id:readyEvent.current?.id||null},signal:request.current.signal,timeoutMs:60000});
   if(current!==generation.current)return;readyEvent.current=null;sourceProposal.current=result.id;setFeedback(result.content);onFeedback?.(result);setHistory(rows=>[result,...rows.filter(item=>item.id!==result.id)]);
   let next=practiceOutcome(result.content,phase,wordRecognition(expected,record.transcript)==='different_word');
   if(next==='offer_sentence'&&target.sentence===target.word)next='finished';
   retries.current=next==='retry'?retries.current+1:0;if(retries.current>=3)next='offer_break';setOutcome(next);const gated=language==='en'&&next==='retry'&&correctionTarget(result.content,target.word);setNeedsReady(!!gated);
   if(next==='offer_break')void hear(t('Want to try another way, or finish for now?'));
   else void hear(next==='retry'?(language==='en'&&result.content.state==='tentative_observation'&&result.content.concerns?.some(item=>item.produced_phone)&&!supportedContrast(result.content,target.word)?'Oops, that sounded a little different! Let’s try together. ':'')+demonstration(expected,result.content,result.content.state==='insufficient_evidence').speech:childPracticeResult(language,next),next==='retry'&&!gated);
  }catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);throw err;}
  finally{if(current===generation.current)setBusy(false);}
 }
 function nextPhase(value){stopAudio();if(value!==phase)retries.current=0;setPhase(value);setAttempt(null);setOutcome('retry');setTurn(value=>value+1);const gated=value===phase&&language==='en'&&correctionTarget(feedback||analysis?.content,target.word);setNeedsReady(!!gated);readyEvent.current=null;void hear(demonstration(value==='word'?target.word:target.sentence).speech,!gated);}
 async function saveAction(action,selfCheck=null){
  const result=await portalApi(`/translations/${translation.id}/correction-events`,{method:'POST',body:{request_id:crypto.randomUUID(),word:target.word,phase,action,self_check:selfCheck,source_proposal_id:sourceProposal.current||null},signal:request.current.signal});
  return result;
 }
 async function act(action){
  const current=generation.current;setEventBusy(true);setError('');stopAudio();
  try{
   const event=await saveAction(action,action==='ready'?(learner.age>=16?'yes':'ready'):action==='not_sure'?'not_sure':null);
   if(current!==generation.current)return;
   if(action==='ready'){readyEvent.current=event;setNeedsReady(false);setAutoRecord(value=>value+1);}
   else if(action==='show_again'||action==='not_sure')void hear(demonstration(expected,feedback||analysis?.content).speech,false,true);
   else if(action==='sentence_yes')nextPhase('sentence');
   else {setNeedsReady(false);setOutcome('finished');void hear(childPracticeResult(language,'finished'));}
  }catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}
  finally{if(current===generation.current)setEventBusy(false);}
 }
 function finish(){void act(outcome==='offer_sentence'?'sentence_no':'finish');}
 async function familiarExample(){
  const current=generation.current;setBusy(true);setError('');stopAudio();
  try{const blob=await privateAudio(`/demonstrations/${target.demonstration.id}/media`,{signal:request.current.signal});if(current===generation.current)await onCompare?.({blob,target:target.word});}
  catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}finally{if(current===generation.current)setBusy(false);}
 }
 const different=wordRecognition(expected,attempt?.transcript)==='different_word';
 const blocked=busy||eventBusy||recordingBusy||speaking||messagePlaying;
 const model=target?demonstration(expected,feedback||analysis?.content,feedback?.state==='insufficient_evidence'):null;
 return <section className={styles.panel} aria-label={t('Practise words from your message')}>
  <h2>{t('Practise words from your message')}</h2>
  {checking&&<p role="status">{t('Checking the sounds in your recording…')}</p>}
  {translation&&<>
   {!target&&!!analysis?.suggested_words?.length&&<div>{analysis.suggested_words.slice(0,1).map(word=>{
    const concern=analysis.content?.concerns?.find(item=>item.word===word),plan=analysis.content?.teaching_plan?.find(item=>item.word===word);
    const simple=demonstration(word);
    return <div key={word} lang={language}><p>{simple.title}</p>{simple.hint&&<p>{simple.hint}</p>}<button className={styles.linkButton} disabled={blocked} onClick={()=>choose(word)}>{t('Practise {word}',{word})}</button><details><summary>{t('Sound details')}</summary><p>{concern?.observation}</p><p>{plan?.practice_tip||concern?.practice_tip}</p></details></div>;
   })}</div>}
   {!target&&analysis&&!analysis.suggested_words?.length&&<p>{analysis.content?.state==='no_clear_difference'?t('No clear sound difference heard'):t('This sound check was inconclusive. You can choose a word to practise.')}</p>}
   {!target&&<details><summary>{t('Choose a word to practise')}</summary><div className={styles.switches}>{available.map(word=><button className={styles.linkButton} key={word} disabled={blocked} onClick={()=>choose(word)} lang={language}>{word}</button>)}</div></details>}
   {target&&<section className={styles.panel}>
    {outcome!=='finished'&&<><p>{phase==='word'?t('Step 1 · Practise the word'):t('Step 2 · Use it in your sentence')}</p><h3 lang={language}>{expected}</h3></>}
    {outcome==='retry'&&<>
    {language==='en'&&<ArticulationCoach contrast={supportedContrast(feedback||analysis?.content,target.word)} cameraSupport={feedback?.camera_support} age={learner.age} word={target.word} phone={(feedback||analysis?.content)?.teaching_plan?.find(item=>item.word===target.word)?.expected_phone||(feedback||analysis?.content)?.concerns?.find(item=>item.word===target.word)?.expected_phone||target.target_sound||''} produced={feedback?.concerns?.find(item=>item.word===target.word)?.produced_phone||''} disabled={blocked} onHear={(text,options)=>hear(text,false,options?.slow)}/>}
    {language!=='en'&&model.hint&&<p lang={language}>{model.hint}</p>}
    <button className={styles.linkButton} disabled={blocked} onClick={()=>hear(model.speech)}>{t('Hear again')}</button>
    {target.demonstration&&onCompare&&<button lang="en" translate="no" disabled={blocked} onClick={familiarExample}>Watch my approved example</button>}
    {speaking&&<button className={styles.linkButton} onClick={stopAudio}>{t('Stop voice')}</button>}
    {needsReady&&<section lang="en" translate="no" aria-label="Articulation self-check" className={styles.panel}>
     <h3>{selfCheckPrompt(learner.age)}</h3>
     <div className={styles.switches}><button disabled={blocked} onClick={()=>act('ready')}>{learner.age>=16?'Yes, ready to try':'Ready — my turn'}</button><button disabled={blocked} onClick={()=>act('show_again')}>Show me again</button>{learner.age>=16&&<button disabled={blocked} onClick={()=>act('not_sure')}>Not sure — help me</button>}<button disabled={blocked} onClick={()=>act('skip')}>Skip for now</button></div>
     <small>Your answer helps Maya guide you. We check your next recording separately.</small>
    </section>}
    {!needsReady&&<><p role="status">{speaking||messagePlaying?t('Listen first…'):t('Your turn — tap the microphone.')}</p>
    <RecordingStudio draftScope={draftScope} key={`${translation.id}:${target.word}:${phase}:${turn}`} learner={{...learner,language}} task={phase} expectedText={expected} assessFeedback={false} showFeedback={false} showSendButton autoStartOnMount autoStartToken={autoRecord} beforeRecord={async()=>{stopAudio();await onStart?.();}} disabled={busy||eventBusy||speaking||messagePlaying||!learner.consent?.cloud_processing_allowed||!learner.consent?.retain_audio_allowed} onBusyChange={setRecordingBusy} onRecorded={recorded} maxDuration={20} quietFinishMs={phase==='word'?1800:3500}/></>}
    {!needsReady&&<button lang="en" translate="no" disabled={blocked} onClick={()=>act('skip')}>Skip this practice</button>}
    </>}
    {outcome==='offer_sentence'&&<div role="status"><p lang={language}>{childPracticeResult(language,'offer_sentence')}</p><div className={styles.switches}><button disabled={busy||eventBusy||recordingBusy||messagePlaying} onClick={()=>act('sentence_yes')}>{t('Yes, try a sentence')}</button><button className={styles.linkButton} disabled={busy||eventBusy||recordingBusy||messagePlaying} onClick={finish}>{t('No, finish for now')}</button></div></div>}
    {outcome==='offer_break'&&<div role="status"><p>{t('Want to try another way, or finish for now?')}</p>{target.demonstration&&onCompare&&<button lang="en" translate="no" disabled={blocked} onClick={familiarExample}>Watch my approved example</button>}<button disabled={blocked} onClick={()=>nextPhase(phase)}>{t('Try another way')}</button><button disabled={busy||eventBusy||recordingBusy||messagePlaying} onClick={finish}>{t('Finish for now')}</button></div>}
    {outcome==='finished'&&<div role="status"><h3>{t('Practice finished')}</h3><p lang={language}>{childPracticeResult(language,'finished')}</p></div>}
    {feedback&&attempt&&<div lang={language}>{outcome==='retry'&&<><h3>{feedback.state==='insufficient_evidence'?t('Let’s listen again'):t('Let’s try together')}</h3><p>{model.turn}</p><div className={styles.switches}><button className={styles.linkButton} disabled={blocked} onClick={()=>nextPhase(phase)}>{t('Try again')}</button><button className={styles.linkButton} disabled={busy||eventBusy||recordingBusy||messagePlaying} onClick={finish}>{t('Finish for now')}</button></div></>}<details><summary>{t('Sound details')}</summary><h4>{t(practiceFeedbackTitle(feedback.state,expected,attempt?.transcript))}</h4>{different&&<WordRecognition expected={expected} heard={attempt?.transcript} language={language}/>}<p>{feedback.summary}</p>{feedback.teaching_plan?.map((plan,index)=><p key={index}>{plan.practice_tip}</p>)}</details></div>}
   </section>}
   {attempt?.audio_retained&&<AttemptReplay key={attempt.id} id={attempt.id} disabled={busy||recordingBusy||messagePlaying||speaking} onBeforePlay={stopAudio} onPlayingChange={setSpeaking}/>}
   <details className={styles.recordingOptions}><summary>{t('Practice options')}</summary>
    <button className={styles.linkButton} disabled={checking||blocked||translation.confirmed_text.length>300||!learner.consent?.cloud_processing_allowed||!learner.consent?.retain_audio_allowed} onClick={check}>{t('Check the recording again')}</button>
    <button className={styles.linkButton} onClick={stopAudio}>{t('Stop voice')}</button>
    {target&&<details><summary>{t('Choose another word')}</summary><div className={styles.switches}>{available.map(word=><button className={styles.linkButton} key={word} disabled={blocked} onClick={()=>choose(word)}>{word}</button>)}</div></details>}
    {!!history.length&&<details><summary>{t('Saved practice attempts')}</summary>{history.map(item=><p key={item.id}>{item.request?.expected_text} · {t(item.content.state==='tentative_observation'?'Sound practice suggested':item.content.state==='no_clear_difference'?'No clear sound difference heard':'Sound check uncertain')}</p>)}</details>}
   </details>
  </>}
  {!!saved.filter(item=>item.language===language&&item.translation_id!==translation?.id).length&&<details open={!translation}><summary>{t('Continue saved word practice')}</summary><div className={styles.switches}>{saved.filter(item=>item.language===language&&item.translation_id!==translation?.id).map(item=><button className={styles.linkButton} key={item.translation_id} disabled={busy||recordingBusy} onClick={()=>onResume(item.translation_id)}>{item.words.map(target=>target.word).join(' · ')}</button>)}</div></details>}
  {error&&<p role="alert">{t(error)}</p>}
 </section>;
}
