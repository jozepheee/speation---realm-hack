import {useEffect,useRef,useState} from 'react';
import Head from 'next/head';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import StudentSpeakingWorkspace from '../components/StudentSpeakingWorkspace';
import useLearners from '../hooks/useLearners';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
const SCENES={everyday:'Everyday conversations',classroom:'Speak in class',storytelling:'Tell a story',interview:'Mock interview',presentation:'Presentation practice',discussion:'Group discussion'};
const OPENINGS={
 en:{everyday:'Imagine you need help finding a book. What would you say?',classroom:'Tell your class about something interesting you learned.',storytelling:'Tell me a short story about an unexpected adventure.',interview:'Tell me about yourself and a project or activity you enjoyed.',presentation:'Introduce a topic you care about. What should your audience learn?',discussion:'Should students have more time for creative activities? Give your opinion and one reason.'},
 hi:{everyday:'सोचिए आपको एक किताब ढूँढने में मदद चाहिए। आप क्या कहेंगे?',classroom:'अपनी कक्षा को कोई दिलचस्प बात बताइए जो आपने सीखी।',storytelling:'किसी अनोखे अनुभव की छोटी कहानी सुनाइए।',interview:'अपने बारे में और अपने किसी पसंदीदा प्रोजेक्ट या गतिविधि के बारे में बताइए।',presentation:'अपनी पसंद का विषय प्रस्तुत कीजिए। श्रोताओं को क्या सीखना चाहिए?',discussion:'क्या विद्यार्थियों को रचनात्मक गतिविधियों के लिए अधिक समय मिलना चाहिए? अपना विचार और एक कारण बताइए।'},
 ml:{everyday:'ഒരു പുസ്തകം കണ്ടെത്താൻ സഹായം വേണമെന്ന് കരുതൂ. നിങ്ങൾ എന്ത് പറയും?',classroom:'നിങ്ങൾ പഠിച്ച രസകരമായ ഒരു കാര്യം ക്ലാസിൽ പറയൂ.',storytelling:'പ്രതീക്ഷിക്കാത്ത ഒരു സാഹസത്തെക്കുറിച്ച് ഒരു ചെറിയ കഥ പറയൂ.',interview:'നിങ്ങളെക്കുറിച്ചും നിങ്ങൾക്ക് ഇഷ്ടപ്പെട്ട ഒരു പ്രോജക്ടിനെക്കുറിച്ചോ പ്രവർത്തനത്തെക്കുറിച്ചോ പറയൂ.',presentation:'നിങ്ങൾക്ക് താൽപ്പര്യമുള്ള ഒരു വിഷയം അവതരിപ്പിക്കൂ. കേൾക്കുന്നവർ എന്താണ് പഠിക്കേണ്ടത്?',discussion:'വിദ്യാർത്ഥികൾക്ക് സൃഷ്ടിപരമായ പ്രവർത്തനങ്ങൾക്ക് കൂടുതൽ സമയം വേണോ? നിങ്ങളുടെ അഭിപ്രായവും ഒരു കാരണവും പറയൂ.'}
};
export default function SpeakingLab(){
 const {t}=useLocale();const {learners,learner,selected,setSelected,error:profileError}=useLearners();
 const [scenario,setScenario]=useState(''),[turns,setTurns]=useState([]),[reply,setReply]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const generation=useRef(0),player=useRef(null),controller=useRef(null);
 useEffect(()=>{generation.current++;controller.current?.abort();player.current?.pause();setScenario('');setTurns([]);setReply('');setBusy(false);return()=>{generation.current++;controller.current?.abort();player.current?.pause();};},[selected]);
 async function hear(text,current=generation.current){const speech=await portalApi(`/learners/${selected}/speak`,{method:'POST',body:{text:text.slice(0,1000),language:learner.language},signal:controller.current?.signal});if(current!==generation.current)return;player.current?.pause();player.current=new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);await player.current.play();}
 async function choose(kind){generation.current++;controller.current?.abort();controller.current=new AbortController();player.current?.pause();setError('');setScenario(kind);setTurns([]);const prompt=OPENINGS[learner.language][kind];setReply(prompt);try{await hear(prompt);}catch(err){if(err.name!=='AbortError')setError(err.message);}}
 async function answer(record){const current=generation.current;setBusy(true);setError('');try{
   if(!record.transcript?.trim())throw new Error('Could not hear your answer clearly. Please try again.');
   const result=await portalApi(`/learners/${selected}/companion`,{method:'POST',body:{message:record.transcript,recording_id:record.id,mode:'transfer',scenario,language:learner.language},signal:controller.current.signal});
   if(current!==generation.current)return;setTurns(items=>[...items,{heard:record.transcript,reply:result.reply,id:result.id}]);setReply(result.reply);await hear(result.reply,current);
  }catch(err){if(current===generation.current&&err.name!=='AbortError')setError(err.message);}finally{if(current===generation.current)setBusy(false);}}
 return <ProtectedRoute><Head><title>{t('Speaking studio')} {t("· Speation")}</title></Head><Navbar/><main className={styles.main}>
  <header className={styles.hero}><p className={styles.eyebrow}>{t('SPEAK. PRACTISE. TAKE IT INTO YOUR WORLD.')}</p><h1>{t('Speaking studio')}</h1><p>{t('Practise useful conversations, one spoken answer at a time. Get a sentence suggestion and try again.')}</p></header>
  {(error||profileError)&&<p role="alert" className={styles.error}>{t(error||profileError)}</p>}
  <label className={styles.form}>{t('Learner')}<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}>{learners.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
  {learner?.age>=16?<StudentSpeakingWorkspace key={selected} learner={learner} onBusyChange={setBusy}/>:learner&&<><nav className={styles.switches} aria-label={t('Speaking activities')}>{['everyday','classroom','storytelling'].map(key=><button key={key} disabled={busy} aria-pressed={scenario===key} onClick={()=>choose(key)}>{t(SCENES[key])}</button>)}</nav>
  {scenario&&<div className={styles.layout}><section className={styles.panel}><h2>{t(SCENES[scenario])}</h2><p lang={learner.language}>{reply}</p><button disabled={busy} onClick={()=>hear(reply).catch(err=>setError(err.message))}>{t('Hear again')}</button><p>{t('Spoken answers are saved. Suggestions concern communication; no confidence score is inferred.')}</p><p>{turns.length} {t('spoken turns completed')}</p></section><section className={styles.panel}><RecordingStudio key={`${selected}:${scenario}`} assessFeedback={false} beforeRecord={()=>player.current?.pause()} learner={learner} task="conversation" maxDuration={29} quietFinishMs={4000} disabled={busy} onRecorded={answer}/></section></div>}
  {!!turns.length&&<section className={styles.panel}><h2>{t('Your rehearsal')}</h2>{turns.map(turn=><article key={turn.id}><p lang={learner.language}><strong>{t('You')}</strong>: {turn.heard}</p><p lang={learner.language}><strong>{t("Maya")}</strong>: {turn.reply}</p></article>)}</section>}</>}
 </main></ProtectedRoute>;
}
