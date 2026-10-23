/** Bind original audio, meaning candidates and a separate spoken answer. */
export function normalizeMeaning(text){return String(text||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();}
export class DailyIntentFlow {
 constructor(){this.turns=[];this.active=null;this.sequence=0;this.latest=null;this.pending=null;this.questions=[];}
 speechStart(){if(!this.active){this.active={id:crypto.randomUUID(),at:Date.now(),text:'',upload:null};this.turns.push(this.active);this.turns=this.turns.slice(-12);}return this.active;}
 clip(){const turn=this.active||this.speechStart();this.active=null;return turn;}
 transcript(text){const now=Date.now();let turn=this.active&&!this.active.text?this.active:[...this.turns].reverse().find(t=>!t.text&&now-t.at<20000);
  if(!turn){turn=this.speechStart();}turn.text=String(text||'');turn.sequence=++this.sequence;this.latest=turn;return turn;}
 saved(turn,promise){turn.upload=promise;void promise.then(record=>{turn.recordingId=record?.id;}).catch(()=>{});}
 async original(turn=this.latest){if(!turn?.text)throw Error('No recent learner message is available.');
  for(let i=0;i<30&&!turn.upload;i++)await new Promise(resolve=>setTimeout(resolve,50));
  if(!turn.upload)throw Error('That message has no captured audio. Ask the learner to say it again naturally.');
  const record=await turn.upload;if(!record?.id)throw Error('The audio turn was not saved.');return {turn,record};}
 proposed(value,turn){const original=this.turns.find(item=>item.recordingId===value.recording_id)||turn;
  this.pending={...value,sequence:original.sequence,askedAfter:null};for(const question of this.questions)this.matchQuestion(question);}
 matchQuestion(question){const pending=this.pending;
  if(pending?.candidate&&pending.askedAfter===null&&question.sequence>=pending.sequence&&normalizeMeaning(question.text).includes(normalizeMeaning(pending.candidate)))pending.askedAfter=question.sequence;
 }
 agent(text){if(!/[?？]|എന്നാണോ|ഉദ്ദേശിച്ചതാണോ/.test(String(text)))return;
  const question={text:String(text),sequence:this.sequence};this.questions.push(question);this.questions=this.questions.slice(-12);this.matchQuestion(question);
 }
 async response(id){const pending=this.pending;
  const response=pending&&this.turns.find(turn=>turn.text&&turn.sequence>pending.askedAfter&&turn.sequence>pending.sequence);
  if(!pending||pending.id!==id||pending.askedAfter===null||!response)throw Error('Wait until the learner answers the meaning question.');
  const {turn,record}=await this.original(response);return {response_text:turn.text,confirmation_recording_id:record.id};}
}
