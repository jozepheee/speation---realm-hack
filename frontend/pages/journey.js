import {useEffect,useRef,useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import useLearners from '../hooks/useLearners';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/journey.module.css';

const PLANETS=[{title:'Listen and say',image:'planet1.png',href:'/arcade',detail:'Bake a treat with your voice.'},{title:'Build a sentence',image:'planet2.png',href:'/companion?mode=practice',detail:'Practise a word and use it with Maya.'},{title:'Your own message',image:'planet3.png',href:'/speech-translator',detail:'Say what matters and hear your confirmed message.'}];
const POSITIONS={head:{left:'27%',top:'4%',width:'47%'},neck:{left:'34%',top:'46%',width:'33%'},hands:{left:'62%',top:'62%',width:'25%'}};
export default function Journey(){
 const {learner,learners,selected,setSelected}=useLearners();
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState('map');
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setData(null);setError('');setBusy(false);if(!selected)return;const request=new AbortController();portalApi(`/learners/${selected}/journey`,{signal:request.signal}).then(setData).catch(err=>{if(err.name!=='AbortError')setError(err.message);});return()=>request.abort();},[selected]);
 async function change(item,owned){const current=generation.current;setBusy(true);setError('');try{const result=await portalApi(`/learners/${selected}/journey/${owned?'equipped/':'items/'}${item.id}`,{method:owned?'PUT':'POST'});if(current===generation.current)setData(result);}catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}}
 return <ProtectedRoute><Head><title translate="no">Speech journey · Speation</title></Head><Navbar/><main translate="no" lang="en" className={styles.main}>
  <header className={styles.header}><div><p>YOUR SPEECH ADVENTURE</p><h1>Small steps. New worlds.</h1><p>Explore, practise and dress your space explorer.</p></div>{data&&<div className={styles.balance}><strong>{data.balance}</strong><span>practice coins</span></div>}</header>
  {learners.length>1&&<label>Learner<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}>{learners.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>}
  {!learner?<p>Create a learner profile to start your journey.</p>:<>
   <nav className={styles.tabs} aria-label="Journey sections">{['map','avatar','shop'].map(name=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name==='map'?'Explore':name==='avatar'?'My explorer':'Cosmetic shop'}</button>)}<Link href="/practice-hub">All practice</Link></nav>
   {error&&<p role="alert">{error}</p>}
   {!data&&!error&&<p role="status">Loading your journey…</p>}
   {data&&tab==='map'&&<section className={styles.map} aria-label="Speech journey map"><img className={styles.ship} src="/journey/spaceship.png" alt=""/>{PLANETS.map((planet,index)=><Link href={planet.href} className={styles.planet} key={planet.title}><img src={'/journey/'+planet.image} alt=""/><span>World {index+1}</span><h2>{planet.title}</h2><p>{planet.detail}</p><strong>Explore →</strong></Link>)}</section>}
   {data&&tab==='avatar'&&<section className={styles.explorer}><div className={styles.avatar}><img src="/journey/trainer.png" alt="Your space explorer"/>{data.equipped.map(id=>{const item=data.catalog.find(item=>item.id===id);return item&&<img key={id} src={'/journey/items/'+item.id+'.png'} alt={item.name} style={{position:'absolute',...POSITIONS[item.slot]}}/>;})}</div><h2>Your explorer</h2><p>{data.equipped.length?'Choose an owned item below to wear it or take it off.':'Visit the shop to choose a look.'}</p><div className={styles.owned}>{data.catalog.filter(item=>data.owned.includes(item.id)).map(item=><button key={item.id} disabled={busy} aria-pressed={data.equipped.includes(item.id)} onClick={()=>change(item,true)}>{item.name}{data.equipped.includes(item.id)?' · Wearing':''}</button>)}</div></section>}
   {data&&tab==='shop'&&<section className={styles.shop} aria-label="Cosmetic shop">{data.catalog.map(item=>{const owned=data.owned.includes(item.id);return <article key={item.id}><img src={'/journey/items/'+item.id+'.png'} alt=""/><h2>{item.name}</h2><p>{owned?'Owned':item.price+' coins'}</p><button disabled={busy||!owned&&data.balance<item.price} onClick={()=>change(item,owned)}>{owned?(data.equipped.includes(item.id)?'Take off':'Wear it'):'Get item'}</button></article>;})}</section>}
   {data&&<footer className={styles.note}><strong>{data.practice_days} practice days · {data.practice_words} different word-day attempts</strong><p>Earn 10 coins for each different English practice target, up to five each day. Retries never cost coins. Rewards celebrate participation; they are not speech accuracy scores.</p><p>All worlds stay available. Cosmetics use practice coins, never money.</p></footer>}
  </>}
 </main></ProtectedRoute>;
}
