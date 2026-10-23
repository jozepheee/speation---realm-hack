import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import LanguageSelector from '../components/LanguageSelector';
import { useRouter } from 'next/router';
import {useAuth} from '../context/AuthContext';
import {speechExampleCache} from '../lib/speechExampleCache';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import RecordingStudio from '../components/RecordingStudio';
import LiveCallPanel from '../components/LiveCallPanel';
import SpeechCoachingPanel from '../components/SpeechCoachingPanel';
import {supportedContrast} from '../lib/supportedContrast';
import ArticulationCoach from '../components/ArticulationCoach';
import EnglishSoundGuide from '../components/EnglishSoundGuide';
import VoicePersonalisation from '../components/VoicePersonalisation';
import CompanionCamera from '../components/CompanionCamera';
import MayaLearningActivities from '../components/MayaLearningActivities';
import AACSetting from '../components/AACSetting';
import PhraseComposer from '../components/PhraseComposer';
import useLearners from '../hooks/useLearners';
import { portalApi } from '../lib/portalApi';
import {boundedOperation} from '../lib/boundedOperation';
import { practiceRequests } from '../lib/practiceRequests';
import styles from '../styles/companion.module.css';
// Temporarily opt in: voice practice must work without a connected webcam.
const CAMERA_ENABLED = process.env.NEXT_PUBLIC_COMPANION_CAMERA_ENABLED === 'true';
const Avatar = dynamic(() => import('../components/AvatarCanvas'), {
  ssr: false
});
const MODES = {
  conversation: 'Talk together',
  daily_moment: 'A moment of my day',
  story: 'Create a story',
  listen_then_say: 'Listen & say',
  practice: 'Practice a goal',
  transfer: 'Try it somewhere new'
};
export default function Companion() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {user}=useAuth();
  const [voiceRecovery,setVoiceRecovery]=useState(null);
  const [practiceSentence, setPracticeSentence] = useState('');
  useEffect(() => {
    if (router.isReady && MODES[router.query.mode]) setMode(router.query.mode);
    if(router.isReady&&typeof router.query.practice==='string')setPracticeSentence(router.query.practice.slice(0,300));
  }, [router.isReady, router.query.mode,router.query.practice]);
  const {
    learners,
    learner,
    selected,
    setSelected,
    error: profileError,
    loading: profilesLoading
  } = useLearners();
  useEffect(()=>{if(router.isReady&&learners.some(item=>item.id===router.query.learner))setSelected(router.query.learner);},[router.isReady,router.query.learner,learners]);
  const [turns, setTurns] = useState([]),
    [goals, setGoals] = useState([]),
    [goal, setGoal] = useState('');
  const [mode, setMode] = useState('conversation'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [state, setState] = useState('idle'),
    [alignment, setAlignment] = useState(null),
    [audioTime, setAudioTime] = useState(0),
    [simple, setSimple] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [mouthView,setMouthView]=useState(false);
  const [referenceBlob,setReferenceBlob]=useState(null),[reference,setReference]=useState(null),[comparisonHost,setComparisonHost]=useState(null),[learningMirrorHost,setLearningMirrorHost]=useState(null);
  useEffect(()=>{if(!referenceBlob){setReference(null);return;}const url=URL.createObjectURL(referenceBlob.blob);setReference({url,type:referenceBlob.blob.type,target:referenceBlob.target});return()=>URL.revokeObjectURL(url);},[referenceBlob]);
  async function compareExample(value){stopSpeech();await cameraPrepare.current?.();setReferenceBlob(value);}
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [panel, setPanel] = useState('');
  const [liveActive, setLiveActive] = useState(false);
  const [activityBusy,setActivityBusy]=useState(false),[learnActivity,setLearnActivity]=useState('message');
  const [savedCall, setSavedCall] = useState(null);
  const [language, setLanguage] = useState('en');
  const [callRequested,setCallRequested]=useState(false),[practiceTarget,setPracticeTarget]=useState(null);
  const [lesson,setLesson]=useState(null);
  const cameraPrepare=useRef(null),cameraStop=useRef(null);
  const callStop=useRef(null),callLesson=useRef(null),[switchingSurface,setSwitchingSurface]=useState(false);
  const surface = ['practice','listen_then_say','transfer'].includes(mode) ? 'learn' : 'daily';
  const immersiveMessage = surface==='learn'&&learnActivity==='message'&&['en','ml'].includes(language)&&!reference;
  const [memory,setMemory]=useState(null),[memoryError,setMemoryError]=useState(''),[coaching,setCoaching]=useState(true),[coachingFeedback,setCoachingFeedback]=useState(null),[coachingBusy,setCoachingBusy]=useState(false),[coachingError,setCoachingError]=useState('');
  function changeLanguage(next){stopSpeech();setVoiceRecovery(null);generation.current+=1;setCallRequested(false);setPracticeTarget(null);setBusy(false);setLanguage(next);setGoal('');setPracticeSentence('');setMessage('');setSavedCall(null);setCoachingFeedback(null);try{localStorage.setItem(`speation_maya_language_${selected}`,next);}catch{}}
  async function chooseSurface(next){
    if(switchingSurface||activityBusy||surface===next)return;
    setSwitchingSurface(true);
    try{if(liveActive)await callStop.current?.();stopSpeech();setVoiceRecovery(null);generation.current+=1;setBusy(false);setMode(next==='learn'?'listen_then_say':'conversation');setCoachingFeedback(null);setPanel('');setPracticeTarget(null);setLesson(null);}
    finally{setSwitchingSurface(false);}
  }
  useEffect(()=>{if(!selected)return;const controller=new AbortController();let retry;setTurns([]);setMemory(null);setMemoryError('');
    const load=async()=>{const [history,recall]=await Promise.allSettled([portalApi(`/learners/${selected}/companion-history?surface_filter=${surface}`,{signal:controller.signal}),portalApi(`/learners/${selected}/conversation-memory?mode=${mode}&language=${language}`,{signal:controller.signal})]);if(controller.signal.aborted)return;
      if(history.status==='fulfilled')setTurns(history.value);
      if(recall.status==='fulfilled'){setMemory(recall.value);setMemoryError('');}else setMemoryError(recall.reason.message);
      if(history.status==='rejected'||recall.status==='rejected')retry=setTimeout(load,15000);
    };load();return()=>{controller.abort();clearTimeout(retry);};},[selected,surface,language,savedCall?.status]);
  async function inspectSpeech(record){
    const current=generation.current;setCoachingBusy(true);setCoachingError('');
    try{const result=await portalApi(`/recordings/${record.id}/maya-coaching`,{method:'POST',body:{mode,allow_model_audio:true}});if(current!==generation.current)return;setCoachingFeedback(result);if(voiceReplies)await speak(result.content.summary);}
    catch(err){if(current===generation.current)setCoachingError(err.message);}finally{if(current===generation.current)setCoachingBusy(false);}
  }
  const audio = useRef(null),
    generation = useRef(0),
    speechGeneration = useRef(0),
    frame = useRef(null),
    context = useRef(null);
  useEffect(() => {
    setSimple(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  function stopSpeech() {
    speechGeneration.current += 1;
    if (audio.current) {
      audio.current.dispatchEvent(new Event('speation-stop'));
      audio.current.pause();
      audio.current = null;
    }
    cancelAnimationFrame(frame.current);
    context.current?.close().catch(() => {});
    context.current = null;
    setAudioLevel(0);
    setState('idle');
    setAudioTime(0);
  }
  useEffect(() => {
    if (!selected) return;
    stopSpeech();
    generation.current += 1;
    setBusy(false);
    setError('');
    setGoal('');
    setGoals([]);
    setTurns([]);
    setSavedCall(null);
    setCallRequested(false);
    setPracticeTarget(null);
    setVoiceRecovery(null);
    setReferenceBlob(null);
    setPracticeSentence(typeof router.query.practice==='string'?router.query.practice.slice(0,300):'');
    let preferred;try{preferred=localStorage.getItem(`speation_maya_language_${selected}`);}catch{}setLanguage(['en','hi','ml'].includes(preferred)?preferred:learner?.language||'en');setCoachingFeedback(null);
    const controller = new AbortController();
    Promise.all([portalApi(`/learners/${selected}/goals`, {
      signal: controller.signal
    })]).then(([plan]) => {
      setGoals(plan);
    }).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => {
      controller.abort();
      stopSpeech();
    };
  }, [selected]);
  async function speak(text, spokenLanguage = language, options = {}) {
    if (liveActive) return;
    stopSpeech();
    const requestGeneration = generation.current,
      speechRequest = speechGeneration.current;
    let speech;
    try {
      const cacheScope=`${user?.id}:${selected}`;
      speech=options.preparedSpeech;
      if(!speech&&options.cache)try{speech=await speechExampleCache(cacheScope,text,spokenLanguage);}catch{}
      if(!speech)speech = await portalApi(`/learners/${selected}/speak`, {
        method: 'POST',
        body: {
          text: text.slice(0, 1000),
          language: spokenLanguage,
          mouth_animation:spokenLanguage==='en'
        }
        ,timeoutMs:30000
      });
      if(options.cache)void speechExampleCache(cacheScope,text,spokenLanguage,speech).catch(()=>{});
      if (requestGeneration !== generation.current || speechRequest !== speechGeneration.current) return;
      setAlignment(speech.alignment);
      const player = new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);
      audio.current = player;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) {
        context.current = new Context();
        const analyzer = context.current.createAnalyser();
        analyzer.fftSize = 256;
        context.current.createMediaElementSource(player).connect(analyzer);
        analyzer.connect(context.current.destination);
        const samples = new Uint8Array(analyzer.fftSize);
        const tick = () => {
          if (audio.current !== player) return;
          analyzer.getByteTimeDomainData(samples);
          setAudioLevel(Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length));
          setAudioTime(player.currentTime);
          frame.current = requestAnimationFrame(tick);
        };
        await boundedOperation(context.current.resume(),{timeoutMs:5000,message:'Audio is blocked. Enable Maya’s voice to continue.'});
        tick();
      } else player.ontimeupdate = () => setAudioTime(player.currentTime);
      let settle,ended=false;
      const finished=new Promise(resolve=>{settle=resolve;});
      player.onpause=()=>{if(options.controllable&&audio.current===player&&!player.ended){setState('idle');return;}settle();};
      player.addEventListener('speation-stop',settle);
      player.addEventListener('playing',()=>{if(audio.current===player)setState('speaking');});
      player.onended = () => {
        ended=true;
        settle();
        if (audio.current === player) stopSpeech();
      };
      player.onerror=()=>{settle();if(audio.current===player){stopSpeech();setError('Voice playback failed. Please retry the example.');}};
      player.playbackRate=options.slow?.85:1;
      options.onPlayback?.(player,speech);
      await player.play();
      setVoiceRecovery(null);
      setState('speaking');
      if(options.waitForEnd){if(options.controllable)await finished;else await boundedOperation(finished,{timeoutMs:120000,message:'Voice playback did not finish. Retry the example.'});return ended;}
      return true;
    } catch (err) {
      if (speechRequest !== speechGeneration.current) return;
      stopSpeech();
      if(speech?.audio_base64)setVoiceRecovery({text,language:spokenLanguage,options:{...options,preparedSpeech:speech}});
      setError(`Voice playback: ${err.message}`);
      return false;
    }
  }
  async function send(text = message) {
    if (liveActive) return;
    if (!text.trim() || !selected) return;
    stopSpeech();
    setBusy(true);
    setState('thinking');
    setError('');
    const requestGeneration = generation.current;
    try {
      const reply = await portalApi(`/learners/${selected}/companion`, {
        method: 'POST',
        body: {
          message: text,
          mode,
          language,
          ...(practiceSentence.trim() && ['practice', 'listen_then_say'].includes(mode) ? {
            practice_sentence: practiceSentence.trim()
          } : {}),
          ...(goal ? {
            goal_id: goal
          } : {})
        }
      });
      if (requestGeneration !== generation.current) return;
      setTurns(current => [...current, {
        id: reply.id,
        user_text: text,
        reply: reply.reply,
        language: reply.language
      }]);
      setMessage('');
      setState('idle');
      if (voiceReplies) await speak(reply.reply);
    } catch (err) {
      if (requestGeneration === generation.current) {
        setError(err.message);
        setState('idle');
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }
  return <ProtectedRoute><Head><title>{t("Maya \xB7 Speation")}</title></Head>
    <main className={`${styles.immersive} ${surface==='learn'?styles.learningRoom:''} ${liveActive?styles.liveLearning:''} ${immersiveMessage?styles.messageRoom:''}`}>
      <div className={styles.fullStage} aria-label={t("Maya, your speech companion")}>
        <div className={styles.stageGlow} />
        {simple ? <div className={styles.portrait}><svg viewBox="0 0 260 300" aria-label={t("Maya in quiet view")} role="img"><path d="M49 160C8 30 235 8 220 170L230 300H30Z" fill="#44372e" /><ellipse cx="132" cy="142" rx="71" ry="90" fill="#e5b595" /><path d="M55 126C35 20 204 13 212 116 158 105 128 63 118 61 106 101 78 112 55 126Z" fill="#44372e" /><path d="M96 146h9m51 0h9" stroke="#283d38" strokeWidth="7" strokeLinecap="round" /><path d="M112 189q20 16 39 0" stroke="#984c47" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M45 300q-2-77 61-80 25 26 51 0 70 4 65 80" fill="#527967" /></svg></div> : <div className={styles.roomAvatar}><Avatar framing={mouthView?'mouth':'room'} state={state} alignment={alignment} audioTime={audioTime} audioLevel={audioLevel} /></div>}
      </div>
      <header className={styles.roomHeader}>
        <Link href="/family" className={styles.roomBack}>{t("\u2190 Home")}</Link>
        <div><strong>{t("Maya")}</strong><span>{learner ? learner.display_name : t("Your companion")}</span></div>
        <nav aria-label={t("Conversation controls")}><button aria-pressed={mouthView} onClick={()=>setMouthView(value=>!value)}>{t(mouthView?'Full view':'Mouth close-up')}</button><button aria-expanded={panel === 'chat'} onClick={() => setPanel(panel === 'chat' ? '' : 'chat')}>{t("Type")}</button><button aria-expanded={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? '' : 'settings')}>{t("Settings")}</button></nav>
      </header>
      <nav className={styles.roomSurfaces} aria-label={t('Maya conversation areas')}><button disabled={switchingSurface||activityBusy} aria-pressed={surface==='daily'} onClick={()=>chooseSurface('daily')}>{t('Daily conversation')}</button><button disabled={switchingSurface||activityBusy} aria-pressed={surface==='learn'} onClick={()=>chooseSurface('learn')}>{t('Learn with Maya')}</button><label>{t('Speech language')}<select aria-label={t('Speech language')} disabled={liveActive||activityBusy} value={language} onChange={event=>changeLanguage(event.target.value)}><option value="en">{t("English")}</option><option value="ml">മലയാളം</option><option value="hi">हिन्दी</option></select></label><small>{memory?t('Saved conversations recalled: {count}',{count:memory.entries.length}):memoryError?t('Saved conversation memory is temporarily unavailable. Retrying…'):t('Loading conversation memory…')}{memory?.learning?.last_target?' · '+t('Last practice: {word}',{word:memory.learning.last_target.word||memory.learning.last_target.expected_text}):''}{memory?.pending_calls_not_recalled?' · '+t('Recent call transcript is still saving'):''}</small></nav>
      <div className={styles.roomPrompt} aria-live="polite"><span className={styles.liveDot} /><p>{state === 'speaking' ? t("Maya is speaking. You can jump in.") : state === 'listening' ? t("I\u2019m listening. Take your time.") : state === 'thinking' ? t('Checking the sounds in your recording…') : t("Hi, I\u2019m Maya. Shall we talk?")}</p></div>
      {(error || profileError) && <p role="alert" className={styles.roomError}>{error || t(profileError)}{voiceRecovery&&<button disabled={liveActive} onClick={()=>speak(voiceRecovery.text,voiceRecovery.language,voiceRecovery.options)}>{t('Enable Maya’s voice')}</button>}<button aria-label={t("Dismiss message")} onClick={() => setError('')}>×</button></p>}
      {!learner ? <section className={styles.roomWelcome}><h1>{profilesLoading ? t("Getting your space ready\u2026") : t("Let\u2019s get to know you.")}</h1>{!profilesLoading && <><p>{t("Create a learner profile to start talking with Maya.")}</p><Link href="/family">{t("Create a profile \u2192")}</Link></>}</section> : <>
        {(!immersiveMessage||liveActive||callRequested)&&<LiveCallPanel onAnimation={(value,time)=>{setAlignment(value);setAudioTime(time);}} compact disabled={activityBusy} stopRef={callStop} lessonActionRef={callLesson} startRequested={callRequested} onStartConsumed={()=>setCallRequested(false)} onLesson={setLesson} onPracticeTarget={target=>{setPracticeTarget(target);setCoachingFeedback(null);}} key={`${selected}:${language}:${surface}`} coachingEnabled={coaching&&!!learner.consent?.retain_audio_allowed} coachingTarget={surface==='learn'?(practiceSentence.trim()||goals.find(item=>item.id===goal)?.practice_word||''):''} onCoachingFeedback={result=>{setCoachingFeedback(result);}} learner={{
          ...learner,
          language
        }} mode={mode} goal={goal} practiceSentence={practiceSentence} beforeStart={async () => {
          if(activityBusy)throw new Error('Finish or stop the activity recording before starting a live call.');
          generation.current += 1;
          stopSpeech();
          setBusy(false);
          setError('');
          setPanel('');
          await cameraPrepare.current?.();
        }} onActive={active=>{setLiveActive(active);if(!active)cameraStop.current?.();}} onSavedCall={setSavedCall} onState={(next, level) => {
          if (next) setState(next);
          setAudioLevel(level);
        }} />}
        <aside className={styles.biofeedbackRail} aria-label={t("Live camera and speaking guidance")}>
        {CAMERA_ENABLED&&<CompanionCamera portalTarget={surface==='learn'&&reference?comparisonHost:surface==='learn'&&learnActivity==='model'?learningMirrorHost:null} reference={reference} onPlayReference={stopSpeech} key={selected} prepareRef={cameraPrepare} stopRef={cameraStop} onLost={()=>callStop.current?.()} />}

        {surface==='learn'&&(practiceTarget||coachingFeedback)&&<section className={styles.spokenPractice} aria-label={t('Spoken practice with Maya')}>
          <small>{t('Your speaking lesson')}</small>
          {lesson&&<><div className={styles.lessonPicture} role="img" aria-label={lesson.title}>{lesson.icon}</div><strong lang={language}>{lesson.title}</strong>{lesson.meaning&&<small lang={language}>{lesson.meaning}</small>}</>}
          {practiceTarget&&<p lang={language}>{lesson?.stage===2?lesson.situation:practiceTarget.expected_text}</p>}
          {language==='en'&&<EnglishSoundGuide target={practiceTarget} feedback={coachingFeedback} onHear={text=>liveActive?callLesson.current?.('help'):speak(text)} disabled={false}/>}
          {coachingFeedback?.content.teaching_plan?.[0]&&<p lang={language} role="status">{coachingFeedback.content.teaching_plan[0].practice_tip}</p>}
          {coachingFeedback&&<details><summary>{t('Practice notes')}</summary><p>{coachingFeedback.content.summary}</p>{(coachingFeedback.content.concerns||[]).map((item,index)=><p key={index}><strong>{item.word}</strong> · {item.practice_tip}</p>)}</details>}
        </section>}
        </aside>
        <div className={styles.learningStage}>{surface==='learn'&&<nav lang="en" translate="no" className={styles.activityTabs} aria-label="Learning activities">{[['message',language==='ml'?'എന്റെ സന്ദേശം':'My message'],['story',language==='ml'?'കഥയിലൂടെ പഠിക്കാം':'Story adventure'],['listen',language==='ml'?'വ്യത്യാസം കേൾക്കാം':'Hear the difference'],['model',language==='ml'?'കണ്ടു പഠിക്കാം':'Familiar example']].map(([id,label])=><button key={id} disabled={activityBusy} aria-pressed={!liveActive&&learnActivity===id} onClick={async()=>{if(liveActive)await callStop.current?.();stopSpeech();setLearnActivity(id);}}>{label}</button>)}</nav>}{surface==='learn'&&reference&&<section lang="en" translate="no" className={styles.mainComparison}><h2>Watch together · try together</h2><div ref={setComparisonHost}/><button onClick={()=>setReferenceBlob(null)}>Back to my activity</button></section>}{surface==='learn'&&liveActive&&<section className={styles.liveLesson} lang="en" translate="no"><small>LEARN WITH MAYA · LIVE PRACTICE</small><h2>{lesson?.phase==='discovering'?'What would you like to say today?':'Watch, listen, then try together.'}</h2><ArticulationCoach contrast={supportedContrast(coachingFeedback?.content,coachingFeedback?.content?.teaching_plan?.[0]?.word||practiceTarget?.word||practiceTarget?.expected_text)} age={learner.age} word={coachingFeedback?.content?.teaching_plan?.[0]?.word||practiceTarget?.word||practiceTarget?.expected_text||''} phone={coachingFeedback?.content?.teaching_plan?.[0]?.expected_phone||practiceTarget?.sound||practiceTarget?.pronunciation_reference?.words?.[0]?.variants?.[0]?.[0]||''} produced={coachingFeedback?.content?.concerns?.[0]?.produced_phone||''} onHear={()=>callLesson.current?.('repeat')}/>{coachingFeedback&&<p>{coachingFeedback.content.state==='no_clear_difference'?'That sounded clear!':coachingFeedback.content.state==='insufficient_evidence'?'I could not hear that clearly. Let’s try once more.':'Let’s watch and try that sound together.'}</p>}</section>}        {surface==='learn'&&!liveActive&&['en','ml'].includes(language)&&<MayaLearningActivities conversationRevision={`${savedCall?.id||''}:${savedCall?.status||''}`} onMirrorHost={setLearningMirrorHost} assessment={coachingFeedback?.content} immersiveMessage={immersiveMessage} hideNavigation activityChoice={learnActivity} onActivityChange={setLearnActivity} goals={goals} key={`${selected}:${language}`} learner={{...learner,language}} suggestedTarget={coachingFeedback?.content?.teaching_plan?.[0]?.word||practiceTarget?.word||practiceSentence} onHear={(text,options={})=>speak(text,language,{waitForEnd:true,cache:true,...options})} onTeachingSpeech={text=>speak(text,language,{waitForEnd:true,slow:true,cache:true})} onStopSpeech={stopSpeech} onBeforeRecord={()=>cameraPrepare.current?.()} onCompare={compareExample} onFeedback={setCoachingFeedback} onBusyChange={setActivityBusy} onChooseTarget={word=>{setPracticeSentence(word);setMode('listen_then_say');setCallRequested(true);}}/>}</div>
        {panel && <aside className={styles.roomSheet} aria-label={panel === 'settings' ? t("Conversation settings") : panel === 'record' ? t("Record an attempt") : t("Messages with Maya")}>
          <header><h2>{panel === 'settings' ? t("Make it yours") : panel === 'record' ? t("A little practice") : t("Talk your way")}</h2><button aria-label={t("Close panel")} onClick={() => setPanel('')}>×</button></header>
          {panel === 'settings' && <div className={styles.roomSettings}><LanguageSelector /><AACSetting/>{language==='en'&&<details><summary>{t('Voice personalisation')}</summary><VoicePersonalisation learner={learner}/></details>}
            <label>{t("Learner")}<select disabled={liveActive||activityBusy} value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
            <label>{t("What shall we do?")}<select disabled={liveActive||activityBusy} value={mode} onChange={event => setMode(event.target.value)}>{Object.entries(MODES).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></label>
            {['practice', 'listen_then_say'].includes(mode) && <label>{t("Sentence to practise (optional)")}<textarea disabled={liveActive||activityBusy} value={practiceSentence} onChange={event => setPracticeSentence(event.target.value)} maxLength={300} placeholder={language === 'ml' ? 'ഇന്ന് ഞാൻ ഒരു കഥ വായിച്ചു.' : language === 'hi' ? 'आज मैंने एक कहानी पढ़ी।' : t("Today I read a story.")} /><small>{t("Maya will say this first, then wait for you. Sound feedback uses reviewed evidence.")}</small></label>}
            <label>{t("Practice goal")}<select disabled={liveActive||activityBusy} value={goal} onChange={event => setGoal(event.target.value)}><option value="">{t("Just a conversation")}</option>{goals.filter(item => item.language === language).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            {goal && <p>{goals.find(item => item.id === goal)?.instruction}</p>}
            <label><input type="checkbox" checked={simple} onChange={event => setSimple(event.target.checked)} /> {t("Quiet 2D view")}</label>
            <label><input type="checkbox" checked={voiceReplies} onChange={event => setVoiceReplies(event.target.checked)} /> {t("Read text replies aloud")}</label>
            <button disabled={liveActive||activityBusy} onClick={() => setPanel('record')}>{t("Record a practice attempt")}</button>

            <Link href="/practice-hub">{t("Four steps of practice \u2192")}</Link><Link href="/arcade">{t("Play a speech adventure \u2192")}</Link>
          </div>}
          {panel === 'chat' && <>
            <div className={styles.roomMessages} aria-live="polite">{!turns.length && <p>{t("You can type, use phrases, or tap the mic to talk.")}</p>}{turns.map(turn => <article key={turn.id}><p className={styles.user}>{turn.user_text}</p><div className={styles.reply}><small>{t("MAYA")}</small><p lang={turn.language}>{turn.reply}</p><button disabled={liveActive||activityBusy} onClick={() => speak(turn.reply, turn.language || language)} aria-label={t("Hear Maya\u2019s reply")}>{t("Listen")}</button></div></article>)}</div>
            {liveActive ? <p>{t("Use \u201CType instead\u201D beneath the microphone to message during this call.")}</p> : <><form className={styles.roomMessageForm} onSubmit={event => {
                event.preventDefault();
                send();
              }}><label htmlFor="maya-message">{t("Your message")}</label><textarea id="maya-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} placeholder={t("Tell Maya something\u2026")} /><button disabled={busy || !message.trim() || !learner.consent?.practice_allowed || !learner.consent?.cloud_processing_allowed}>{busy ? t("Thinking\u2026") : t("Send \u2192")}</button></form><PhraseComposer key={`${selected}:${language}`} learnerId={selected} language={language} value={message} onChange={setMessage} disabled={busy} />{goal && <div className={styles.practiceChoices}>{practiceRequests.map(item => <button key={item.label} disabled={busy} onClick={() => send(item.message)}>{t(item.label)}</button>)}</div>}</>}
          </>}
          {panel === 'record' && <><label className={styles.coachingConsent}><input type="checkbox" checked={coaching} disabled={liveActive||activityBusy} onChange={event=>setCoaching(event.target.checked)}/>{t('Audio coaching: analyze submitted attempts on the app server and with OpenRouter; Azure is also used when configured.')}</label>{!learner.consent?.retain_audio_allowed&&<p>{t('Enable private audio retention and cloud processing in Family Hub for audio coaching.')}</p>}{surface==='learn'&&<label className={styles.practiceTarget}>{t('Word or sentence to practise')}<textarea value={practiceSentence} disabled={liveActive||activityBusy} maxLength={300} onChange={event=>setPracticeSentence(event.target.value)}/><button disabled={liveActive||!practiceSentence.trim()} onClick={()=>speak(practiceSentence)}>{t('Hear my practice sentence')}</button></label>}<SpeechCoachingPanel disabled={liveActive||activityBusy} feedback={coachingFeedback} busy={coachingBusy} error={coachingError} onHear={word=>speak(word)} onPractice={word=>{if(liveActive)return;setMode('listen_then_say');setPracticeSentence(word);setPanel('record');}}/>{!liveActive&&<RecordingStudio assessFeedback={false} maxDuration={20} key={`${selected}:${language}:${practiceSentence}`} learner={{
              ...learner,
              language
            }} task={practiceSentence.trim() && ['practice', 'listen_then_say'].includes(mode) ? 'sentence' : ['practice', 'listen_then_say'].includes(mode) ? 'word' : mode === 'daily_moment' ? 'daily_moment' : mode === 'story' ? 'story' : 'conversation'} expectedText={['practice', 'listen_then_say'].includes(mode) && practiceSentence.trim() ? practiceSentence.trim() : goals.find(item => item.id === goal)?.practice_word || ''} onRecorded={async record => {
              const current = generation.current;
              if (record.transcript) setMessage(record.transcript);
              if(surface==='learn'&&coaching&&record.audio_retained)await inspectSpeech(record);
              else if(record.transcript)await send(record.transcript);
              if (savedCall) {
                try {
                  await portalApi(`/live-calls/${savedCall.id}/recordings/${record.id}`, {
                    method: 'POST'
                  });
                } catch (err) {
                  if (current === generation.current) setError(`Recording saved. Linking it to the call needs retry: ${err.message}`);
                }
              }
            }} />}{!liveActive&&<button onClick={() => setPanel('chat')}>{t("Check my message \u2192")}</button>}</>}
        </aside>}
      </>}
    </main>
  </ProtectedRoute>;
}


