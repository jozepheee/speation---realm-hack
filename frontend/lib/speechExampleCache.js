// Account/learner-scoped generated examples only; never learner recordings.
export async function speechExampleCache(scope,text,language,value){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('speation-generated-examples',1);request.onupgradeneeded=()=>request.result.createObjectStore('examples',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const key=JSON.stringify([scope,language,text]);
 try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('examples',value?'readwrite':'readonly'),store=transaction.objectStore('examples');let result=null;
  if(value){store.put({key,scope,savedAt:Date.now(),speech:value});const all=store.getAll();all.onsuccess=()=>{const rows=all.result.filter(row=>row.scope===scope).sort((a,b)=>b.savedAt-a.savedAt);for(const row of rows.slice(30))store.delete(row.key);};result=value;}
  else{const request=store.get(key);request.onsuccess=()=>{const row=request.result;if(row&&Date.now()-row.savedAt<7*86400000)result=row.speech;};}
  transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
 });}finally{db.close();}
}
