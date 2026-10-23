// Curated listening contrasts. Choosing one is not a diagnosis of the learner.
export const LISTENING_PAIRS=[
 {id:'k-t',label:'K / T',words:['key','tea'],pictures:['🔑','🍵']},
 {id:'r-w',label:'R / W',words:['ring','wing'],pictures:['💍','🪽']},
 {id:'s-sh',label:'S / SH',words:['sip','ship'],pictures:['🥤','🚢']},
 {id:'f-p',label:'F / P',words:['fan','pan'],pictures:['🪭','🍳']},
 {id:'g-b',label:'G / B',words:['goat','boat'],pictures:['🐐','⛵']},
 {id:'s-th',label:'S / TH',words:['sink','think'],pictures:['🚰','💭']}
];
export function pairForTarget(target,expectedPhone='',producedPhone=''){
 const contrast=[expectedPhone.replace('ɡ','g').replace('ɹ','r'),producedPhone.replace('ɡ','g').replace('ɹ','r')];
 const ids={'k-t':['k','t'],'r-w':['r','w'],'s-sh':['s','ʃ'],'f-p':['f','p'],'s-th':['s','θ'],'g-b':['g','b']};
 const match=contrast.every(Boolean)?LISTENING_PAIRS.find(pair=>ids[pair.id]?.every(phone=>contrast.includes(phone))):null;
 return match||LISTENING_PAIRS.find(pair=>pair.words.some(word=>word===target?.trim().toLowerCase()))||null;
}
export function listeningSummary(answers){return {completed:answers.length===4,correct:answers.filter(item=>item.correct).length,total:answers.length,kind:'listening_choices',speech_accuracy:null};}

function openModels(){return new Promise((resolve,reject)=>{const request=indexedDB.open('speation-familiar-models',1);request.onupgradeneeded=()=>request.result.createObjectStore('models');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('This browser could not open local demonstration storage.'));});}
export async function localDemonstration(key,value){
 const db=await openModels();try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('models',value===undefined?'readonly':'readwrite'),store=transaction.objectStore('models');let result;const request=value===undefined?store.get(key):value===null?store.delete(key):store.put(value,key);request.onsuccess=()=>{result=request.result;};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(Error('The local demonstration could not be saved.'));transaction.onabort=()=>reject(Error('Local demonstration storage was interrupted.'));});}finally{db.close();}
}
