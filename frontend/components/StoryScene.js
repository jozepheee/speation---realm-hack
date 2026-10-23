import {useEffect,useMemo,useRef,useState} from 'react';
import StoryFilmStage from './StoryFilmStage';
import {filmFrame,narrationProgress,storyFilmPlan} from '../lib/storyFilm';
import styles from '../styles/story-scene.module.css';

export default function StoryScene({scene,index=0,title,onHear,onStopSpeech,onPlayingChange,disabled}){
 const plan=useMemo(()=>storyFilmPlan(scene,title),[scene,title]);
 const [mode,setMode]=useState('ready'),[progress,setProgress]=useState(0),[reduced,setReduced]=useState(false);
 const media=useRef(null),alignment=useRef(null),version=useRef(0),started=useRef(false),latest=useRef({onHear,onStopSpeech,onPlayingChange});latest.current={onHear,onStopSpeech,onPlayingChange};
 const shot=filmFrame(plan,progress);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');setReduced(query.matches);const change=()=>setReduced(query.matches);query.addEventListener?.('change',change);return()=>query.removeEventListener?.('change',change);},[]);
 function cancel(){version.current++;const player=media.current;media.current=null;if(player){player.dispatchEvent(new Event('speation-stop'));player.pause();}}
 async function play(){
  cancel();latest.current.onStopSpeech?.();const current=version.current;setProgress(0);setMode('loading');
  const ok=await latest.current.onHear(plan.narration,{controllable:true,onPlayback:(player,speech)=>{
   if(current!==version.current){player.pause();return;}
   media.current=player;alignment.current=speech?.alignment;
   player.addEventListener('playing',()=>{if(current===version.current)setMode('playing');});
   player.addEventListener('pause',()=>{if(current===version.current&&!player.ended){setProgress(narrationProgress(player,alignment.current,plan));setMode('paused');}});
   player.addEventListener('seeked',()=>{if(current===version.current)setProgress(narrationProgress(player,alignment.current,plan));});
   player.addEventListener('ended',()=>{if(current===version.current){setProgress(1);setMode('finished');}});
  }});
  if(current===version.current&&ok===false)setMode('error');
 }
 useEffect(()=>{started.current=false;setProgress(0);setMode('ready');return()=>{cancel();latest.current.onPlayingChange?.(false);};},[index,scene.narration]);
 useEffect(()=>{if(!disabled&&!started.current){started.current=true;void play();}},[disabled,index,scene.narration]);
 useEffect(()=>{latest.current.onPlayingChange?.(['loading','playing','paused'].includes(mode));},[mode]);
 useEffect(()=>{
  if(mode!=='playing')return;let frame,last=0;
  const tick=now=>{if(now-last>32){last=now;setProgress(narrationProgress(media.current,alignment.current,plan));}frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[mode]);
 async function toggle(){if(mode==='playing'){media.current?.pause();return;}if(mode==='paused'&&media.current){try{await media.current.play();}catch{setMode('error');}return;}await play();}
 return <section lang="en" translate="no" className={styles.scene} aria-label={`Animated story scene ${index+1}`}>
  <div className={styles.film} data-playback={mode}>
   <StoryFilmStage plan={plan} frame={shot} time={progress*24} reducedMotion={reduced}/>
   <div className={styles.filmLabel}><span>STORY ADVENTURE</span><strong>{title}</strong></div>
   {mode==='loading'&&<div className={styles.loading} role="status"><span className={styles.spinner}/>Preparing Maya’s narration…</div>}
   {mode==='finished'&&<div className={styles.yourTurn}>Your turn to tell the story</div>}
   {mode==='paused'&&<div className={styles.paused}>Paused</div>}
   <div className={styles.subtitle}>{shot.line||scene.narration}</div>
  </div>
  <div className={styles.controls}>
   <button disabled={disabled||mode==='loading'} onClick={toggle}>{mode==='playing'?'Ⅱ Pause':mode==='paused'?'▶ Resume':mode==='error'?'▶ Enable audio and replay':'▶ Play scene'}</button>
   <button disabled={disabled||mode==='loading'} onClick={play}>↻ Replay</button>
   {['playing','paused','loading'].includes(mode)&&<button disabled={disabled} onClick={()=>{cancel();latest.current.onStopSpeech?.();setProgress(1);setMode('finished');}}>Skip to my turn</button>}
   <progress value={progress} max="1" aria-label="Story playback progress"/>
   <span>{shot.index+1} / {plan.shots.length} shots</span>
  </div>
  {mode==='error'&&<p className={styles.error} role="alert">Maya’s audio could not play. Select Enable audio and replay. The animation waits for her voice.</p>}
  <div className={styles.storyBubble}><span>Scene {index+1} · {plan.setting}</span><h3>{scene.narration}</h3><p className={styles.question}>{scene.question}</p></div>
 </section>;
}
