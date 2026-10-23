import {useEffect,useState} from 'react';
import {portalApi} from '../lib/portalApi';
export default function AICareReportQueue({onSelect}){
 const [rows,setRows]=useState([]),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();const refresh=()=>portalApi('/clinical/ai-care-reports',{signal:controller.signal}).then(setRows).catch(err=>{if(err.name!=='AbortError')setError(err.message);});void refresh();const interval=setInterval(refresh,30000);return()=>{clearInterval(interval);controller.abort();};},[]);
 return <section translate="no" lang="en" aria-label="AI reports awaiting clinician review"><h2>AI reports awaiting your review</h2>{error&&<p role="alert">{error}</p>}{rows.length?<ul>{rows.map(row=><li key={row.id}><button onClick={()=>onSelect(row.learner_id)}>{row.learner_name} · {new Date(row.created_at).toLocaleDateString()} · Review report</button></li>)}</ul>:<p>No AI reports are awaiting your decision.</p>}</section>;
}
