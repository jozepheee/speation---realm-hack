// Relative energy endpointing only. This detects an utterance boundary, not correctness.
export function createPauseDetector({quietMs=1800,maxMs=12000,minRms=.004}={}) {
 let started=null,lastActivity=null,activityMs=0,previous=null;
 const history=[];
 return function sample(rms,now) {
  if(started===null){started=now;lastActivity=now;}
  const delta=previous===null?0:Math.min(100,now-previous);previous=now;
  history.push(rms);if(history.length>100)history.shift();
  // A rolling lower-energy percentile follows a fan/room hum without learning
  // a whole spoken word as silence. A relative release threshold stops on a
  // quieter pause even when the room never reaches digital silence.
  const sorted=[...history].sort((a,b)=>a-b);
  const peak=sorted[sorted.length-1];
  const floor=history.length>=6?Math.min(sorted[Math.floor((sorted.length-1)*.2)],peak*.3):.002;
  const threshold=Math.max(minRms,floor*2);
  const voice=rms>threshold;
  if(voice){lastActivity=now;activityMs+=delta;}
  const heard=activityMs>=100;
  return {voice,heard,quietMs:now-lastActivity,
   finished:now-started>=maxMs||heard&&now-lastActivity>=quietMs};
 };
}
