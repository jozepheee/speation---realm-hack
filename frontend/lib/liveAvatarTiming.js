// Provider-timed character animation for Maya's generated voice only.
// These approximate English mouth shapes are NOT phoneme recognition or learner
// pronunciation evidence. Teaching recordings use the acoustic Rhubarb cues.
const SHAPES={p:'viseme_PP',b:'viseme_PP',m:'viseme_PP',f:'viseme_FF',v:'viseme_FF',s:'viseme_SS',z:'viseme_SS',r:'viseme_RR',w:'viseme_U',u:'viseme_U',o:'viseme_O',a:'viseme_aa',e:'viseme_E',i:'viseme_I',k:'viseme_kk',g:'viseme_kk',t:'viseme_DD',d:'viseme_DD',n:'viseme_nn',l:'viseme_nn'};
export class LiveAvatarTiming{
 constructor(){this.clear();}
 clear(){this.cues=[];this.started=null;this.duration=0;}
 append(data){
  if(!Array.isArray(data?.chars)||!Array.isArray(data.char_start_times_ms)||!Array.isArray(data.char_durations_ms))return;
  const next=[];
  for(let index=0;index<Math.min(data.chars.length,600);index++){
   const start=data.char_start_times_ms[index]/1000,duration=data.char_durations_ms[index]/1000;
   if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start>30||duration>5)continue;
   const char=String(data.chars[index]).toLowerCase(),pair=char+String(data.chars[index+1]||'').toLowerCase();
   const morph=pair==='th'?'viseme_TH':['sh','ch'].includes(pair)?'viseme_CH':SHAPES[char];
   next.push({start:this.duration+start,end:this.duration+start+duration,morph:morph||null});
  }
  if(!next.length)return;
  this.cues.push(...next);this.duration=Math.max(...next.map(item=>item.end));
 }
 frame(now,speaking){
  if(!speaking)return {alignment:null,time:0};
  if(!this.cues.length)return {alignment:null,time:0};
  this.started??=now;const time=Math.max(0,(now-this.started)/1000);
  this.cues=this.cues.filter(cue=>cue.end>=time-.2).slice(-1200);
  return {alignment:{source:'provider_character_timing_approximate_animation',visemeCues:this.cues},time};
 }
}
