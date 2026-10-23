import {portalApi} from './portalApi';

// Retain the same mutation ID after a timeout/reload. This is an event outbox,
// not a local pronunciation assessment and never contains a raw recording.
export async function saveLearningEvent(scope,session,payload){
 const key=`speation:learning-event:${scope}:${session.id}:${payload.action}:${payload.index??0}`;
 let request;try{request=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 if(!request||JSON.stringify(request.payload)!==JSON.stringify(payload)){
  request={request_id:crypto.randomUUID(),payload};
  localStorage.setItem(key,JSON.stringify(request));
 }
 const result=await portalApi(`/learning-sessions/${session.id}/events`,{
  method:'POST',body:{...payload,request_id:request.request_id},timeoutMs:20000});
 localStorage.removeItem(key);return result;
}

export async function startLearningSession(scope,payload){
 const key=`speation:learning-start:${scope}:${payload.kind}`;
 let request;try{request=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 if(!request||JSON.stringify(request.payload)!==JSON.stringify(payload)){
  request={request_id:crypto.randomUUID(),payload};localStorage.setItem(key,JSON.stringify(request));
 }
 const result=await portalApi(`/learners/${scope.split(':').at(-1)}/learning-sessions`,{
  method:'POST',body:{...payload,request_id:request.request_id},timeoutMs:20000});
 localStorage.removeItem(key);return result;
}
