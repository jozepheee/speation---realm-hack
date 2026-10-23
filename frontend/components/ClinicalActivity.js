import {useEffect,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
import charts from '../styles/clinical-analytics.module.css';
import ClinicalTrend from './ClinicalTrend';
import {activityDays,activityComparison} from '../lib/clinicalAnalytics';

export default function ClinicalActivity({learner}){
 const {t,locale}=useLocale();
 const kinds=[['recordings',t('Recordings'),'#286650'],['games',t('Completed games'),'#426aaf'],['exercise_stages',t('Completed practice stages'),'#b46627'],['calls',t('Completed calls'),'#806497'],['family_reports',t('Family completion reports'),'#207b83']];
 const [range,setRange]=useState('30'),[data,setData]=useState(null),[date,setDate]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0),[filter,setFilter]=useState('all');
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');setDate('');
  portalApi(`/clinical/learners/${learner.id}/activity?days=${range}`,{signal:controller.signal}).then(setData).catch(err=>{if(!controller.signal.aborted)setError(err.message);});return()=>controller.abort();
 },[learner.id,range,retry]);
 const days=data?activityDays(data):[];
 const sum=counts=>Object.values(counts).reduce((a,b)=>a+b,0);
 const selected=days.find(day=>day.date===date)||[...days].reverse().find(day=>sum(day.counts)>0)||days.at(-1);
 const comparison=data?activityComparison(data):null;
 const plotted=days.map(day=>({...day,counts:{value:filter==='all'?sum(day.counts):day.counts[filter]||0}}));
 const focus=kinds.find(([key])=>key===filter);
 const selectedCount=selected?(filter==='all'?sum(selected.counts):selected.counts[filter]||0):0;
 const week=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,0,4+i)).toLocaleDateString(locale,{weekday:'short',timeZone:'UTC'}));
 return <section className={styles.panel} style={{marginTop:24}}>
  <div className={styles.chartHeader}><h2>{t('Patient activity over time')}</h2><label className={styles.form}>{t('Activity time range')}<select value={range} onChange={event=>setRange(event.target.value)}><option value="7">{t('Last 7 days')}</option><option value="30">{t('Last 30 days')}</option></select></label></div>
  <p>{t('Explore activity, consistency and participation. Reviewed speech outcomes remain separate. Dates use UTC.')}</p>
  {error&&<p role="alert" className={styles.error}>{t(error)}</p>}
  {!data&&!error&&<p role="status">{t('Loading patient activity…')}</p>}
  {data&&<>
   <div className={charts.hero}>
    <div><strong>{data.truncated?'≥ ':''}{comparison.total}</strong><span>{t('Saved activities')}</span><small>{t('Last {days} days',{days:data.days})}</small></div>
    <div><strong>{comparison.activeDays}<span style={{display:'inline',fontSize:'1rem'}}> / {data.days}</span></strong><span>{t('Active days')}</span><small>{t('Days with recorded participation')}</small></div>
    <div><strong>{comparison.change===null?'—':`${comparison.change>0?'+':''}${comparison.change}`}</strong><span>{t('Activity change')}</span><small>{data.truncated?t('History is incomplete'):comparison.previous===null?t('Previous period unavailable'):t('{count} in the previous {days} days',{count:comparison.previous,days:data.days})}</small></div>
   </div>
   <div className={charts.filters} aria-label={t('Filter activity types')}><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{t('All activity')}</button>{kinds.map(([key,label,color])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}><i style={{background:color}}/>{label}</button>)}</div>
   <div className={charts.grid}>
    <section className={charts.card}><h3>{t('Daily activity trend')}</h3><p>{focus?.[1]||t('All activity')} · {t('Select a point to inspect that day.')}</p>
     {days.length?<ClinicalTrend days={plotted} series={[{key:'value',label:focus?.[1]||t('All activity'),color:focus?.[2]||'#286650'}]} selectedDate={selected?.date} onSelect={setDate} label={t('Daily activity trend')}/>:<div className={charts.empty}>{t('No saved activity in this period.')}</div>}
    </section>
    <section className={charts.card}><h3>{t('Activity breakdown')}</h3>
     <svg className={charts.donut} viewBox="0 0 200 200" role="img" aria-label={t('Activities: {count}',{count:comparison.total})}><circle cx="100" cy="100" r="70" fill="none" stroke="#e7eeea" strokeWidth="22"/>
      {comparison.total>0&&kinds.map(([key,,color],index)=>data.totals[key]>0&&<circle key={key} cx="100" cy="100" r="70" fill="none" stroke={color} strokeWidth="22" transform="rotate(-90 100 100)" strokeDasharray={`${data.totals[key]/comparison.total*439.823} 439.823`} strokeDashoffset={-kinds.slice(0,index).reduce((total,[name])=>total+data.totals[name],0)/comparison.total*439.823} opacity={filter==='all'||filter===key?1:.25}/>)}
      <text x="100" y="103" textAnchor="middle" fontSize="34" fontWeight="700">{comparison.total}</text><text x="100" y="125" textAnchor="middle" fontSize="12">{t('Total')}</text>
     </svg>
     <div className={charts.mix}>{kinds.map(([key,label,color])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(filter===key?'all':key)}><span><i style={{background:color}}/>{label}</span><strong>{data.totals[key]}</strong></button>)}</div>
    </section>
    <section className={charts.card}><h3>{t('Activity calendar')}</h3><p>{t('Choose a day to see its saved activity. Darker cells mean more participation.')}</p>
     <div className={charts.calendar}>{week.map((label,i)=><small key={i}>{label}</small>)}
      {days.map(day=>{const total=filter==='all'?sum(day.counts):day.counts[filter]||0;return <button key={day.date} aria-pressed={selected?.date===day.date} aria-label={`${day.date}: ${t('Activities: {count}',{count:total})}`} onClick={()=>setDate(day.date)} style={{gridColumn:new Date(day.date+'T12:00:00Z').getUTCDay()+1,background:total>5?'#174c3f':total>2?'#54866c':total?'#c3decc':'#f1f5f2',color:total>2?'white':'#244e3a'}}>{Number(day.date.slice(-2))}</button>;})}
     </div>
    </section>
    <section className={charts.card} aria-live="polite"><h3>{t('Selected day')}</h3>{selected?<><p>{new Date(selected.date+'T12:00:00Z').toLocaleDateString(locale,{dateStyle:'full',timeZone:'UTC'})}</p><p><strong>{t('Activities: {count}',{count:selectedCount})}</strong></p><div className={charts.details}>{kinds.map(([key,label])=><div className={charts.detailRow} key={key}><span>{label}</span><strong>{selected.counts[key]}</strong></div>)}</div></>:<p>{t('No saved activity in this period.')}</p>}</section>
   </div>
   {data.truncated&&<p>{t('Activity history is limited to 10,000 rows per type across both periods. Comparisons are unavailable and missing days are not assumed to be zero.')}</p>}
  </>}
  <button onClick={()=>setRetry(value=>value+1)}>{t('Refresh activity')}</button>
 </section>;
}
