// Local visible-motion measurements, never phoneme recognition or a grade.
let latest=null;
export function publishMouthSample(sample,now=performance.now()){latest=sample?{...sample,time:now}:null;}
export function beginVisualAttempt(now=performance.now()){
 const samples=[];let frames=0;
 const sample=()=>{frames++;if(latest&&performance.now()-latest.time<500)samples.push({...latest});};
 sample();const timer=setInterval(sample,125);
 return ()=>{clearInterval(timer);const duration=Math.max(0,(performance.now()-now)/1000);
  const openings=samples.map(s=>s.opening).filter(Number.isFinite),rounds=samples.map(s=>s.rounding).filter(Number.isFinite);
  return {version:1,source:'browser_visible_lip_geometry',duration_seconds:Math.min(120,duration),frames,valid_frames:samples.length,
   tracking_fraction:frames?samples.length/frames:0,
   opening_min:openings.length?Math.min(...openings):null,opening_max:openings.length?Math.max(...openings):null,
   closure_fraction:samples.length?samples.filter(s=>s.closure).length/samples.length:null,
   rounding_max:rounds.length?Math.max(...rounds):null,pronunciation_grade:false};};
}
export function movementForSound(phone){
 if(['p','b','m'].includes(phone))return {kind:'closure',label:'Watch your lips meet, then relax.',visible:true};
 if(['w','u','uː'].includes(phone))return {kind:'rounding',label:'Watch your lips make a small round shape.',visible:true};
 if(['i','iː'].includes(phone))return {kind:'opening',label:'Watch your lips spread gently as you say it.',visible:true};
 return {kind:'audio',label:'Watch the example. This sound needs an audio check.',visible:false};
}
