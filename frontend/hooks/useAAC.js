import {useEffect,useState} from 'react';
import {useAuth} from '../context/AuthContext';
export default function useAAC(){
 const {user}=useAuth(),key=user?.id?`speation:aac:${user.id}`:null;
 const [preference,setPreference]=useState({key:null,enabled:false});
 useEffect(()=>{const read=()=>{let enabled=false;try{enabled=!!key&&localStorage.getItem(key)==='true';}catch{}setPreference({key,enabled});};read();window.addEventListener('storage',read);window.addEventListener('speation-aac',read);return()=>{window.removeEventListener('storage',read);window.removeEventListener('speation-aac',read);};},[key]);
 return {enabled:preference.key===key&&preference.enabled,setEnabled(value){if(!key)throw Error('Sign in to change AAC settings.');localStorage.setItem(key,String(!!value));setPreference({key,enabled:!!value});window.dispatchEvent(new Event('speation-aac'));}};
}
