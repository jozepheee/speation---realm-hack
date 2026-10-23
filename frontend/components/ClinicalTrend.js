import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../context/LocaleContext';
import styles from '../styles/clinical-analytics.module.css';

export default function ClinicalTrend({days,series,selectedDate,onSelect,label}){
 const {locale}=useLocale(),host=useRef(null),[width,setWidth]=useState(680);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.max(240,Math.round(entry.contentRect.width))));observer.observe(host.current);return()=>observer.disconnect();},[]);
 const height=260,left=42,right=18,top=22,bottom=38;
 const max=Math.max(1,...days.flatMap(day=>series.map(item=>day.counts[item.key]||0)));
 const ceiling=Math.max(1,Math.ceil(max/4)*4),x=index=>left+(days.length===1?.5:index/Math.max(1,days.length-1))*(width-left-right),y=value=>height-bottom-value/ceiling*(height-top-bottom);
 const selected=days.findIndex(day=>day.date===selectedDate);
 const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString(locale,{month:'short',day:'numeric',timeZone:'UTC'});
 const ticks=[...new Set([0,Math.floor((days.length-1)/2),days.length-1])].filter(index=>index>=0);
 return <div ref={host} className={styles.trend}>
  <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
   {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={y(ceiling*i/4)} y2={y(ceiling*i/4)} stroke="#dce6e2" strokeDasharray={i?'4 5':undefined}/><text x={left-10} y={y(ceiling*i/4)+4} textAnchor="end" className={styles.axis}>{ceiling*i/4}</text></g>)}
   {selected>=0&&<line x1={x(selected)} x2={x(selected)} y1={top} y2={height-bottom} stroke="#94a99f" strokeDasharray="3 5"/>}
   {series.map(item=>{const points=days.map((day,index)=>`${x(index)},${y(day.counts[item.key]||0)}`).join(' ');return <g key={item.key}>
    {series.length===1&&days.length>1&&<polygon points={`${x(0)},${y(0)} ${points} ${x(days.length-1)},${y(0)}`} fill={item.color} opacity=".1"/>}
    <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
    {days.map((day,index)=><circle key={day.date} cx={x(index)} cy={y(day.counts[item.key]||0)} r={selectedDate===day.date?5:3} fill="white" stroke={item.color} strokeWidth="2"/>)}
   </g>;})}
   {days.map((day,index)=><g key={day.date} role="button" tabIndex={0} aria-pressed={day.date===selectedDate} aria-label={`${day.date}: ${series.map(item=>`${item.label} ${day.counts[item.key]||0}`).join(', ')}`} onClick={()=>onSelect(day.date)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();onSelect(day.date);}}}>
    <rect x={x(index)-Math.min(12,(width-left-right)/Math.max(2,days.length)/2)} y={top} width={Math.min(24,(width-left-right)/Math.max(2,days.length))} height={height-top-bottom} fill="transparent"/>
    <title>{dateLabel(day.date)} · {series.map(item=>`${item.label}: ${day.counts[item.key]||0}`).join(' · ')}</title>
   </g>)}
   {ticks.map(index=><text key={index} x={x(index)} y={height-12} textAnchor={index===0?'start':index===days.length-1?'end':'middle'} className={styles.axis}>{dateLabel(days[index].date)}</text>)}
  </svg>
 </div>;
}
