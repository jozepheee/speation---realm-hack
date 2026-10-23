import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function GuidedPracticeReview({learner,onInspect}) {
 const {t,locale}=useLocale();
 const [rows,setRows]=useState([]),[detail,setDetail]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setRows([]);setDetail(null);portalApi(`/learners/${learner.id}/guided-practice`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setRows(data);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[learner.id]);
 return <section className={styles.panel} style={{marginBottom:24}}><h2>{t('Guided activity context')}</h2><p>{t('See the demonstration, generated scene or target word alongside its saved recording. Video participation is not a movement assessment.')}</p>
  {error&&<p role="alert" className={styles.error}>{t(error)}</p>}
  {loading?<p role="status">{t('Loading patient activity…')}</p>:!error&&!rows.length&&<p>{t('No guided activities recorded yet.')}</p>}
  <div className={styles.roster}>{rows.map(item=><button key={item.id} disabled={busy} className={styles.learner} onClick={async()=>{setBusy(true);setError('');try{setDetail(await portalApi(`/guided-practice/${item.id}`));}catch(err){setError(err.message);}finally{setBusy(false);}}}><span><strong>{t(item.content.title)}</strong><small>{item.content.expected_text} · {new Date(item.created_at).toLocaleString(locale)}</small></span><span className={styles.badge}>{item.completed_at?t('Activity saved'):t('In progress')}</span></button>)}</div>
  {detail&&<article className={styles.detail}><h3>{t(detail.content.title)}</h3>{detail.content.video&&<video controls playsInline preload="metadata" src={detail.content.video} aria-label={t(detail.content.title)} style={{width:'100%',maxHeight:350,borderRadius:16}}/>}{detail.content.image_data_url&&<img src={detail.content.image_data_url} alt={t('AI-generated practice scene')} style={{width:'100%',maxHeight:350,objectFit:'contain'}}/>}<p>{detail.content.expected_text}</p>{detail.content.movement_analysis&&<p>{t('Camera movement repetitions')}: <strong>{detail.content.movement_analysis.reps}</strong> · {t('Set')} {detail.content.movement_analysis.set_number||1} / 3 · {t('Local camera measurements are not a clinical assessment.')}</p>}{detail.recording_id?<button onClick={()=>onInspect(detail.recording_id)}>{t('Review the linked recording')}</button>:<p>{t('No recording attached. Participation alone is not assessed performance.')}</p>}</article>}
 </section>;
}
