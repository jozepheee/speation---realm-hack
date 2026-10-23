import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import {useRouter} from 'next/router';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import IntakeSummary from '../components/IntakeSummary';
import useLearners from '../hooks/useLearners';
import {useLocale} from '../context/LocaleContext';
import {portalApi} from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
const Avatar=dynamic(()=>import('../components/AvatarCanvas'),{ssr:false});
export default function FirstConversation(){
 const {t}=useLocale(),router=useRouter();const {learners,learner,selected,setSelected,loading,error:profileError}=useLearners();
 const [session,setSession]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[speaking,setSpeaking]=useState(false),[alignment,setAlignment]=useState(null),[audioTime,setAudioTime]=useState(0),[retryRecord,setRetryRecord]=useState(null);
 const audio=useRef(null),generation=useRef(0);
 function stop(){generation.current++;audio.current?.pause();audio.current=null;setSpeaking(false);}
 useEffect(()=>{if(router.isReady&&learners.some(l=>l.id===router.query.learner))setSelected(router.query.learner);},[router.isReady,router.query.learner,learners]);
 useEffect(()=>{stop();setSession(null);setRetryRecord(null);setError('');const controller=new AbortController();if(selected)portalApi(`/learners/${selected}/intake`,{signal:controller.signal}).then(row=>{if(!controller.signal.aborted)setSession(row);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);});return()=>{controller.abort();stop();};},[selected]);
 const prompt=session?.prompts.find(p=>!session.answers.some(a=>a.prompt_id===p.id));
 async function hear(text){stop();const current=generation.current;setError('');try{const speech=await portalApi(`/learners/${selected}/speak`,{method:'POST',body:{text,language:session?.language||learner.language}});if(current!==generation.current)return;const player=new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);audio.current=player;setAlignment(speech.alignment);setAudioTime(0);player.ontimeupdate=()=>{if(current===generation.current)setAudioTime(player.currentTime);};player.onended=()=>{if(current===generation.current)setSpeaking(false);};await player.play();setSpeaking(true);}catch(err){if(current===generation.current){setSpeaking(false);setError(err.message);}}}
 async function begin(){setBusy(true);setError('');try{const row=await portalApi(`/learners/${selected}/intake`,{method:'POST',body:{request_id:crypto.randomUUID()}});setSession(row);const next=row.prompts.find(p=>!row.answers.some(a=>a.prompt_id===p.id));if(next)await hear(next.prompt);}catch(err){setError(err.message);}finally{setBusy(false);}}
 async function submit(record,skip=false,analyse=true){stop();setBusy(true);setError('');const current=generation.current;try{
  if(record?.audio_retained&&analyse)await portalApi(`/recordings/${record.id}/maya-coaching`,{method:'POST',body:{mode:prompt.expected_text?'listen_then_say':'conversation',allow_model_audio:true}});
  if(current!==generation.current)return;
  const row=await portalApi(`/intake/${session.id}/answers`,{method:'POST',body:{prompt_id:prompt.id,...(record?{recording_id:record.id}:{skip_reason:'Participant chose to skip'})}});
  if(current!==generation.current)return;setSession(row);setRetryRecord(null);
  const next=row.prompts.find(p=>!row.answers.some(a=>a.prompt_id===p.id));if(next)await hear(next.prompt);
 }catch(err){if(current===generation.current){setRetryRecord(record||null);setError(err.message);}}finally{setBusy(false);}}
 async function finish(){stop();setBusy(true);setError('');try{setSession(await portalApi(`/intake/${session.id}/complete`,{method:'POST'}));}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <ProtectedRoute><Head><title>{t('First conversation with Maya')} {t('· Speation')}</title></Head><Navbar/><main className={styles.main}><header className={styles.clinicalHeader}><p className={styles.eyebrow}>{t(learner?.age>=16?'YOUR COMMUNICATION STARTING POINT':'A FIRST CONVERSATION')}</p><h1>{t(learner?.age>=16?'Prepare to speak in study, work and life.':'Let Maya get to know your voice.')}</h1><p>{t(learner?.age>=16?'Practise mature vocabulary, explain a project and respond to interview and teamwork situations. Pause, skip or return later.':'A few words, a sentence and your own story. You can pause, skip or return later.')}</p></header>{profileError&&<p role="alert">{t(profileError)}</p>}{error&&<p role="alert">{t(error)}</p>}
 {!loading&&!learner?<Link href="/family">{t('Create a profile →')}</Link>:learner&&<><label className={styles.form}>{t('Learner')}<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{learners.map(l=><option key={l.id} value={l.id}>{l.display_name}</option>)}</select></label>
 {session?.completed_at?<IntakeSummary learner={learner}/>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:24,marginTop:24}}><section className={styles.panel} style={{minHeight:420,position:'relative',overflow:'hidden',background:'#edf2e6'}}><div style={{height:380}}><Avatar state={speaking?'speaking':'idle'} alignment={alignment} audioTime={audioTime} simple/></div><p>{t('Maya')}</p></section><section className={styles.panel}>
 {!session?<><h2>{t('First conversation with Maya')}</h2><p>{t(learner?.age>=16?'Eight short tasks: academic vocabulary, professional sentences, an interview introduction, a project explanation and a team discussion. No clinician approval is needed.':'Start with a few words, a sentence and a conversation. No clinician assignment is needed to begin.')}</p><p>{t('The recordings and provisional report will be available to your assigned clinician. You can begin general practice while waiting for review.')}</p><button disabled={busy||!learner.consent?.cloud_processing_allowed||!learner.consent?.retain_audio_allowed} onClick={begin}>{t('Start first conversation')}</button>{(!learner.consent?.cloud_processing_allowed||!learner.consent?.retain_audio_allowed)&&<Link href="/family">{t('Enable private audio retention and cloud processing in Family Hub for audio coaching.')}</Link>}</>:prompt?<><p>{session.answers.length+1} / {session.prompts.length}</p><progress value={session.answers.length} max={session.prompts.length} style={{width:'100%'}}/><h2 lang={session.language}>{prompt.prompt}</h2><button disabled={busy} onClick={()=>hear(prompt.prompt)}>{t('Hear Maya’s question')}</button><button onClick={stop}>{t('Stop playback')}</button>{!busy&&!speaking&&!retryRecord&&<RecordingStudio assessFeedback={false} key={prompt.id} learner={{...learner,language:session.language}} task={prompt.task} expectedText={prompt.expected_text} maxDuration={learner.age>=16?29:20} quietFinishMs={learner.age>=16?4000:1800} onRecorded={submit}/>}<p role="status">{busy?t('Saving your spoken answer…'):speaking?t('Listen, then record your answer.'):''}</p>{retryRecord&&<><button disabled={busy} onClick={()=>submit(retryRecord)}>{t('Retry saved answer')}</button><button disabled={busy} onClick={()=>submit(retryRecord,false,false)}>{t('Save answer without AI feedback')}</button></>}<button disabled={busy} onClick={()=>submit(null,true)}>{t('Skip this question')}</button></>:<><h2>{t('Your first conversation is saved.')}</h2><button disabled={busy} onClick={finish}>{t('Create my report and daily plan')}</button></>}
 </section></div>}<p><Link href="/family">{t('Family Hub')} →</Link></p></>}
 </main></ProtectedRoute>;
}
