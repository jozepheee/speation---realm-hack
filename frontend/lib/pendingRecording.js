// Opt-in through existing private-retention consent. Keys are non-extractable;
// same-origin scripts still have access, so this is not an authentication boundary.
async function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('speation-pending-recordings',1);request.onupgradeneeded=()=>{request.result.createObjectStore('clips',{keyPath:'key'});request.result.createObjectStore('keys');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function get(db,store,key){return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function write(db,store,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),target=tx.objectStore(store);if(value===undefined)target.delete(key);else if(store==='keys')target.put(value,key);else target.put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function pendingRecording(key,action,value){
 const db=await database();
 try{
  if(action==='remove'){await write(db,'clips',key);return null;}
  let encryption=await get(db,'keys','device');
  if(!encryption){encryption=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await write(db,'keys','device',encryption);}
  if(action==='save'){
   if(value.blob.size>20*1024*1024)throw Error('Recording is too large for local recovery');
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(key)},encryption,await value.blob.arrayBuffer());
   await write(db,'clips',key,{key,iv,encrypted,type:value.blob.type,attempt:value.attempt,savedAt:Date.now()});return true;
  }
  const row=await get(db,'clips',key);if(!row)return null;
  if(Date.now()-row.savedAt>86400000){await write(db,'clips',key);return null;}
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(key)},encryption,row.encrypted);
  return {blob:new Blob([bytes],{type:row.type}),attempt:row.attempt};
 }finally{db.close();}
}
