/* Observable geometry/color heuristics. Never a diagnosis or speech score. */
(function(root){
 const upper=[61,185,40,39,37,0,267,269,270,409,291,308,415,310,311,312,13,82,81,80,191,78,62];
 const lower=[61,146,91,181,84,17,314,405,321,375,291,308,324,402,317,14,87,178,88,95,78,62,76];
 const upperCalc=[291,308,415,310,311,312,13,82,81,80,191,78,62],lowerCalc=[291,308,324,402,317,14,87,178,88,95,78,62,76,61];
 function geometry(points,w,h){
  const avg=ids=>({x:ids.reduce((s,i)=>s+points[i].x*w,0)/ids.length,y:ids.reduce((s,i)=>s+points[i].y*h,0)/ids.length});
  const a=avg(upperCalc),b=avg(lowerCalc),left=points[61],right=points[291];
  const width=Math.hypot((left.x-right.x)*w,(left.y-right.y)*h);
  return {ratio:width?Math.hypot(a.x-b.x,a.y-b.y)/width:null,width,center:{x:(left.x+right.x)/2,y:(left.y+right.y)/2},contours:[upper,lower].map(ids=>ids.map(i=>({x:points[i].x,y:points[i].y})))};
 }
 function hsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=(h*30+180)%180;}return [h,max?d/max*255:0,max*255];}
 function calibrationHue(pixel){const [r,g,b]=pixel,[h,s,v]=hsv(r,g,b);return s>50&&v>50&&v<250&&(h<=25||h>=140)&&r>g*1.2&&b>g*.9&&r-g>15?h:null;}
 function tongue(pixels,width,height,hue=null){
  const mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length);let best=null;
  for(let i=0;i<mask.length;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];const [h,s,v]=hsv(r,g,b);const distance=hue===null?null:Math.min(Math.abs(h-hue),180-Math.abs(h-hue));mask[i]=s>50&&v>50&&v<250&&r>g*1.2&&b>g*.9&&r-g>15&&(hue===null?(h<=25||h>=140):distance<18)?1:0;}
  for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;let queue=[i],at=0,sumX=0,sumY=0,minX=width,maxX=0,minY=height,maxY=0,hueX=0,hueY=0;seen[i]=1;
   while(at<queue.length){const pos=queue[at++],x=pos%width,y=Math.floor(pos/width);sumX+=x;sumY+=y;const color=hsv(pixels[pos*4],pixels[pos*4+1],pixels[pos*4+2])[0]*Math.PI/90;hueX+=Math.cos(color);hueY+=Math.sin(color);minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY);for(const next of [x>0?pos-1:-1,x+1<width?pos+1:-1,pos-width,pos+width])if(next>=0&&next<mask.length&&mask[next]&&!seen[next]){seen[next]=1;queue.push(next);}}
   if(queue.length<12||queue.length>mask.length*.75||minX===0||maxX===width-1)continue;
   if(!best||queue.length>best.area)best={x:sumX/queue.length/width,y:sumY/queue.length/height,area:queue.length,hue:(Math.atan2(hueY,hueX)*90/Math.PI+180)%180,fraction:queue.length/mask.length,bounds:{x:minX/width,y:minY/height,width:(maxX-minX+1)/width,height:(maxY-minY+1)/height}};
  }return best;
 }
 function pose(id,observation){
  if(!observation?.valid)return false;
  if(id==='mouth-wide')return observation.ratio>.2;
  if(id==='say-o')return observation.shape_scores?observation.ratio>.08&&observation.ratio<.35&&(observation.shape_scores.mouthPucker>.6||observation.shape_scores.mouthFunnel>.45):observation.ratio>.11&&observation.ratio<.14;
  if(id==='say-e')return observation.ratio>.16&&observation.ratio<.22&&(!observation.shape_scores||observation.shape_scores.mouthPucker<.3);
  if(!observation.tongue||!observation.calibrated)return false;
  if(Number.isFinite(observation.tongue.fraction)&&observation.tongue.fraction<.04)return false;
  const {dx,dy}=observation.tongue;
  const lateral=observation.tongue.lateral_shift;
  const {min_dx:left,max_dx:right}=observation.tongue;
  const extendsRight=right>.6&&right>Math.abs(left)+.05,extendsLeft=left<-.6&&Math.abs(left)>right+.05;
  return id==='tongue-down'?dy>.14&&observation.tongue.extends_below_lip!==false:id==='tongue-right'?(extendsLeft||(Number.isFinite(lateral)?lateral<-.1:dx<-.14)):id==='tongue-left'?(extendsRight||(Number.isFinite(lateral)?lateral>.1:dx>.14)):false;
 }
 class Repetitions{
  constructor(){this.reset();}reset(){this.reps=0;this.hold=null;this.release=null;this.armed=true;this.last=null;this.samples=0;this.matched=0;}
  update(id,observation,time){const valid=observation?.valid&&Number.isFinite(time);const gap=this.last!==null&&time-this.last>400;this.last=time;if(!valid||gap){this.hold=null;this.release=null;return this.state('tracking_unavailable',0);}this.samples++;
   const matched=pose(id,observation);if(matched)this.matched++;
   if(!matched){this.hold=null;this.release??=time;if(time-this.release>=650)this.armed=true;return this.state('try_pose',0);}this.release=null;
   if(!this.armed)return this.state('return_to_rest',0);
   this.hold??=time;const duration=id.startsWith('tongue')?1000:2000;const progress=Math.min(1,(time-this.hold)/duration);
   if(progress===1){this.reps++;this.armed=false;this.hold=null;return this.state('rep_recorded',1);}return this.state('hold_pose',progress);
  }state(status,progress){return {status,progress,reps:this.reps,samples:this.samples,matched_samples:this.matched,source:'local_geometry_and_color_heuristic',clinical_assessment:false};}
 }
 class TongueCalibration{
  constructor(){this.reset();}reset(){this.since=null;this.last=null;this.previous=null;}
  update(candidate,ratio,time){
   const good=candidate&&ratio>.1&&candidate.extends_below_lip&&Math.abs(candidate.dx)<.55&&candidate.dy>.08&&candidate.fraction>.04&&candidate.fraction<.65;
   if(!good||!Number.isFinite(time)){this.reset();return null;}
   if(this.last!==null&&(time-this.last>400||Math.hypot(candidate.dx-this.previous.dx,candidate.dy-this.previous.dy)>.2)){this.since=time;}
   this.since??=time;this.last=time;this.previous=candidate;
   return time-this.since>=500?candidate.hue:null;
  }
 }
 class MouthReference{
  project(metrics,points,w,h){
   const a=points[33],b=points[263],nose=points[1];
   const eye=Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
   if(!Number.isFinite(eye)||eye<=0)return null;
   if(this.offset===undefined){this.offset=(metrics.center.x-nose.x)/(eye/w);this.scale=metrics.width/eye;}
   return {x:nose.x+this.offset*eye/w,width:this.scale*eye};
  }
 }
 function nextExercise(step,round){if(step<2)return {step:step+1,round,done:false};if(round<3)return {step:0,round:round+1,done:false};return {step:2,round:3,done:true};}
 const api={geometry,hsv,tongue,pose,Repetitions,nextExercise,TongueCalibration,calibrationHue,MouthReference};if(typeof module!=='undefined')module.exports=api;root.ExerciseVision=api;
})(typeof self!=='undefined'?self:globalThis);
