import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import styles from '../styles/workspace.module.css';
import { reviewSeries, outcomes } from '../lib/patientPerformance';
import ClinicalTrend from './ClinicalTrend';
const colors = ['#286650', '#426aaf', '#b46627', '#806497'];
export default function PatientPerformance({ summary, records, goals }) {
  const { t, locale } = useLocale();
  const [range, setRange] = useState('30'), [selectedDate, setSelectedDate] = useState('');
  const { days, max } = reviewSeries(summary, range);
  const day = days.find(item => item.date === selectedDate);
  return <div>
    <div className={styles.metricGrid}>
      {[[summary.recordings, 'Recordings'], [summary.pending_reviews, 'Awaiting review'], [goals.length, 'Active treatment goals'], [records.filter(item => item.review_status !== 'pending').length, 'Reviewed recordings']].map(([count, label]) => <div key={label}><strong>{count}</strong><span>{t(label)}</span></div>)}
    </div>
    <div className={styles.chartHeader}><h3>{t('Reviewed outcomes over time')}</h3><label className={styles.form}>{t('Time range')}<select value={range} onChange={event => {setRange(event.target.value);setSelectedDate('');}}><option value="7">{t('Last 7 days')}</option><option value="30">{t('Last 30 days')}</option><option value="all">{t('Available history')}</option></select></label></div>
    <p>{t('Counts of human-reviewed attempts, not an automatic pronunciation score. Select a day to inspect its outcomes.')}</p>
    <div className={styles.chartLegend}>{outcomes.map((name, index) => <span key={name}><i style={{background:colors[index]}} />{t(name)}</span>)}</div>
    {!days.length ? <p className={styles.chartEmpty}>{t('No reviewed attempts in this period. A graph will appear after recordings receive clinician reviews.')}</p> : <ClinicalTrend days={days.map(item=>({date:item.date,counts:item.outcomes}))} series={outcomes.map((key,index)=>({key,label:t(key),color:colors[index]}))} selectedDate={selectedDate} onSelect={setSelectedDate} label={t('Reviewed outcomes over time')}/>}
    {day && <div aria-live="polite" className={styles.dayDetail}><strong>{day.date}</strong>{outcomes.map(name => <span key={name}>{t(name)}: {day.outcomes[name] || 0}</span>)}</div>}
    <h3>{t('Targets needing attention')}</h3>
    {!(summary.targets || []).length && <p>{t('No assessed targets yet. Review a recording to begin tracking sound and context outcomes.')}</p>}
    {(summary.targets || []).map(item => {const total=Object.values(item.outcomes).reduce((a,b)=>a+b,0); return <div key={`${item.language}:${item.sound}:${item.context}`} className={styles.targetChart}>
      <strong>/{item.sound}/ · {t(item.context)} · {item.language.toUpperCase()}</strong>
      <div className={styles.targetBar}>{outcomes.map((name,index) => <span key={name} title={`${t(name)}: ${item.outcomes[name]}`} style={{width:`${(item.outcomes[name] || 0)/Math.max(1,total)*100}%`,background:colors[index]}} />)}</div>
      <small>{outcomes.map(name => `${t(name)}: ${item.outcomes[name] || 0}`).join(' · ')}</small>
    </div>;})}
  </div>;
}
