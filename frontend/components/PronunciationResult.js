import {useEffect,useRef} from 'react';
import {pronunciationResult} from '../lib/pronunciationResult';
import {supportedContrast} from '../lib/supportedContrast';
import AttemptReplay from './AttemptReplay';
import styles from '../styles/pronunciation-result.module.css';
export default function PronunciationResult({content,record,expected,onHear,onRetry,onStopSpeech,disabled=false}){
 const result=pronunciationResult(content,expected),panel=useRef(null);
 useEffect(()=>{panel.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[record?.id]);
 return <section ref={panel} lang="en" translate="no" className={`${styles.result} ${styles[result.state]}`} aria-label="Your pronunciation result" aria-live="polite">
  <div className={styles.heading}><span>YOUR SPEAKING RESULT</span><h2>{result.title}</h2></div>
  <p>{result.explanation}</p>
  <p><strong>Your line:</strong> {expected}</p>
  {record?.transcript&&<details><summary>Words the recognizer wrote</summary><p>{record.transcript}</p><small>Recognition can tidy up sounds. The recording is assessed separately.</small></details>}
  {!!result.concerns.length&&<ul className={styles.words}>{result.concerns.map(item=>{
   const contrast=supportedContrast(content,item.word);
   return <li key={item.word.toLowerCase()}><h3>{item.word}</h3>
    {contrast?<p>Possible heard word: <strong>{contrast.heard}</strong> → try <strong>{contrast.expected}</strong></p>:<p>{item.observation||'Let’s listen to this word and try it once more.'}</p>}
    {item.expected_phone&&<p>Target sound: /{item.expected_phone}/{item.produced_phone&&item.produced_phone!==item.expected_phone?` · Possible heard sound: /${item.produced_phone}/`:''}</p>}
    <button disabled={disabled} onClick={()=>onHear?.(item.word)}>Hear “{item.word}”</button>
   </li>;
  })}</ul>}
  {!!result.unflagged.length&&result.state==='practice'&&<details><summary>Other words: no individual correctness verdict</summary><p>{result.unflagged.join(' · ')}</p><small>No flagged difference does not prove that every sound was correct.</small></details>}
  {content?.summary&&<details><summary>Assessment details</summary><p>{content.summary}</p></details>}
  <div className={styles.actions}>{onRetry&&<button disabled={disabled} onClick={onRetry}>{result.state==='clear'?'Try the line again':'Try again with Maya'}</button>}
  {record?.audio_retained&&<AttemptReplay id={record.id} disabled={disabled} onBeforePlay={onStopSpeech}/>}</div>
 </section>;
}
