import {useEffect} from 'react';
export function TreatAnimation({playing,onDone}){useEffect(()=>{if(playing)onDone?.();},[playing,onDone]);return null;}
