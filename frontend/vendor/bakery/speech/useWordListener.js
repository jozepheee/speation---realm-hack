// Speation adapter: actual retained audio is assessed, never browser text alone.
import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {BakerySpeech} from '../../../components/BakeryGame';
import {stopSpeaking,letMicSettle} from './speak';
export function useWordListener(){
 const speech=useContext(BakerySpeech),active=useRef(false),alive=useRef(true),[status,setStatus]=useState('idle');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(active.current)speech?.cancel();};},[speech?.cancel]);
 const listen=useCallback(async check=>{
  if(active.current)return {status:'busy',heardOptions:[]};active.current=true;stopSpeaking();setStatus('listening');
  try{const result=await speech.listen(check.word,check.soundId,check.level||'word');if(alive.current)setStatus(['uncertain','error'].includes(result.status)?result.status:'idle');return result;}
  finally{active.current=false;letMicSettle();}
 },[speech?.listen]);
 return {status,listen};
}
export const LISTEN_MESSAGES={uncertain:'I could not check that clearly. Listen once more, then try again.',error:'The sound check is unavailable. Your attempt has not been marked correct. Try again shortly.'};
