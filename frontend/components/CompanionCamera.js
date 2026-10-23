import {createPortal} from 'react-dom';
import {useLocale} from '../context/LocaleContext';
import {useEffect,useRef,useState} from 'react';
import {boundedOperation} from '../lib/boundedOperation';
import {mouthMirrorObservation} from '../lib/mouthMirror';
import {publishMouthSample} from '../lib/visualArticulation';
import styles from '../styles/companion-camera.module.css';

export default function CompanionCamera({prepareRef,stopRef,onLost,reference,onPlayReference,portalTarget}){
 const {t}=useLocale();
 const video=useRef(null),canvas=useRef(null),stream=useRef(null),worker=useRef(null),interval=useRef(null),controller=useRef(null),version=useRef(0),pinned=useRef(false),lost=useRef(onLost);lost.current=onLost;
 const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[status,setStatus]=useState('Camera and microphone are required for a video conversation.'),[ratio,setRatio]=useState(null),[movement,setMovement]=useState(null);
 function stop(){publishMouthSample(null);version.current++;controller.current?.abort();clearInterval(interval.current);worker.current?.terminate();worker.current=null;const prior=stream.current;stream.current=null;prior?.getTracks().forEach(track=>{track.onended=null;track.stop();});if(video.current)video.current.srcObject=null;setEnabled(false);setRatio(null);setMovement(null);}
 async function prepare(){
  if(stream.current?.getVideoTracks().some(track=>track.readyState==='live'))return;
  stop();setBusy(true);const current=version.current;controller.current=new AbortController();setStatus('Allow camera access to start your video conversation.');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access needs HTTPS or localhost.');
   const captured=await boundedOperation(navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false}),{signal:controller.current.signal,timeoutMs:20000,onLateResolve:late=>late.getTracks().forEach(track=>track.stop()),message:'Camera permission timed out. Allow your camera and try again.'});
   if(current!==version.current){captured.getTracks().forEach(track=>track.stop());throw Error('Video start cancelled.');}
   stream.current=captured;setEnabled(true);video.current.srcObject=captured;
   await boundedOperation(video.current.play(),{signal:controller.current.signal,timeoutMs:5000,message:'Camera preview could not start.'});
   captured.getVideoTracks().forEach(track=>{track.onended=()=>{stop();setStatus('Camera disconnected. Reconnect it to continue.');lost.current?.();};});
   setStatus('Camera connected. Starting local mouth tracking…');
   // Camera failure blocks the call; tracker failure preserves the visible mirror
   // and is labelled unavailable rather than inventing a mouth measurement.
   if(!window.OffscreenCanvas){setStatus('Video connected. Live mouth tracking is unavailable in this browser.');return;}
   const detector=new Worker('/face-tracking/worker.js');worker.current=detector;let busy=false,ready=false,lastFrame=performance.now();
   const unavailable=()=>{publishMouthSample(null);setRatio(null);setMovement(null);setStatus('Video connected. Mouth tracking is unavailable; use the live mirror.');};
   detector.onerror=unavailable;
   detector.onmessage=({data})=>{
    if(current!==version.current)return;
    if(data.type==='ready'){busy=false;ready=true;setStatus('Face the camera in good light.');}
    if(data.type==='error'){busy=false;unavailable();}
    if(data.type==='result'){
     busy=false;lastFrame=performance.now();const sample=data.result.exercise;
     const ctx=canvas.current?.getContext('2d');ctx?.clearRect(0,0,640,480);
     const observed=mouthMirrorObservation(data.result);setMovement(observed);publishMouthSample(observed);
     if(observed){setRatio(observed.opening);setStatus('Live lip tracking · match the visible movement, then listen and try.');if(ctx){ctx.strokeStyle='#54ffaf';ctx.lineWidth=3;for(const contour of sample.contours||[]){ctx.beginPath();contour.forEach((p,i)=>i?ctx.lineTo(p.x*640,p.y*480):ctx.moveTo(p.x*640,p.y*480));ctx.stroke();}}}
     else{setRatio(null);setStatus(data.result.observation||'Keep one face visible, centred and well lit.');}
    }
   };
   detector.postMessage({type:'init',exerciseId:'companion'});
   // No camera images or landmarks leave this browser.
   interval.current=setInterval(async()=>{
    if(current!==version.current||document.hidden)return;
    if(performance.now()-lastFrame>5000){publishMouthSample(null);setRatio(null);setMovement(null);canvas.current?.getContext('2d')?.clearRect(0,0,640,480);setStatus('Camera connected. Waiting for mouth tracking…');}
    if(!ready||busy||video.current?.readyState<2)return;busy=true;
    try{const source=video.current;const height=Math.max(1,Math.round(320*source.videoHeight/source.videoWidth));const frame=await createImageBitmap(source,{resizeWidth:320,resizeHeight:height});if(current!==version.current){frame.close();return;}detector.postMessage({type:'frame',frame,timestamp:performance.now()},[frame]);}catch{busy=false;unavailable();}
   },125);
  }catch(err){if(current===version.current){stop();setStatus(err.name==='NotAllowedError'?'Camera permission denied. Allow the camera in browser settings to start.':err.message);}throw err;}finally{if(current===version.current||!stream.current)setBusy(false);}
 }
 useEffect(()=>{prepareRef.current=prepare;stopRef.current=()=>{if(!pinned.current)stop();};return()=>{prepareRef.current=null;stopRef.current=null;stop();};},[]);
 useEffect(()=>{if(stream.current&&video.current){video.current.srcObject=stream.current;void video.current.play().catch(()=>{});}},[portalTarget]);
 const view=<section className={`${styles.panel} ${portalTarget?styles.prominent:''}`} aria-label={t("Your live mouth mirror")}><h2>{t("Your live mouth mirror")}</h2><button type="button" disabled={busy} onClick={()=>{if(enabled){pinned.current=false;stop();setStatus('Camera is off.');lost.current?.();}else{pinned.current=true;void prepare().catch(()=>{pinned.current=false;});}}}>{t(busy?'Starting camera…':enabled?'Turn camera off':'Turn camera on')}</button><div className={reference?styles.comparison:undefined}><div className={styles.preview}><video ref={video} autoPlay playsInline muted hidden={!enabled} aria-label={t("Your live camera")}/><canvas ref={canvas} width="640" height="480" hidden={!enabled} aria-label={t("Live lip contour overlay")}/>{!enabled&&<p>{t("Turn on your camera to see your mouth here.")}</p>}</div>{reference&&<div className={styles.reference}><strong>{t("Your reference example")}</strong><p>{reference.target}</p>{reference.type.startsWith("video/")?<video src={reference.url} controls playsInline onPlay={onPlayReference}/>:<audio src={reference.url} controls onPlay={onPlayReference}/>}<small>{t("Watch or listen, pause, then try the movement in your mirror.")}</small></div>}</div><p role="status">{t(status)}</p>{enabled&&<><label>{t("Visible lip opening")}<meter min="0" max="1" value={Math.min(1,ratio||0)}/>{ratio===null?t('Tracking unavailable'):ratio.toFixed(2)}</label>{movement&&<div className={styles.movements}><span>{t(movement.closure?'Lips close together':'Lips apart')}</span>{movement.rounding!==null&&<label>{t('Visible lip rounding')}<meter min="0" max="1" value={movement.rounding}/></label>}</div>}<p>{t("Watch your lips open, close and round as Maya models a word. Relax between attempts.")}</p></>}<small>{t("Video stays on this device. The overlay measures visible lip movement; audio is assessed separately. It cannot see inside your mouth or grade pronunciation.")}</small></section>;
 return portalTarget?createPortal(view,portalTarget):view;
}
