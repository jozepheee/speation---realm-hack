import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function ClinicalTasks({learner, goals}) {
  const {t, locale} = useLocale();
  const [rows,setRows]=useState([]), [error,setError]=useState(''), [busy,setBusy]=useState(false), [loading,setLoading]=useState(true), [filter,setFilter]=useState('all'),[kind,setKind]=useState('practice');
  async function load(signal) {const result=await portalApi(`/learners/${learner.id}/missions`,{signal});if(!signal?.aborted)setRows(result);}
  useEffect(()=>{const controller=new AbortController();load(controller.signal).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[learner.id]);
  async function assign(event) {
    event.preventDefault();const form=event.currentTarget, fields=new FormData(form);setBusy(true);setError('');
    try {await portalApi(`/learners/${learner.id}/missions`,{method:'POST',body:{title:fields.get('title'),instruction:fields.get('instruction'),goal_id:fields.get('goal')||null,kind,due_at:fields.get('due')?new Date(fields.get('due')).toISOString():null}});form.reset();setKind('practice');await load();}catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <section className={styles.panel} style={{marginTop:24}}><h2>{t('Assigned patient tasks')}</h2><p>{t('Assign home practice and read family-reported completion. Completion is separate from assessed speech performance.')}</p>
    {error&&<p role="alert" className={styles.error}>{t(error)}</p>}
    <label className={styles.form}>{t('Task status')}<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">{t('All tasks')}</option><option value="pending">{t('Pending tasks')}</option><option value="complete">{t('Reported complete')}</option></select></label>
    {loading?<p role="status">{t('Loading patient tasks…')}</p>:!rows.length?<p>{t('No tasks assigned to this patient yet.')}</p>:rows.filter(item=>filter==='all'||(filter==='complete'?!!item.completed_at:!item.completed_at)).map(item=><article className={styles.detail} key={item.id}><h3>{item.title}</h3><p>{item.instruction}</p><span className={styles.badge}>{t(item.kind||'practice')}</span> <span className={styles.badge}>{item.completed_at?t('Reported complete'):t('Pending task')}</span>{item.due_at&&<p>{t('Scheduled')}: {new Date(item.due_at).toLocaleString(locale)}</p>}{item.report&&<p>{item.report}</p>}</article>)}
    <form className={styles.form} onSubmit={assign}><h3>{t('Assign a task')}</h3><label>{t('Activity type')}<select value={kind} onChange={event=>setKind(event.target.value)}><option value="practice">{t('Everyday practice')}</option><option value="retention">{t('Delayed retention · reviewed word')}</option><option value="transfer">{t('Real-world transfer · conversation')}</option></select></label><label>{t('Title')}<input name="title" required maxLength={120}/></label><label>{t('Reviewed instructions')}<textarea name="instruction" required maxLength={1500}/></label><label>{kind==='practice'?t('Treatment goal, optional'):t('Reviewed goal, required for retention and transfer')}<select name="goal" required={kind!=='practice'}><option value="">{kind==='practice'?t('General practice'):t('Choose an approved goal')}</option>{goals.map(goal=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>{kind==='practice'?t('Schedule, optional'):t('Scheduled')}<input name="due" type="datetime-local" required={kind!=='practice'}/></label><button disabled={busy||!learner.consent?.practice_allowed}>{busy?t('Saving…'):t('Assign patient task')}</button></form>
  </section>;
}
