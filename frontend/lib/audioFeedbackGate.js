import {practiceFeedbackInstruction} from './practiceFeedbackInstruction.js';
// A transcript may start a conversational reply, but cannot authorize feedback.
export const AUDIO_FEEDBACK_EVENT='[SPEATION_AUDIO_RESULT]';
export class AudioFeedbackGate {
 constructor({hold,release,wake,timeoutMs=65000}){this.hold=hold;this.release=release;this.wake=wake;this.reviewers=0;this.waiting=false;this.timeoutMs=timeoutMs;this.timer=null;this.version=0;this.cancellations=new Set();}
 wait(){if(!this.waiting){this.version++;this.waiting=true;this.hold();this.timer=setTimeout(()=>this.fail(),this.timeoutMs);this.timer?.unref?.();}return this.version;}
 fail(version=this.version){if(!this.waiting||version!==this.version)return;const reviewing=this.reviewers>0;this.reset('Audio assessment did not finish in time.');if(!reviewing)this.wake(AUDIO_FEEDBACK_EVENT+JSON.stringify({state:'audio_unavailable',instruction:'Audio assessment did not finish. Explain this briefly in the selected language, demonstrate the current word slowly and invite one fresh attempt. Never claim this attempt was right or wrong. Continue speaking now; do not wait silently or call the review tool for the same missing result.'}));}
 ready(result,version=this.version){if(version!==this.version)return false;if(!this.reviewers){clearTimeout(this.timer);this.wake(AUDIO_FEEDBACK_EVENT+JSON.stringify({recording_id:result.recording_id,content:result.content,instruction:practiceFeedbackInstruction(result.content,result.lesson)}));this.waiting=false;this.release();return true;}return false;}
 async review(promise){
  const version=this.version;this.reviewers++;let cancel;
  const cancelled=new Promise((resolve,reject)=>{cancel=message=>reject(new Error(message));this.cancellations.add(cancel);});
  try{return await Promise.race([promise,cancelled]);}
  finally{this.cancellations.delete(cancel);if(version===this.version){this.reviewers=Math.max(0,this.reviewers-1);clearTimeout(this.timer);this.waiting=false;this.release();}}
 }
 reset(message='The practice target or session changed.'){this.version++;clearTimeout(this.timer);for(const cancel of this.cancellations)cancel(message);this.cancellations.clear();this.reviewers=0;this.waiting=false;this.release();}
}
