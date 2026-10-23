import {useCallback,useEffect,useRef,useState} from 'react';
import {portalApi} from '../lib/portalApi';
export default function useSpeechPlayer(learnerId,language,voiceId='',rate=1){
 const player=useRef(null),request=useRef(null),version=useRef(0),cache=useRef(new Map()),prefetches=useRef(new Map()),epoch=useRef(0);
 const [speaking,setSpeaking]=useState(false),[loading,setLoading]=useState(false),[autoplayBlocked,setAutoplayBlocked]=useState(false),[error,setError]=useState('');
 const stop=useCallback(()=>{version.current++;request.current?.abort();player.current?.pause();setSpeaking(false);setLoading(false);},[]);
 useEffect(()=>{stop();epoch.current++;cache.current.clear();setError('');setAutoplayBlocked(false);return()=>{stop();epoch.current++;for(const item of prefetches.current.values())item.controller.abort();prefetches.current.clear();};},[learnerId,language,voiceId,stop]);
 function prefetch(text,speaker='maya'){
  if(!text?.trim())return Promise.resolve();const spoken=text.slice(0,1000),key=`${speaker}:${spoken}`;
  if(cache.current.has(key))return Promise.resolve(cache.current.get(key));
  if(prefetches.current.has(key))return prefetches.current.get(key).promise;
  const controller=new AbortController(),identity=epoch.current;
  const promise=portalApi(`/learners/${learnerId}/speak`,{method:'POST',body:{text:spoken,language,speaker,...(voiceId?{voice_id:voiceId}:{})},signal:controller.signal,timeoutMs:45000}).then(result=>{
   if(identity===epoch.current&&result.audio_base64){cache.current.set(key,result);if(cache.current.size>8)cache.current.delete(cache.current.keys().next().value);}return result;
  }).catch(()=>null).finally(()=>{if(prefetches.current.get(key)?.controller===controller)prefetches.current.delete(key);});
  prefetches.current.set(key,{controller,promise});return promise;
 }
 async function speak(text,speaker='maya',playbackRate=rate){
  if(!text?.trim())return false;stop();const current=version.current;request.current=new AbortController();setSpeaking(true);setError('');setAutoplayBlocked(false);
  const spoken=text.slice(0,1000),key=`${speaker}:${spoken}`;
  try{let result=cache.current.get(key);
   if(!result){setLoading(true);result=prefetches.current.has(key)?await prefetches.current.get(key).promise:await portalApi(`/learners/${learnerId}/speak`,{method:'POST',body:{text:spoken,language,speaker,...(voiceId?{voice_id:voiceId}:{})},signal:request.current.signal,timeoutMs:45000});}
   if(current!==version.current)return false;
   if(typeof result?.audio_base64!=='string'||!result.audio_base64)throw new Error('Maya’s voice service returned no audio. Please try Listen again.');
   cache.current.set(key,result);if(cache.current.size>8)cache.current.delete(cache.current.keys().next().value);setLoading(false);
   if(current!==version.current)return false;const audio=new Audio(`data:audio/mpeg;base64,${result.audio_base64}`);player.current=audio;audio.playbackRate=playbackRate;
   await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onpause=resolve;audio.onerror=()=>reject(new Error('Audio playback failed. Please try again.'));audio.play().catch(reject);});
   return current===version.current;
  }catch(err){if(current===version.current&&err.name!=='AbortError'){setAutoplayBlocked(err.name==='NotAllowedError');setError(err.name==='NotAllowedError'?'Your browser blocked audio. Select Enable audio to hear Maya.':err.message);}return false;}
  finally{if(current===version.current){setSpeaking(false);setLoading(false);}}
 }
 return {speak,stop,prefetch,speaking,loading,autoplayBlocked,error};
}
