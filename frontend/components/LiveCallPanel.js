import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import {practiceFeedbackInstruction} from '../lib/practiceFeedbackInstruction';
import { practiceRequests } from '../lib/practiceRequests';
import PhraseComposer from './PhraseComposer';
import MicIcon from './MicIcon';
import { watchMayaPlayback } from '../lib/mayaPlayback';
import { boundedOperation } from '../lib/boundedOperation';
import {savedReservation,rememberReservation,forgetReservation} from '../lib/companionReservation';
import { liveSpeechCapture } from '../lib/liveSpeechCapture';
import { AudioFeedbackGate, AUDIO_FEEDBACK_EVENT } from '../lib/audioFeedbackGate';
import { PracticeAudioQueue } from '../lib/practiceAudioQueue';
import { LiveAvatarTiming } from '../lib/liveAvatarTiming';
import styles from '../styles/companion.module.css';
export default function LiveCallPanel({
  learner,
  mode,
  goal,
  practiceSentence,
  beforeStart,
  onState,
  onAnimation,
  onActive,
  onSavedCall,
  startRequested=false,
  onStartConsumed,
  onPracticeTarget,
  onLesson,
  stopRef,
  lessonActionRef,
  coachingEnabled = false,
  coachingTarget = '',
  onCoachingFeedback,
  compact = false,
  disabled = false
}) {
  const {
    t, locale
  } = useLocale();
  const [status, setStatus] = useState('idle'),
    [error, setError] = useState(''),
    [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [text, setText] = useState(''),
    [history, setHistory] = useState([]);
  const session = useRef(null),
    call = useRef(null),
    generation = useRef(0),
    timer = useRef(null),
    frame = useRef(null),
    heartbeatBusy = useRef(false);
  const onStateRef = useRef(onState),
    onActiveRef = useRef(onActive),
    onSavedRef = useRef(onSavedCall),
    stopping = useRef(false);
  const connecting = useRef(null), playback=useRef(null);
  const [speakerBlocked,setSpeakerBlocked]=useState(false),[saving,setSaving]=useState(false);
  const capture = useRef(null), extraMic = useRef(null), coachingCallback=useRef(onCoachingFeedback);
  const activeTarget=useRef(null),pendingReview=useRef(null),lastDelivered=useRef(null),targetCallback=useRef(onPracticeTarget);targetCallback.current=onPracticeTarget;
  const agentSpeaking=useRef(false);
  const animation=useRef(new LiveAvatarTiming()),animationCallback=useRef(onAnimation);animationCallback.current=onAnimation;
  const audioQueue=useRef(new PracticeAudioQueue());
  const feedbackGate=useRef(null);
  const [coachingStatus,setCoachingStatus]=useState('');coachingCallback.current=onCoachingFeedback;
  const [lesson,setLesson]=useState(null),[lessonBusy,setLessonBusy]=useState(false);
  const lessonCallback=useRef(onLesson);lessonCallback.current=onLesson;
  function syncLesson(value){if(call.current)call.current.lesson=value;setLesson(value);lessonCallback.current?.(value);}
  async function changeLesson(action,text='',notify=true){
    const current=generation.current;if(!call.current||stopping.current)return {state:'call_ended'};
    setLessonBusy(true);
    try{
      const result=await portalApi(`/live-calls/${call.current.id}/lesson`,{method:'POST',body:{action,text,request_id:crypto.randomUUID()}});
      if(current!==generation.current)return {state:'call_ended'};
      syncLesson(result.lesson);
      if(activeTarget.current?.id!==result.active_practice_target?.id){
        activeTarget.current=result.active_practice_target;pendingReview.current=null;lastDelivered.current=null;
        feedbackGate.current?.reset();capture.current?.reset();targetCallback.current?.(activeTarget.current);
      }
      if(notify){session.current?.sendUserActivity();session.current?.sendUserMessage('[SPEATION_LESSON]'+JSON.stringify(result));}
      return result;
    }catch(err){if(current===generation.current)setError(err.message);return {state:'unavailable',message:err.message};}
    finally{if(current===generation.current)setLessonBusy(false);}
  }
  onStateRef.current = onState;
  onActiveRef.current = onActive;
  onSavedRef.current = onSavedCall;
  async function loadHistory() {
    const current = generation.current;
    try {
      const data = await portalApi(`/learners/${learner.id}/live-calls`);
      if (current === generation.current) setHistory(data.filter(item=>['practice','listen_then_say','transfer'].includes(item.mode)===['practice','listen_then_say','transfer'].includes(mode)));
    } catch (err) {
      if (current === generation.current) setError(err.message);
    }
  }
  async function stop() {
    if (stopping.current) return;
    stopping.current=true;
    animation.current.clear();animationCallback.current?.(null,0);
    const priorCall=call.current;
    // Capture the final turn before disconnecting. Queued evidence can finish independently.
    capture.current?.flush();capture.current?.stop();capture.current=null;
    extraMic.current?.getTracks().forEach(track=>track.stop());extraMic.current=null;
    const live=session.current;session.current=null;call.current=null;
    playback.current?.stop();playback.current=null;setSpeakerBlocked(false);
    feedbackGate.current?.reset();
    connecting.current?.abort();connecting.current=null;
    clearInterval(timer.current);cancelAnimationFrame(frame.current);
    const current=++generation.current;
    setStatus('idle');setMuted(false);setCoachingStatus('');
    onStateRef.current?.('idle',0);onActiveRef.current?.(false);
    stopping.current=false;
    void Promise.resolve().then(()=>live?.endSession()).catch(()=>{});
    if(!priorCall)return;
    setSaving(true);
    try {
      const saved=await portalApi(`/live-calls/${priorCall.id}/finish`,{method:'POST',timeoutMs:10000});
      forgetReservation(learner.id,priorCall.id);
      if(current===generation.current)onSavedRef.current?.(saved);
    }catch(err){if(current===generation.current)setError(`The call has stopped. Transcript saving needs retry: ${err.message}`);}
    finally{if(current===generation.current){setSaving(false);void loadHistory();}}
  }
  useEffect(()=>{if(stopRef)stopRef.current=stop;return()=>{if(stopRef)stopRef.current=null;};},[stopRef]);
  useEffect(()=>{if(lessonActionRef)lessonActionRef.current=changeLesson;return()=>{if(lessonActionRef)lessonActionRef.current=null;};},[lessonActionRef]);
  useEffect(() => {
    loadHistory();
    return () => {
      generation.current += 1;
      feedbackGate.current?.reset();
      clearInterval(timer.current);
      cancelAnimationFrame(frame.current);
      connecting.current?.abort();
      connecting.current = null;
      playback.current?.stop();playback.current=null;
      capture.current?.stop();capture.current=null;extraMic.current?.getTracks().forEach(track=>track.stop());extraMic.current=null;
      const live = session.current,
        saved = call.current;
      session.current = null;
      call.current = null;
      live?.endSession().catch(() => {});
      if (saved) portalApi(`/live-calls/${saved.id}/finish`, {
        method: 'POST'
      }).then(()=>forgetReservation(learner.id,saved.id)).catch(() => {});
      onActiveRef.current?.(false);
      onStateRef.current?.('idle', 0);
    };
  }, [learner.id]);
  async function start() {
    if(disabled)return;
    if (!learner.consent?.practice_allowed || !learner.consent?.cloud_processing_allowed) {
      setError('Voice calls need practice and cloud speech permission. Manage permissions in Family Hub.');
      return;
    }
    if (connecting.current || session.current || stopping.current) return;
    const current = ++generation.current;
    agentSpeaking.current=false;
    activeTarget.current=null;pendingReview.current=null;lastDelivered.current=null;targetCallback.current?.(null);
    setError('');setSaving(false);setSpeakerBlocked(false);
    setMessages([]);
    setElapsed(0);
    setStatus('microphone');
    setMuted(false);
    const pending = new AbortController();
    connecting.current = pending;
    onActiveRef.current?.(true);
    let prepared, live;
    audioQueue.current=new PracticeAudioQueue();
    feedbackGate.current=new AudioFeedbackGate({
      hold:()=>{if(current!==generation.current)return;onStateRef.current?.('thinking',0);session.current?.setVolume({volume:0});session.current?.sendContextualUpdate('An actual audio attempt is being analyzed. Call review_practice_attempt and wait. Do not judge or praise pronunciation from captions.');},
      release:()=>{if(current===generation.current)session.current?.setVolume({volume:1});},
      timeoutMs:12000,
      wake:message=>{if(current!==generation.current)return;session.current?.sendUserActivity();session.current?.sendUserMessage(message);}
    });
    try {
      await beforeStart?.();
      if(current!==generation.current)return;
      playback.current=watchMayaPlayback(setSpeakerBlocked);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Live calls require microphone access over HTTPS or localhost.');
      // Check access before creating provider resources; the SDK owns the call's actual microphone.
      const permission = await boundedOperation(navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        }
      }), {
        signal: pending.signal,
        message: 'Microphone access timed out. Allow microphone access in your browser, then try again.',
        onLateResolve: stream => stream.getTracks().forEach(track => track.stop())
      });
      if(coachingEnabled && learner.consent?.retain_audio_allowed)extraMic.current=permission;
      else permission.getTracks().forEach(track => track.stop());
      if (current !== generation.current) return;
      setStatus('preparing');
      prepared = await boundedOperation(portalApi(`/learners/${learner.id}/live-calls`, {
        method: 'POST',timeoutMs:95000,
        body: {
          request_id: crypto.randomUUID(),
          replace_call_id: savedReservation(learner.id),
          mode,
          language: learner.language,
          ...(goal ? {
            goal_id: goal
          } : {}),
          ...(practiceSentence?.trim() && ['practice', 'listen_then_say'].includes(mode) ? {
            practice_sentence: practiceSentence.trim()
          } : {})
        }
      }), {signal:pending.signal,timeoutMs:90000,message:'Preparing Maya took too long. Please retry.',onLateResolve:late=>portalApi(`/live-calls/${late.id}/finish`,{method:'POST'}).catch(()=>{})});
      if (current !== generation.current) {
        await portalApi(`/live-calls/${prepared.id}/finish`, {
          method: 'POST'
        });
        return;
      }
      call.current = prepared;
      rememberReservation(learner.id,prepared.id);
      syncLesson(prepared.lesson||null);
      activeTarget.current=prepared.active_practice_target||null;
      targetCallback.current?.(activeTarget.current);
      if(extraMic.current){
        try {
          const input=await liveSpeechCapture(extraMic.current,{quietMs:['practice','listen_then_say','transfer'].includes(mode)?1200:3000,onError:()=>setCoachingStatus('Live audio coaching is unavailable; use a recorded practice turn.'),onSpeechStart:()=>{if(current===generation.current&&activeTarget.current&&!['offer_sentence','offer_break','completed'].includes(call.current?.lesson?.phase)&&!call.current?.lesson?.completed&&!feedbackGate.current?.waiting)feedbackGate.current?.wait();},onClip:(blob,visual)=>{
            if(current!==generation.current)return;
            if(call.current?.lesson?.completed||call.current?.lesson?.phase==='offer_sentence')return;
            const target=activeTarget.current;
            if(['practice','listen_then_say','transfer'].includes(mode)&&!target)return;
            const gate=feedbackGate.current;
            const feedbackVersion=target?(gate?.waiting?gate.version:gate?.wait()):null;
            setCoachingStatus('Listening to the audio for practice feedback…');
            const task=audioQueue.current.enqueue(async()=>{try{
              const expected=target?.expected_text||coachingTarget||'';
              const form=new FormData();form.set('audio',blob,'conversation-turn.wav');form.set('attempt_id',crypto.randomUUID());form.set('language',learner.language);form.set('provider','sarvam');form.set('recognition_mode','selected_language');form.set('recognize_audio','false');form.set('expected_text',expected);form.set('task',expected?'sentence':'conversation');if(visual)form.set('visual_articulation',JSON.stringify(visual));
              const record=await portalApi(`/learners/${learner.id}/recordings`,{method:'POST',body:form,timeoutMs:30000});
              await portalApi(`/live-calls/${prepared.id}/recordings/${record.id}`,{method:'POST',body:{practice_target_id:target?.id||null},timeoutMs:15000});
              const result=await portalApi(`/recordings/${record.id}/maya-coaching`,{method:'POST',body:{mode,allow_model_audio:true},timeoutMs:55000});
              if(current!==generation.current || target?.id!==activeTarget.current?.id)return;
              // Save late evidence on the server, but never let a timed-out
              // attempt change the current lesson UI or speak over a new turn.
              if(target&&feedbackVersion!==gate?.version)return;
              coachingCallback.current?.(result,record);
              if(result.lesson)syncLesson(result.lesson);
              if(target){if(gate?.ready(result,feedbackVersion))lastDelivered.current=result.recording_id;}
              else session.current?.sendContextualUpdate('Actual audio practice suggestions (not a correctness grade): '+JSON.stringify(result.content));
              setCoachingStatus('Audio practice feedback is ready.');return result;
            }catch(err){if(current===generation.current){setCoachingStatus(err.message);gate?.fail(feedbackVersion);}throw err;}});
            pendingReview.current=task;void task.catch(()=>{});return task;
          }});
          if(current!==generation.current){input.stop();return;}input.setAgentSpeaking(agentSpeaking.current);capture.current=input;
        }catch {if(current===generation.current)setCoachingStatus('Live audio coaching is unavailable; use a recorded practice turn.');}
      }
      setStatus('connecting');
      const {
        Conversation
      } = await import('@elevenlabs/client');
      live = await boundedOperation(Conversation.startSession({
        conversationToken: prepared.conversation_token,
        connectionType: 'webrtc',
        clientTools:{
          lesson_action:params=>changeLesson(params.action,params.text||'',false),
          set_practice_target:async params=>{
            if(current!==generation.current||!call.current||stopping.current)return {state:'call_ended'};
            try{const target=await portalApi(`/live-calls/${call.current.id}/practice-target`,{method:'POST',body:params});
              if(current!==generation.current)return {state:'call_ended'};
              if(activeTarget.current?.id!==target.id){
                activeTarget.current=target;pendingReview.current=null;lastDelivered.current=null;feedbackGate.current?.reset();capture.current?.reset();targetCallback.current?.(target);
              }
              return {state:'saved',target,instruction:'Now model this exact target aloud and invite the learner to repeat. Wait for review_practice_attempt before sound feedback.'};
            }catch(err){return {state:'unavailable',message:err.message};}
          },
          review_practice_attempt:async()=>{
            if(current!==generation.current||stopping.current)return {state:'call_ended'};
            if(!coachingEnabled)return {state:'audio_unavailable',instruction:'Audio practice needs private audio retention permission. Do not infer pronunciation from the transcript.'};
            capture.current?.flush();
            if(!pendingReview.current)return {state:'awaiting_new_attempt',instruction:'Invite a spoken attempt. No fresh audio assessment exists yet.'};
            const reviewedTarget=activeTarget.current?.id;
            const reviewedTask=pendingReview.current;
            try{const result=await feedbackGate.current.review(boundedOperation(reviewedTask,{signal:pending.signal,timeoutMs:55000,message:'Audio feedback is taking longer than expected.'}));
              if(current!==generation.current)return {state:'call_ended'};
              if(reviewedTarget!==activeTarget.current?.id)return {state:'awaiting_new_attempt',instruction:'The practice target changed. Wait for a new attempt on the current target.'};
              if(!result)return {state:'insufficient_evidence'};
              if(result.recording_id===lastDelivered.current)return {state:'awaiting_new_attempt',instruction:'That audio attempt was already discussed. Invite a new attempt.'};
              lastDelivered.current=result.recording_id;
              return {state:result.content.state,recording_id:result.recording_id,...result.content,instruction:practiceFeedbackInstruction(result.content,result.lesson)};
            }catch(err){if(pendingReview.current===reviewedTask)pendingReview.current=null;return {state:'audio_unavailable',message:err.message,instruction:'Continue speaking now. Explain that this recording could not be assessed, model the current word slowly and invite one fresh attempt. Never claim the attempt was right or wrong.'};}
          }
        },
        onMessage: event => {
          if (current !== generation.current) return;
          if(event.message?.startsWith(AUDIO_FEEDBACK_EVENT)||event.message?.startsWith('[SPEATION_LESSON]'))return;
          const role=event.role||(event.source==='user'?'user':'agent');
          if(role==='user'&&activeTarget.current&&coachingEnabled&&!call.current?.lesson?.completed&&call.current?.lesson?.phase!=='offer_sentence'){capture.current?.flush();}
          if(role!=='user'&&feedbackGate.current?.waiting)return;
          setMessages(items => [...items.slice(-99), {
            id: `${Date.now()}:${items.length}`,
            role: event.role || (event.source === 'user' ? 'user' : 'agent'),
            text: event.message
          }]);
        },
        onModeChange: event => {
          if (current !== generation.current) return;
          agentSpeaking.current=event.mode==='speaking';
          if(!agentSpeaking.current){animation.current.clear();animationCallback.current?.(null,0);}
          capture.current?.setAgentSpeaking(agentSpeaking.current);
          onStateRef.current?.(feedbackGate.current?.waiting?'thinking':event.mode === 'speaking' ? 'speaking' : 'listening', 0);
        },
        onVadScore: event => {if(current===generation.current)capture.current?.setVadScore(event.vadScore);},
        onAudioAlignment: event=>{if(current===generation.current&&learner.language==='en')animation.current.append(event);},
        onInterruption: ()=>{if(current===generation.current){animation.current.clear();animationCallback.current?.(null,0);}},
        onDisconnect: () => {
          if (current === generation.current && !stopping.current) void stop();
        },
        onError: () => {
          if (current === generation.current) {
            setError('The live voice connection failed. Your saved call can be retried.');
            void stop();
          }
        }
      }), {
        timeoutMs: 30000,
        signal: pending.signal,
        message: 'The voice connection timed out. Check your connection and try again.',
        onLateResolve: late => late.endSession()
      });
      if (current !== generation.current) {
        await live.endSession();
        return;
      }
      session.current = live;
      live.setVolume({volume:feedbackGate.current?.waiting?0:1});
      playback.current?.check();
      await portalApi(`/live-calls/${prepared.id}/connect`, {
        method: 'POST',
        body: {
          conversation_id: live.getId()
        }
      });
      if (current !== generation.current) return;
      setStatus('connected');
      onStateRef.current?.('listening', 0);
      const started = Date.now();
      const meter = () => {
        if (session.current !== live) return;
        onStateRef.current?.(undefined, live.getOutputVolume());
        const visual=animation.current.frame(performance.now(),agentSpeaking.current&&!feedbackGate.current?.waiting);
        animationCallback.current?.(visual.alignment,visual.time);
        frame.current = requestAnimationFrame(meter);
      };
      meter();
      timer.current = setInterval(async () => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        setElapsed(seconds);
        if (seconds >= prepared.max_duration_seconds) {
          void stop();
          return;
        }
        if (heartbeatBusy.current) return;
        heartbeatBusy.current = true;
        try {
          const response = await portalApi(`/live-calls/${prepared.id}/heartbeat`, {
            method: 'POST'
          });
          if (current === generation.current && !response.continue_call) {
            setError('This call stopped because its permission or session changed.');
            void stop();
          }
        } catch {
          if (current === generation.current) {
            setError('Connection verification failed. Reconnect when you are ready.');
            void stop();
          }
        } finally {
          heartbeatBusy.current = false;
        }
      }, 10000);
    } catch (err) {
      if (current === generation.current) {
        setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Enable it or use text conversation.' : err.message);
        await stop();
      } else {
        await live?.endSession();
        if (prepared) await portalApi(`/live-calls/${prepared.id}/finish`, {
          method: 'POST'
        }).catch(() => {});
      }
    }
  }
  useEffect(()=>{if(startRequested){onStartConsumed?.();void start();}},[startRequested]);
  const active = status !== 'idle';
  function sendCallText(message) {
    if (status !== 'connected' || !session.current || !message.trim()) return false;
    try {
      session.current.sendUserMessage(message.trim());
      return true;
    } catch {
      setError('Your message could not be sent. Keep it here and retry, or end the call.');
      return false;
    }
  }
  return <section className={compact ? styles.callDock : styles.callPanel} aria-label={t("Live call with Maya")}>
    {!compact && <div><p className={styles.callEyebrow}>{t("LIVE VOICE \xB7 YOUR PACE")}</p><h2>{t("A call with Maya")}</h2><p>{t("You can speak while Maya is talking. Pauses are welcome. Typing is also available during a call.")}</p></div>}
    <div className={styles.callControls}>
      {!active ? <button className={compact ? styles.micButton : undefined} aria-label={t("Start voice conversation with Maya")} onClick={start} disabled={disabled||!learner.consent?.practice_allowed || !learner.consent?.cloud_processing_allowed}>{compact ? <MicIcon /> : t("Call Maya")}</button> : <button className={styles.endCall} onClick={stop} disabled={status === 'ending'}>{['microphone', 'connecting'].includes(status) ? t("Cancel") : t("End call")}</button>}
      {status === 'connected' && <><button className={compact ? styles.micButton : undefined} aria-label={muted ? t("Unmute microphone") : t("Mute microphone")} aria-pressed={muted} onClick={() => {
          session.current?.setMicMuted(!muted);
          capture.current?.setMuted(!muted);
          setMuted(!muted);
        }}>{compact ? <MicIcon muted={muted} /> : muted ? t("Unmute microphone") : t("Mute microphone")}</button><button onClick={() => session.current?.sendUserActivity()}>{t("Let me speak")}</button></>}
      <span role="status">{status === 'connected' ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} · ${muted ? t('Microphone muted') : t('Connected')}` : status === 'microphone' ? t("Allow microphone access in your browser\u2026") : status === 'preparing' ? t('Preparing Maya’s voice…') : status === 'connecting' ? t("Connecting your call\u2026") : status === 'ending' ? t("Saving your call\u2026") : t("Ready when you are")}</span>
    </div>
    {lesson&&<div className={styles.lessonControls} aria-label={t('Your speaking lesson')}>
      <div><strong>{lesson.completed?t('Lesson complete'):lesson.phase==='discovering'?t('Your useful message'):t('Step {current} of {total}',{current:lesson.stage+1,total:3})}</strong><span>{lesson.phase==='discovering'?t('Choose what matters to you'):t(['Say the word','Build a sentence','Use it in your world'][lesson.stage])}</span></div>
      {lesson.phase!=='discovering'&&<progress value={lesson.completed?3:lesson.stage} max={3} aria-label={t('Lesson progress')}/>}
      {status==='connected'&&lesson.phase==='discovering'&&<button disabled={lessonBusy} onClick={()=>changeLesson('finish')}>{t('Finish for now')}</button>}
      {status==='connected'&&lesson.phase==='offer_sentence'&&<div role="status"><p>{t('That sounded clear! Want to try it in a sentence?')}</p><button disabled={lessonBusy} onClick={()=>changeLesson('next')}>{t('Yes, try a sentence')}</button><button disabled={lessonBusy} onClick={()=>changeLesson('finish')}>{t('No, finish for now')}</button></div>}
      {status==='connected'&&lesson.phase==='offer_break'&&<div role="status"><p>{t('Want to try another way, or finish for now?')}</p><button disabled={lessonBusy} onClick={()=>changeLesson('help')}>{t('Try another way')}</button><button disabled={lessonBusy} onClick={()=>changeLesson('finish')}>{t('Finish for now')}</button></div>}
      {status==='connected'&&!lesson.completed&&!['offer_sentence','offer_break','discovering'].includes(lesson.phase)&&<nav aria-label={t('Lesson controls')}>
        <button disabled={lessonBusy} onClick={()=>changeLesson('repeat')}>{t('Hear again')}</button>
        <button disabled={lessonBusy} onClick={()=>changeLesson('help')}>{t('Help me')}</button>
        <button disabled={lessonBusy} onClick={()=>changeLesson('skip')}>{t('Skip')}</button>
        <button disabled={lessonBusy||!lesson.stage_attempt_ids.length} onClick={()=>changeLesson('next')}>{lesson.stage===2?t('Finish lesson'):t('Next step')}</button>
      </nav>}
    </div>}
    {speakerBlocked&&status==='connected'&&<button onClick={()=>playback.current?.resume()}>{t('Enable Maya’s voice')}</button>}
    {saving&&<p role="status">{t('Call ended. Transcript is saving in the background.')}</p>}
    {coachingEnabled && <p className={styles.coachingStatus} role="status">{coachingStatus?t(coachingStatus):t('Your recording helps Maya suggest sounds to practise. Feedback can be uncertain.')}</p>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    {!active&&error==='End the previous call before starting another'&&<button onClick={async()=>{try{await portalApi(`/learners/${learner.id}/live-calls/recover`,{method:'POST'});setError('');await start();}catch(err){setError(err.message);}}}>{t('Close the previous call and reconnect')}</button>}
    {!!messages.length && <div className={styles.callCaptions} aria-live="polite">{messages.slice(-6).map(item => <p key={item.id}><strong>{item.role === 'user' ? t("You · recognized words") : t("Maya")}:</strong> {item.text}</p>)}</div>}
    {compact && !active && <p className={styles.micHint}>{learner.consent?.cloud_processing_allowed ? t("Tap the mic to talk. You can interrupt me.") : <>{t("Voice calls need cloud speech permission.")} <a href="/family">{t("Manage permissions")}</a></>}</p>}
    {status === 'connected' && <details className={styles.callTyping} open={!compact}><summary>{t("Type instead")}</summary>
      {goal && <div className={styles.practiceChoices}>{practiceRequests.map(item => <button key={t(item.label)} onClick={() => sendCallText(item.message)}>{t(item.label)}</button>)}</div>}
      <form className={styles.callText} onSubmit={event => {
        event.preventDefault();
        if (sendCallText(text)) setText('');
      }}><label htmlFor={`call-text-${learner.id}`}>{t("Type into this call")}</label><input id={`call-text-${learner.id}`} value={text} onChange={event => setText(event.target.value)} maxLength={2000} /><button disabled={!text.trim()}>{t("Send")}</button></form>
      <PhraseComposer learnerId={learner.id} language={learner.language} value={text} onChange={setText} />
    </details>}
    {!active&&!!history.length && <details><summary>{t("Saved calls \xB7")} {history.length}</summary><button onClick={loadHistory}>{t("Refresh saved calls")}</button>{history.slice(0, 8).map(item => <article key={item.id}><p>{new Date(item.created_at).toLocaleString(locale)} · {t(item.mode.replaceAll('_', ' '))} · {t(item.status)}</p><details><summary>{t("Provider conversation transcript")}</summary>{item.transcript.map((turn, index) => <p key={index}><strong>{turn.role === 'user' ? t("You") : t("Maya")}:</strong> {turn.text}</p>)}{!item.transcript.length && <p>{item.status === 'finalizing' ? t("The provider is processing this transcript. Refresh after a moment.") : t("No verified transcript has been saved.")}</p>}</details>{['preparing', 'prepared', 'connected', 'finalizing'].includes(item.status) && <button onClick={async () => {
          try {
            await portalApi(`/live-calls/${item.id}/finish`, {
              method: 'POST'
            });
            await loadHistory();
          } catch (err) {
            setError(err.message);
          }
        }}>{t("Retry finishing session")}</button>}</article>)}</details>}
    {!compact && <p className={styles.note}>{t("Call captions are recognition, not a pronunciation grade. Approved goals guide practice; sound-level observations need separate audio evidence and review.")}</p>}
  </section>;
}
