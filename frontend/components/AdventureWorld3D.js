import {useEffect,useRef} from 'react';
import {createAdventureWorld,travelProgress} from '../lib/adventureWorld';
export default function AdventureWorld3D({game,challenge,names,flight,paused,quiet,onArrive,onUnavailable,label}){
 const canvas=useRef(null),snapshot=useRef(null);snapshot.current={flight,paused,quiet,onArrive,onUnavailable};
 useEffect(()=>{
  let world,frame,elapsed=0,last=0,started=0,activeFlight=null,finished=null,disposed=false;
  const element=canvas.current;
  try{world=createAdventureWorld(element,{game,challenge,names});}catch{onUnavailable();return;}
  const resize=new ResizeObserver(()=>world.resize());resize.observe(element);
  const lost=event=>{event.preventDefault();snapshot.current.onUnavailable();};element.addEventListener('webglcontextlost',lost);
  function draw(now){if(disposed)return;const current=snapshot.current;const delta=last?Math.min(60,now-last):0;last=now;
   if(!current.paused&&document.visibilityState==='visible')elapsed+=delta;
   if(current.flight?.id!==activeFlight){activeFlight=current.flight?.id;started=elapsed;}
   const progress=current.flight?travelProgress(elapsed-started,current.quiet?180:2400).linear:null;
   world.draw({time:current.quiet?0:elapsed/1000,progress,index:current.flight?.index||0,order:current.flight?.order,quiet:current.quiet});
   if(progress===1&&finished!==activeFlight){finished=activeFlight;world.arrive(current.flight.index||0);current.onArrive();}
   frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();element.removeEventListener('webglcontextlost',lost);world.dispose();};
 },[game,challenge.id]);
 return <canvas ref={canvas} role="img" aria-label={label}/>;
}
