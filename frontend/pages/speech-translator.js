import AACLink from '../components/AACLink';
import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import MessagePractice from '../components/MessagePractice';
import {uncertainRecognitionWords} from '../lib/messagePractice';
import useLearners from '../hooks/useLearners';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
export default function SpeechTranslator() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {
    learners,
    learner,
    selected,
    setSelected,
    error: profileError
  } = useLearners();
  const [recording, setRecording] = useState(null),
    [proposal, setProposal] = useState(null),
    [text, setText] = useState('');
  const [voices,setVoices]=useState([]),[voiceId,setVoiceId]=useState('');
  useEffect(()=>{setVoices([]);setVoiceId('');if(!selected)return;const request=new AbortController();portalApi(`/learners/${selected}/voices`,{signal:request.signal}).then(setVoices).catch(()=>{});return()=>request.abort();},[selected]);
  const [assisted, setAssisted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [speechLanguage,setSpeechLanguage]=useState('en'),[recordingBusy,setRecordingBusy]=useState(false);
  const [practiceBusy,setPracticeBusy]=useState(false);
  const [showSaved,setShowSaved]=useState(false);
  const [editing,setEditing]=useState(false);
  const [messagePlaying,setMessagePlaying]=useState(false),[playedMessage,setPlayedMessage]=useState(null);
  useEffect(()=>{setSpeechLanguage(learner?.language||'en');},[learner?.id,learner?.language]);
  const generation = useRef(0),
    requestId = useRef(null),
    audio = useRef(null),audioVersion=useRef(0);
  function stopAudio(){audioVersion.current++;audio.current?.pause();}
  useEffect(() => {
    generation.current += 1;
    audio.current?.pause();
    setRecording(null);
    setProposal(null);
    setText('');
    setError('');
    setBusy(false);
    setAssisted(false);
    setMessagePlaying(false);setPlayedMessage(null);
    return () => {
      generation.current += 1;
      audio.current?.pause();
    };
  }, [selected]);
  useEffect(() => {
    const identifier = router.query.recording;
    if (!selected || typeof identifier !== 'string') return;
    const controller = new AbortController();
    portalApi(`/recordings/${encodeURIComponent(identifier)}`, {
      signal: controller.signal
    }).then(record => {
      if (!learners.some(item => item.id === record.learner_id)) throw new Error('This recording is not in your workspace.');
      if (record.learner_id !== selected) {
        setSelected(record.learner_id);
        return;
      }
      setRecording(record);
      setSpeechLanguage(record.language);
      setProposal(null);
      requestId.current = null;
      setText(record.transcript||'');
      void propose(record,false);
    }).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [router.query.recording, selected]);
  async function propose(source=recording,useAI=assisted,keepText=false) {
    const current = generation.current;
    setBusy(true);
    setError('');
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await portalApi(`/recordings/${source.id}/message-proposals`, {
        method: 'POST',
        body: {
          request_id: requestId.current,
          mode: useAI ? 'ai_assisted' : 'recognized_only'
        }
      });
      if (current !== generation.current) return;
      setProposal(response);
      if(!keepText)setText(response.candidates[0] || '');
      setEditing(keepText||!response.candidates[0]);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function confirm(event) {
    event.preventDefault();
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      const response = await portalApi(`/translations/${proposal.id}/confirm`, {
        method: 'POST',
        body: {
          text: text.trim(),
          confirms_intended_message: true
        }
      });
      if (current === generation.current) {
        setProposal(response);
        setText(response.confirmed_text);
        if(learner.consent?.cloud_processing_allowed)await playSpeech(response.id,current);
      }
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function playSpeech(identifier,current=generation.current){
    stopAudio();const version=audioVersion.current;
    setMessagePlaying(true);setPlayedMessage(null);
    try{
      const speech=await portalApi(`/translations/${identifier}/speak`,{method:'POST',body:voiceId?{voice_id:voiceId}:{}});
      if(current!==generation.current||version!==audioVersion.current)return;
      const clip=new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);audio.current=clip;
      const finished=await new Promise((resolve,reject)=>{clip.onended=()=>resolve(true);clip.onpause=()=>resolve(false);clip.onerror=()=>reject(new Error('Audio playback failed. Please try again.'));clip.play().catch(reject);});
      if(finished&&current===generation.current&&version===audioVersion.current)setPlayedMessage(identifier);
    }finally{if(current===generation.current)setMessagePlaying(false);}
  }
  async function speak() {
    const current = generation.current;
    setBusy(true);
    setError('');
    try {
      await playSpeech(proposal.id,current);
    } catch (err) {
      if (current === generation.current) setError(err.message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function changeLanguage(language){
    if(busy||recordingBusy||practiceBusy)return;
    generation.current++;audio.current?.pause();requestId.current=null;
    setSpeechLanguage(language);setRecording(null);setProposal(null);setText('');setError('');setAssisted(false);setShowSaved(false);
  }
  async function resumeMessage(identifier){
    const current=generation.current;setBusy(true);setError('');audio.current?.pause();
    try{const result=await portalApi(`/translations/${identifier}`);const record=await portalApi(`/recordings/${result.recording_id}`);
      if(current!==generation.current)return;
      setSpeechLanguage(record.language);setRecording(record);setProposal(result);setText(result.confirmed_text);requestId.current=null;
    }catch(err){if(current===generation.current)setError(err.message);}finally{if(current===generation.current)setBusy(false);}
  }
  function newMessage(){
    generation.current++;stopAudio();requestId.current=null;
    setRecording(null);setProposal(null);setText('');setError('');setBusy(false);setShowSaved(false);setPlayedMessage(null);setMessagePlaying(false);
  }
  return <ProtectedRoute><Head><title>{t("Your Meaning, Your Voice · Speation")}</title></Head><Navbar/><main className={styles.main}>
    <header><p className={styles.eyebrow}>{t('SPEECH → YOUR CONFIRMED MESSAGE')}</p><h1>{t('Say it your way.')}</h1><p>{t('Speak, check your message, then confirm and hear it.')}</p></header>
    {(error||profileError)&&<p className={styles.error} role="alert">{t(error||profileError)}</p>}
    {learners.length>1&&<label className={styles.form}>{t('Learner')}<select value={selected} disabled={busy||recordingBusy||practiceBusy} onChange={event=>setSelected(event.target.value)}>{learners.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>}
    {!learner?<p>{t('Create a profile in the')} <Link href="/family">{t('family hub')}</Link> {t('to begin.')}</p>:<>
      <label className={styles.form}>{t('Speech language')}<select value={speechLanguage} disabled={busy||recordingBusy||practiceBusy} onChange={event=>changeLanguage(event.target.value)}><option value="en">{t('English')}</option><option value="hi">हिन्दी</option><option value="ml">മലയാളം</option></select></label>
      {!!voices.length&&<label className={styles.form}>{t('Playback voice')}<select value={voiceId} disabled={busy||messagePlaying} onChange={event=>setVoiceId(event.target.value)}><option value="">{t('Companion voice')}</option>{voices.map(voice=><option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>}
      {!recording&&<RecordingStudio key={`${selected}:${speechLanguage}`} learner={{...learner,language:speechLanguage}} disabled={busy||practiceBusy} maxDuration={20} quietFinishMs={3500} beforeRecord={stopAudio} onBusyChange={setRecordingBusy} completionLabel="Preparing your message…" onRecorded={async record=>{
        generation.current++;stopAudio();setRecording(record);setProposal(null);setText(record.transcript||'');setError('');requestId.current=null;
        await propose(record,false);
      }}/>}
      {recording&&<section className={styles.panel}>
        <h2>{proposal?.confirmed_text?t('Your message'):t('Did you mean?')}</h2>
        {proposal?.confirmed_text?<p lang={recording.language}>{proposal.confirmed_text}</p>:<form className={styles.form} onSubmit={confirm}>
          {editing||!text?<label>{t('My intended message')}<textarea value={text} onChange={event=>setText(event.target.value)} maxLength={1000} required lang={recording.language}/></label>:<blockquote lang={recording.language}>{text}</blockquote>}
          {!editing&&proposal?.candidates?.length>1&&<div className={styles.switches} aria-label={t('Other recognized possibilities')}>{proposal.candidates.filter(candidate=>candidate!==text).map(candidate=><button type="button" key={candidate} disabled={busy} onClick={()=>setText(candidate)} lang={recording.language}>{candidate}</button>)}</div>}
          {!!uncertainRecognitionWords(recording).length&&<p>{t('Recognition flagged these words for checking:')} {uncertainRecognitionWords(recording).map(word=><mark key={word}>{word} </mark>)}</p>}
          <div className={styles.switches}><button disabled={busy||!text.trim()||!proposal}>{busy?t('Preparing…'):t("Yes, that's what I mean")}</button>{!editing&&!!text&&<button type="button" className={styles.linkButton} disabled={busy} onClick={()=>setEditing(true)}>{t('Edit sentence')}</button>}</div>
          {!busy&&!proposal&&<button type="button" onClick={()=>propose(recording,false)}>{t('Retry')}</button>}
        </form>}
        {proposal?.confirmed_text&&<div className={styles.switches}>
          <button className={styles.linkButton} disabled={busy||practiceBusy||!learner.consent?.cloud_processing_allowed} onClick={speak}>{t('Speak again')}</button>
          <button className={styles.linkButton} onClick={stopAudio}>{t('Stop voice')}</button>
          <button className={styles.linkButton} disabled={busy||practiceBusy} onClick={()=>{stopAudio();setText(proposal.confirmed_text);setProposal(null);requestId.current=null;void propose(recording,false,true);}}>{t('Edit message')}</button>
        </div>}
        <button className={styles.linkButton} disabled={busy||practiceBusy} onClick={newMessage}>{t('Record another message')}</button>
      </section>}
      {(proposal?.confirmed_text||showSaved)&&<MessagePractice learner={{...learner,language:speechLanguage}} translation={proposal?.confirmed_text?proposal:null} onResume={resumeMessage} onBusyChange={setPracticeBusy} onStart={stopAudio} messagePlaying={messagePlaying} autoStart={playedMessage===proposal?.id}/>}
      <details className={styles.recordingOptions}><summary>{t('More options')}</summary>
        {recording&&!proposal?.confirmed_text&&<div className={styles.form}><label className={styles.check}><input type="checkbox" checked={assisted} disabled={busy||!learner.consent?.cloud_processing_allowed||!recording.transcript} onChange={event=>{setAssisted(event.target.checked);requestId.current=null;}}/>{t('Request tentative AI message suggestions using cloud permission')}</label><button disabled={busy} onClick={()=>propose(recording,assisted)}>{t('Suggest another wording')}</button>{proposal?.candidates.length>1&&proposal.candidates.map(candidate=><button key={candidate} onClick={()=>setText(candidate)} lang={recording.language}>{candidate}</button>)}</div>}
        <div className={styles.switches}><button className={styles.linkButton} disabled={busy||recordingBusy||practiceBusy} onClick={()=>setShowSaved(true)}>{t('Continue saved word practice')}</button><AACLink href="/communication">{t('Open AAC')}</AACLink><Link href="/practice-hub">{t('All practice activities')}</Link></div>
        <p>{t('Recognition and sound feedback can be uncertain. Check the message before it is spoken.')}</p>
      </details>
    </>}
  </main></ProtectedRoute>;
}
