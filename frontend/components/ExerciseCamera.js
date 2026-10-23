import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {boundedOperation} from '../lib/boundedOperation';
import {Repetitions} from '../public/face-tracking/exercise-vision';
import styles from '../styles/exercise-camera.module.css';
const labels={tracking_unavailable:'Tracking unavailable — adjust your position',try_pose:'Follow the demonstration',return_to_rest:'Return to a relaxed position before the next repetition',rep_recorded:'Movement repetition recorded',hold_pose:'Hold this visible pose',set_complete:'Repetition target reached'};
export default function ExerciseCamera({exerciseId,onProgress,onStarted,onStopped,disabled=false,paused=false,finished=false,targetReps=3}){
 const {t,locale}=useLocale();const video=useRef(null),canvas=useRef(null),stream=useRef(null),worker=useRef(null),timer=useRef(null),deadline=useRef(null),generation=useRef(0),busy=useRef(false),counter=useRef(new Repetitions()),report=useRef(onProgress),lastFrame=useRef(0),controller=useRef(null);
 const [enabled,setEnabled]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState(null),[geometry,setGeometry]=useState(null);
 const active=useRef(exerciseId),pause=useRef(paused);active.current=exerciseId;pause.current=paused;
 useEffect(()=>{counter.current.reset();setFeedback(null);setGeometry(null);report.current?.(null);worker.current?.postMessage({type:'exercise',exerciseId});},[exerciseId]);
 useEffect(()=>{if(finished)stop();},[finished]);
 const tongue=exerciseId.startsWith('tongue');report.current=onProgress;const started=useRef(onStarted);started.current=onStarted;
 function release(){generation.current++;controller.current?.abort();clearInterval(timer.current);clearTimeout(deadline.current);worker.current?.terminate();worker.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;busy.current=false;if(video.current)video.current.srcObject=null;}
 useEffect(()=>()=>release(),[]);
 function stop(){release();setEnabled(false);setStarting(false);setGeometry(null);onStopped?.();}
 function fail(message){stop();setError(message);}
 async function start(){
  release();const current=generation.current;controller.current=new AbortController();setStarting(true);setError('');counter.current.reset();setFeedback(null);report.current?.(null);
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.OffscreenCanvas)throw new Error('Camera analysis requires a current browser on HTTPS or localhost.');
   const captured=await boundedOperation(navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false}),{signal:controller.current.signal,timeoutMs:20000,onLateResolve:late=>late.getTracks().forEach(track=>track.stop()),message:'Camera permission timed out. Allow camera access and retry.'});
   if(current!==generation.current){captured.getTracks().forEach(track=>track.stop());return;}stream.current=captured;setEnabled(true);if(video.current){video.current.srcObject=captured;await video.current.play();}if(current!==generation.current)return;
   const detector=new Worker('/face-tracking/worker.js');worker.current=detector;
   deadline.current=setTimeout(()=>fail('The camera tracker did not start. Please retry.'),30000);
   detector.onerror=()=>{if(current===generation.current)fail('Camera analysis failed. Please retry.');};
   detector.onmessage=({data})=>{
    if(current!==generation.current)return;
    if(data.type==='ready'){clearTimeout(deadline.current);setStarting(false);lastFrame.current=performance.now();started.current?.();
     timer.current=setInterval(async()=>{if(current!==generation.current||document.hidden)return;
      if(performance.now()-lastFrame.current>5000){setGeometry(null);setFeedback({status:'tracking_unavailable',progress:0,reps:counter.current.reps});}
      if(busy.current||!video.current||video.current.readyState<2)return;busy.current=true;
      try{const frame=await createImageBitmap(video.current,{resizeWidth:320,resizeHeight:240});if(current!==generation.current){frame.close();return;}detector.postMessage({type:'frame',frame,timestamp:performance.now()},[frame]);}catch{busy.current=false;if(current===generation.current)fail('Camera analysis failed. Please retry.');}
     },125);
    }else if(data.type==='result'){
     busy.current=false;if(data.exerciseId!==active.current)return;lastFrame.current=performance.now();const sample=data.result.exercise||{valid:false};setGeometry(sample.valid?sample:null);
     if(pause.current)return;const id=active.current;const state=counter.current.reps>=targetReps?counter.current.state('set_complete',1):counter.current.update(id,sample,performance.now());setFeedback({...state,note:data.result.observation});report.current?.({...state,exercise_id:id,calibrated:!!sample.calibrated,method:id.startsWith('tongue')?'mouth_roi_hsv_color_segmentation':'mediapipe_lip_geometry_and_shape',thresholds:id==='mouth-wide'?'>0.2':id==='say-o'?'ratio 0.08-0.35; pucker >0.6 or funnel >0.45':id==='say-e'?'ratio 0.16-0.22; pucker <0.3':'calibrated color area >=0.04; centroid/extent relative to visible lips'});
     if(state.status==='rep_recorded'&&window.speechSynthesis){const utter=new SpeechSynthesisUtterance(String(state.reps));utter.lang=locale==='ml'?'ml-IN':locale==='hi'?'hi-IN':'en-IN';window.speechSynthesis.speak(utter);}
    }else if(data.type==='error')fail(data.message);
   };
   detector.postMessage({type:'init',exerciseId});
  }catch(err){if(current===generation.current)fail(err.message);}
 }

 useEffect(()=>{
  const node=canvas.current;if(!node)return;const ctx=node.getContext('2d');ctx.clearRect(0,0,node.width,node.height);if(!geometry)return;
  ctx.strokeStyle='#44ff9a';ctx.lineWidth=2;
  for(const contour of geometry.contours||[]){ctx.beginPath();contour.forEach((p,i)=>{i?ctx.lineTo(p.x*640,p.y*480):ctx.moveTo(p.x*640,p.y*480);});ctx.stroke();}
  if(geometry.tongue){const {x,y,bounds}=geometry.tongue;ctx.strokeStyle='#ff5cda';ctx.strokeRect(bounds.x*640,bounds.y*480,bounds.width*640,bounds.height*480);ctx.beginPath();ctx.arc(x*640,y*480,6,0,Math.PI*2);ctx.stroke();}
  if(tongue&&geometry.center){const c=geometry.center;ctx.strokeStyle='#ffdf66';ctx.beginPath();ctx.arc((c.x+(exerciseId==='tongue-left'?.08:exerciseId==='tongue-right'?-.08:0))*640,(c.y+(exerciseId==='tongue-down'?.1:0))*480,18,0,Math.PI*2);ctx.stroke();}
 },[geometry,exerciseId]);
 return <section className={styles.panel}><h2>{tongue?t('Live tongue analysis'):t('Live mouth analysis')}</h2><p>{tongue?t('Show your tongue below your lower lip and hold briefly to calibrate automatically. You can also tap the visible tongue tip.'):t('Start the camera to track your lip contour and hold the demonstrated shape.')}</p>
  {error&&<p role="alert">{t(error)}</p>}
  <div className={styles.controls}><button onClick={start} disabled={starting||disabled}>{starting?t('Starting camera…'):enabled?t('Restart analysis'):t('Start camera analysis')}</button>{(enabled||starting)&&<button onClick={stop}>{t('Stop camera')}</button>}</div>
  <div className={styles.preview}><video hidden={!enabled} ref={video} muted autoPlay playsInline aria-label={t('Your exercise camera')}/>{enabled&&<canvas ref={canvas} width={640} height={480} aria-label={t('Live lip contour and tongue color overlay')} onClick={event=>{if(!tongue)return;const rect=event.currentTarget.getBoundingClientRect();worker.current?.postMessage({type:'calibrate',x:1-(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height});}}/>}{!enabled&&<div className={styles.empty}><span aria-hidden="true">◎</span><p>{t('Your live camera appears here')}</p><small>{t('Start camera analysis')}</small></div>}</div>
  {enabled&&<> <p role="status">{t(labels[feedback?.status]||'Position your face in the camera')}{feedback?.status==='tracking_unavailable'&&feedback.note?` · ${t(feedback.note)}`:''}</p>
   {tongue&&<p>{geometry?.calibrated?t('Tongue tracked — follow the direction shown'):geometry?.calibration_status==='hold_tongue'?t('Keep your tongue visible briefly — calibrating…'):t('Show your tongue below your lower lip, or tap its visible tip to calibrate')}</p>}
   <div className={styles.metrics}><span>{t('Repetitions')}: <strong>{feedback?.reps||0} / {targetReps}</strong></span><span>{t('Visible lip ratio')}: {geometry?.ratio?.toFixed(3)||'—'}</span></div><progress max="1" value={feedback?.progress||0} aria-label={t('Pose hold progress')}/>
  </>}
  <details><summary>{t('How tracking works')}</summary><small>{t('Local camera measurements and prototype thresholds. Counts describe visible movement, not speech correctness or a clinical outcome. Frames are not uploaded.')}</small></details>
 </section>;
}
