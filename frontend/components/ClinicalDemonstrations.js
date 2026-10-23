import {useEffect,useRef,useState} from 'react';
import {portalApi,privateAudio} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function ClinicalDemonstrations({learner}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
 const version=useRef(0),url=useRef(null);
 async function load(){const current=version.current;const result=await portalApi(`/learners/${learner.id}/demonstrations`);if(current===version.current)setRows(result);}
 useEffect(()=>{const current=++version.current;setRows([]);setPreview(null);setError('');setBusy(false);if(url.current){URL.revokeObjectURL(url.current);url.current=null;}void load().catch(err=>{if(current===version.current)setError(err.message);});return()=>{version.current++;if(url.current)URL.revokeObjectURL(url.current);};},[learner.id]);
 async function watch(row){setBusy(true);setError('');const current=version.current;try{const blob=await privateAudio(`/demonstrations/${row.id}/media`);if(current!==version.current)return;if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(blob);setPreview({...row,url:url.current});}catch(err){if(current===version.current)setError(err.message);}finally{if(current===version.current)setBusy(false);}}
 async function review(row,approved){const current=version.current;setBusy(true);setError('');try{await portalApi(`/demonstrations/${row.id}/review`,{method:'PUT',body:{approved}});if(current===version.current)await load();}catch(err){if(current===version.current)setError(err.message);}finally{if(current===version.current)setBusy(false);}}
 async function upload(event){event.preventDefault();const current=version.current;setBusy(true);setError('');const form=event.currentTarget;try{const data=new FormData(form);await portalApi(`/learners/${learner.id}/demonstrations`,{method:'POST',body:data,timeoutMs:30000});if(current===version.current){form.reset();await load();}}catch(err){if(current===version.current)setError(err.message);}finally{if(current===version.current)setBusy(false);}}
 return <section lang="en" translate="no" className={styles.panel} style={{marginTop:24}}><h2>Practice demonstrations</h2><p>Review a family example or record/upload your own model. Approved examples appear beside the learner’s camera in Learn with Maya.</p>
 {error&&<p role="alert">{error}</p>}
 {preview&&(preview.media_type.startsWith('video/')?<video src={preview.url} controls playsInline style={{maxWidth:'100%',maxHeight:260}}/>:<audio src={preview.url} controls/>)}
 {rows.length?rows.map(row=><article className={styles.detail} key={row.id}><strong>{row.target}</strong><p>{row.status.replaceAll('_',' ')}</p><button disabled={busy} onClick={()=>watch(row)}>Review example</button><button disabled={busy} onClick={()=>review(row,true)}>Approve demonstration</button><button disabled={busy} onClick={()=>review(row,false)}>Request a replacement</button></article>):<p>No shared demonstrations yet.</p>}
 <form className={styles.form} onSubmit={upload}><h3>Add your demonstration</h3><label>Word or short phrase<input name="target" required maxLength={120}/></label><label>Audio or video · up to 20 MB and 60 seconds<input name="media" type="file" accept="audio/*,video/*" required/></label><label><input name="adult_permission" type="checkbox" value="true" required/> I am the adult demonstrating, or have their permission.</label><button disabled={busy}>{busy?'Saving…':'Save clinician example'}</button></form>
 </section>;
}
