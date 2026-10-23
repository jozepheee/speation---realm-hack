function wav(samples,rate){const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);const write=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);samples.forEach((s,i)=>view.setInt16(44+i*2,Math.max(-1,Math.min(1,s))*32767,true));return bytes;}
class SpeechSegments{
 constructor(rate,onClip,quietMs=700){this.quietMs=quietMs;this.rate=rate;this.onClip=onClip;this.pre=[];this.preLength=0;this.parts=[];this.length=0;this.quiet=0;this.voiced=0;}
 push(samples,voice){
  if(!this.length){this.pre.push(samples);this.preLength+=samples.length;while(this.preLength>this.rate*.25&&this.pre.length>1)this.preLength-=this.pre.shift().length;if(!voice)return;this.parts=this.pre;this.length=this.preLength;this.pre=[];this.preLength=0;}
  else {this.parts.push(samples);this.length+=samples.length;}
  if(voice){this.quiet=0;this.voiced+=samples.length;}else this.quiet+=samples.length;
  if(this.quiet>this.rate*this.quietMs/1000||this.length>=this.rate*20)this.flush();
 }
 flush(){if(this.voiced>this.rate*.12&&this.length){const count=Math.min(this.length,this.rate*20),pcm=new Float32Array(count);let at=0;for(const part of this.parts){pcm.set(part.subarray(0,Math.min(part.length,count-at)),at);at+=Math.min(part.length,count-at);if(at===count)break;}this.onClip(wav(pcm,this.rate));}this.parts=[];this.length=0;this.quiet=0;this.voiced=0;this.pre=[];this.preLength=0;}
}
module.exports={SpeechSegments,wav};
