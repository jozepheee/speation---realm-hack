import {useEffect,useRef,useState} from 'react';
import {movementFrame,tonguePath} from '../lib/articulationTimeline';
import {boundedOperation} from '../lib/boundedOperation';
import styles from '../styles/wordy.module.css';

export function ArticulationScene({plan,stage,progress}){
 const active=stage?.kind==='movement',frame=movementFrame(plan.movement,progress,active),ml=plan.language==='ml';
 const internal=['back','back_hold','front','front_hold','retroflex_gap','retroflex_contact','bunched','dental','air'].includes(plan.movement);
 return <div className={styles.scene}>
  {plan.supported?<svg viewBox="0 0 760 330" role="img" aria-label={plan.caption}>
   <title>{plan.caption}</title><rect x="0" y="0" width="760" height="330" rx="28" fill="#f4effb"/>
   <text x="190" y="35" textAnchor="middle" fontSize="17" fill="#5e478c">{ml?'ചുണ്ടുകളുടെ കാഴ്ച':'Front view'}</text>
   <ellipse cx="190" cy="174" rx="145" ry="124" fill="#ffe6d4"/>
   <path d="M155 100 Q190 113 225 100" fill="none" stroke="#d1a88f" strokeWidth="5"/>
   <ellipse cx="190" cy="200" rx={89-frame.rounding*38} ry={Math.max(2,frame.opening)} fill="#6c3346" stroke="#cd7c8c" strokeWidth="13"/>
   {frame.teeth&&<path d="M121 188 Q190 176 259 188 L252 201 Q190 209 128 201Z" fill="#fffdf8"/>}
   {frame.air&&<g stroke="#67b6c3" strokeWidth="4" fill="none"><path d="M159 244 Q180 255 159 270"/><path d="M190 245 Q211 258 190 275"/><path d="M221 244 Q242 255 221 270"/></g>}
   {internal?<g transform="translate(397 47)"><text x="175" y="-12" textAnchor="middle" fontSize="17" fill="#5e478c">{ml?'വായയ്ക്കുള്ളിലെ മാതൃക':'Inside-mouth illustration'}</text>
    <path d="M35 70 Q180 17 306 90 L331 118 L332 210 Q176 254 35 228Z" fill="#f8d2db"/>
    <path d="M35 70 Q180 17 306 90" fill="none" stroke="#cc7a94" strokeWidth="12"/>
    <path d="M35 228 Q176 254 332 210" fill="none" stroke="#cc7a94" strokeWidth="12"/>
    <rect x="305" y="100" width="17" height="35" rx="5" fill="white"/><rect x="305" y="185" width="17" height="30" rx="5" fill="white"/>
    <path d={tonguePath(frame)} fill="#c87394" stroke="#a34f76" strokeWidth="2"/>
    {active&&<circle cx={plan.movement.startsWith('back')?119:plan.movement.startsWith('retroflex')?267:292} cy={plan.movement.startsWith('back')?50:plan.movement.startsWith('retroflex')?138:85} r="19" fill="none" stroke="#7554b6" strokeWidth="4"/>}
    {frame.nasal&&<path d="M175 48 Q233 25 289 51" fill="none" stroke="#67b6c3" strokeWidth="5" strokeDasharray="8 7"/>}
   </g>:<g><text x="557" y="130" textAnchor="middle" fontSize="23" fill="#5e478c">{ml?'കാണൂ, കേൾക്കൂ':'Watch and listen'}</text><text x="557" y="185" textAnchor="middle" fontSize="42" fill="#342445">{plan.word}</text><text x="557" y="229" textAnchor="middle" fontSize="18" fill="#756882">{active?(ml?'ചലനം പകർത്താം':'Copy the movement'):(ml?'മുഴുവൻ വാക്ക് കേൾക്കാം':'Listen to the complete word')}</text></g>}
  </svg>:<div className={styles.audioOnly}><h3>{ml?'ആദ്യം വാക്ക് കേൾക്കാം':'Listen to the complete word'}</h3><p>{plan.cue}</p></div>}
 </div>;
}

export default function ArticulationLesson({plan,disabled,onHear,onStopSpeech,onBusyChange,onWatched}){
 const [index,setIndex]=useState(0),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[slow,setSlow]=useState(false),[error,setError]=useState('');
 const run=useRef(0),frame=useRef(null),delay=useRef(null),active=useRef(true);
 const ml=plan.language==='ml',label=(en,mal)=>ml?mal:en,stage=plan.stages[index]||plan.stages[0];
 function stop(){run.current++;cancelAnimationFrame(frame.current);if(delay.current){clearTimeout(delay.current.timer);delay.current.resolve();delay.current=null;}onStopSpeech?.();setPlaying(false);}
 useEffect(()=>{active.current=true;return()=>{active.current=false;run.current++;cancelAnimationFrame(frame.current);if(delay.current){clearTimeout(delay.current.timer);delay.current.resolve();delay.current=null;}onStopSpeech?.();};},[plan.cache_key]);
 useEffect(()=>{onBusyChange?.(playing);return()=>onBusyChange?.(false);},[playing]);
 function wait(ms){return new Promise(resolve=>{delay.current={resolve,timer:setTimeout(()=>{delay.current=null;resolve();},ms)};});}
 async function play(start=0){if(disabled)return;stop();const token=++run.current;setPlaying(true);setError('');
  try{for(let i=start;i<plan.stages.length;i++){
   if(!active.current||token!==run.current)return;setIndex(i);setProgress(0);
   const current=plan.stages[i],began=performance.now(),seconds=current.seconds*(slow?1.5:1);
   const tick=()=>{if(token!==run.current||!active.current)return;setProgress(Math.min(.99,(performance.now()-began)/(seconds*1000)));frame.current=requestAnimationFrame(tick);};tick();
   const outcome=await boundedOperation(onHear(current.speech,{slow:current.slow||slow}),{timeoutMs:20000});
   if(token!==run.current||!active.current)return;if(outcome===false)throw Error(label('The example audio could not play. Please retry.','മാതൃകയുടെ ശബ്ദം കേൾപ്പിക്കാനായില്ല. വീണ്ടും ശ്രമിക്കാം.'));
   await wait(Math.max(0,seconds*1000-(performance.now()-began)));
   cancelAnimationFrame(frame.current);if(token!==run.current||!active.current)return;setProgress(1);
  }
  if(token===run.current){setPlaying(false);try{await onWatched?.({slow});}catch{if(active.current)setError(label('Playback finished. Saving the watch event needs retry.','മാതൃക കണ്ടു. സൂക്ഷിക്കാൻ വീണ്ടും ശ്രമിക്കാം.'));}}
  }catch(err){if(token===run.current&&active.current){cancelAnimationFrame(frame.current);setPlaying(false);onStopSpeech?.();setError(err.message);}}
 }
 function choose(value){stop();setIndex(value);setProgress(0);}
 const duration=plan.stages.reduce((sum,item)=>sum+item.seconds,0),elapsed=plan.stages.slice(0,index).reduce((sum,item)=>sum+item.seconds,0)+progress*stage.seconds;
 return <section className={styles.lessonPlayer} aria-label={label('Articulation demonstration player','ഉച്ചാരണ മാതൃക')}>
  <div className={styles.lessonTitle}><span>{label('WATCH HOW','എങ്ങനെ പറയാമെന്ന് കാണാം')}</span><h3>{stage.label}</h3></div>
  <ArticulationScene plan={plan} stage={stage} progress={progress}/>
  <p className={styles.stageCue} aria-live="polite">{stage.kind==='movement'?plan.cue:stage.kind==='word'?plan.word:stage.speech}</p>
  <div className={styles.playerControls}><button disabled={disabled} onClick={()=>playing?stop():play(index===plan.stages.length-1?0:index)}>{playing?label('Pause','നിർത്താം'):label('Play lesson','മാതൃക കാണാം')}</button><button disabled={disabled} onClick={()=>play(0)}>{label('Replay','വീണ്ടും കാണാം')}</button><button disabled={disabled||playing} aria-pressed={slow} onClick={()=>setSlow(!slow)}>{label('Slow demonstration','പതുക്കെ കാണാം')}</button></div>
  <progress className={styles.lessonProgress} aria-label={label('Lesson progress','പരിശീലന പുരോഗതി')} max={duration} value={elapsed}/>
  <div className={styles.lessonChapters}>{plan.stages.map((item,i)=><button key={item.id} disabled={disabled} aria-current={i===index?'step':undefined} onClick={()=>choose(i)}>{i+1}. {item.label}</button>)}</div>
  {error&&<p role="alert">{error}</p>}
  <details><summary>{label('About this demonstration','ഈ മാതൃകയെക്കുറിച്ച്')}</summary><p>{label('An authored teaching animation. The movement chapter illustrates the target sound; it does not reconstruct your tongue or provide exact lip sync for the whole word. Your fresh recording determines the assessment result.','ശബ്ദം പഠിക്കാൻ തയ്യാറാക്കിയ ചലന മാതൃകയാണ്. ഇത് നിങ്ങളുടെ നാവിന്റെ യഥാർത്ഥ ചലനമല്ല. മുഴുവൻ വാക്കിനുള്ള കൃത്യമായ ചുണ്ടുചലനവുമല്ല. പുതിയ റെക്കോർഡിംഗാണ് വിലയിരുത്തുന്നത്.')}</p><small>{plan.evidence_basis==='acoustic_character_hypothesis'?label('Malayalam target selection includes acoustic character hypotheses, which are not verified phoneme labels.','മലയാളത്തിലെ ലക്ഷ്യത്തിൽ ശബ്ദാധിഷ്ഠിത അക്ഷര അനുമാനങ്ങൾ ഉൾപ്പെടുന്നു; അവ സ്ഥിരീകരിച്ച ശബ്ദലേബലുകളല്ല.'):null}</small></details>
 </section>;
}
