import {useEffect,useRef,useState} from 'react';
import {privateAudio} from '../lib/portalApi';
export default function AttemptReplay({id,disabled,onBeforePlay,onPlayingChange}){
 const [source,setSource]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef(null),url=useRef(''),active=useRef(true),player=useRef(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();player.current?.pause();if(url.current)URL.revokeObjectURL(url.current);onPlayingChange?.(false);};},[id]);
 async function load(){setBusy(true);setError('');controller.current=new AbortController();try{const blob=await privateAudio(`/recordings/${id}/audio`,{signal:controller.current.signal});if(!active.current)return;if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(blob);setSource(url.current);}catch(err){if(active.current&&err.name!=='AbortError')setError(err.message);}finally{if(active.current)setBusy(false);}}
 return <div lang="en" translate="no"><button disabled={disabled||busy} onClick={load}>{busy?'Loading my recording…':'Replay my attempt'}</button>{source&&<audio ref={player} autoPlay controls src={source} onPlay={event=>{if(disabled){event.currentTarget.pause();return;}onBeforePlay?.();onPlayingChange?.(true);}} onPause={()=>onPlayingChange?.(false)} onEnded={()=>onPlayingChange?.(false)}/>} {error&&<p role="alert">{error}</p>}</div>;
}
