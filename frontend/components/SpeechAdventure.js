import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useLocale} from '../context/LocaleContext';
import VoiceGameTurn from './VoiceGameTurn';
import styles from '../styles/speech-adventure.module.css';
const World=dynamic(()=>import('./AdventureWorld3D'),{ssr:false});
export default function SpeechAdventure({game,challenge,learner,busy,quiet,sessionId,onVoiceOutcome}){
 const {t}=useLocale();const [paused,setPaused]=useState(false),[flight,setFlight]=useState(null),[available,setAvailable]=useState(true);
 const pending=useRef(null),latest=useRef(onVoiceOutcome);latest.current=onVoiceOutcome;
 function arrive(){const outcome=pending.current;if(!outcome)return;pending.current=null;setFlight(null);latest.current(outcome);}
 useEffect(()=>{if(available||!flight||paused)return;const timer=setTimeout(arrive,quiet?180:1200);return()=>clearTimeout(timer);},[available,flight,paused,quiet]);
 function outcome(result){pending.current=result;setFlight({id:result.recording_id,index:result.result?.choice??challenge.id%3,order:result.result?.order});}
 const names=['Forest','Ocean','Moon'].map(t);
 return <div className={styles.adventure}>
  <div className={`${styles.world} ${game==='story'?styles.night:''}`}>
   {available?<World game={game} challenge={challenge} names={names} flight={flight} paused={paused} quiet={quiet} onArrive={arrive} onUnavailable={()=>setAvailable(false)} label={t('Use your voice to move through this world.')}/>:<div className={styles.noWebGL}><strong>{t('Your voice adventure is still available')}</strong><p>{t('3D graphics are unavailable on this device. Speech practice and saved progress still work.')}</p></div>}
   <span className={styles.worldLabel}>{t(game==='listening'?'ECHO ISLANDS':game==='syllable'?'SYLLABLE SKYBRIDGE':'STORY CONSTELLATION')}</span>
   <button className={styles.pause} onClick={()=>setPaused(value=>!value)}>{paused?t('Resume'):t('Pause')}</button>
   {flight&&<span className={styles.travelLabel} role="status">{t(game==='listening'?'Sailing to your word…':game==='syllable'?'Crossing your syllable bridge…':'Exploring your story…')}</span>}
  </div>
  <div className={styles.playControls}><VoiceGameTurn game={game} challenge={challenge} sessionId={sessionId} learner={learner} disabled={busy||paused||!!flight} onOutcome={outcome}/>
   <p className={styles.practiceNote}>{t(game==='listening'?'Listening and word recognition':game==='syllable'?'Word structure and sound sequencing':'Storytelling and everyday expression')} · {learner.language.toUpperCase()}</p>
  </div>
 </div>;
}
