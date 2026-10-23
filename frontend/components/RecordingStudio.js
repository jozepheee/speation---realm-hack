import { useLocale } from "../context/LocaleContext";
import { useEffect, useRef, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';
import {beginVisualAttempt} from '../lib/visualArticulation';
import MicIcon from './MicIcon';
import WordRecognition from './WordRecognition';
import {practiceFeedbackTitle,wordRecognition} from '../lib/wordRecognition';
import { boundedOperation } from '../lib/boundedOperation';
import {createPauseDetector} from '../lib/pauseDetector';
import {pendingRecording} from '../lib/pendingRecording';
export default function RecordingStudio({
  learner,
  draftScope = '',
  task = 'conversation',
  expectedText = '',
  onRecorded,
  maxDuration = 58,
  autoSubmit = true,
  quietFinishMs = ['word','sentence'].includes(task)?1800:3500,
  compact = true,
  disabled = false,
  beforeRecord,
  meetingMode = false,
  rehearsalMode = false,
  manualFinish = false,
  autoStartToken = 0,
  autoStartOnMount = false,
  cancelToken = 0,
  preferredProvider,
  showSendButton = false,
  showFeedback = true,
  readFeedback = true,
  completionLabel = 'Checking your answer and preparing a reply…',
  recognizeAudio = true,
  onBusyChange,
  onRecordingChange,
  onCaptureStateChange,
  onError,
  assessFeedback = Boolean(expectedText)
}) {
  const {
    t
  } = useLocale();
  const [state, setState] = useState('idle'),
    [clip, setClip] = useState(null),
    [clipUrl, setClipUrl] = useState('');
  const [level, setLevel] = useState(0),
    [seconds, setSeconds] = useState(0),
    [quietSeconds, setQuietSeconds] = useState(0);
  const [result, setResult] = useState(null),
    [error, setError] = useState('');
  const [researchModel,setResearchModel]=useState(null);
  const [recoverable,setRecoverable]=useState(null),[draftNotice,setDraftNotice]=useState('');
  const scopedDraftKey=draftScope?JSON.stringify([draftScope,learner.id,learner.language,task,expectedText]):'';
  const draftKey=learner.consent?.retain_audio_allowed?scopedDraftKey:'';
  useEffect(()=>{let cancelled=false;setRecoverable(null);if(draftKey)pendingRecording(draftKey,'load').then(value=>{if(!cancelled)setRecoverable(value);}).catch(()=>{});else if(scopedDraftKey)void pendingRecording(scopedDraftKey,'remove').catch(()=>{});return()=>{cancelled=true;};},[draftKey,scopedDraftKey]);
  function discardDraft(){setRecoverable(null);setDraftNotice('');if(draftKey)void pendingRecording(draftKey,'remove').catch(()=>{});}
  function restoreDraft(){if(!recoverable)return;attempt.current=recoverable.attempt;setClip(recoverable.blob);setState('recorded');setRecoverable(null);setDraftNotice('Your microphone is off. Retry sends the saved recording when you reconnect.');}
  useEffect(()=>{if(!recognizeAudio||learner.language!=='en')return;const controller=new AbortController();portalApi('/speech-models/research',{signal:controller.signal}).then(setResearchModel).catch(()=>{});return()=>controller.abort();},[learner.id,learner.language,recognizeAudio]);
  const [provider, setProvider] = useState(learner.consent?.cloud_processing_allowed ? (preferredProvider||'sarvam') : 'local_whisper'),
    [mode, setMode] = useState('selected_language'),
    [autoFinish, setAutoFinish] = useState(false);
  const [dialect, setDialect] = useState('');
  const [feedback,setFeedback]=useState(null),[assessing,setAssessing]=useState(false);
  const feedbackPlayer=useRef(null);
  const recorder = useRef(null),
    stream = useRef(null),
    audioContext = useRef(null),
    timer = useRef(null),
    request = useRef(null);
  const visualStop=useRef(null);
  const attempt = useRef(null),
    generation = useRef(0),
    active = useRef(true);
  const lastAutoStart=useRef(autoStartOnMount?0:autoStartToken),lastCancel=useRef(cancelToken);
  const manualFinishRef=useRef(manualFinish);manualFinishRef.current=manualFinish;
  const maxSeconds = Math.min(maxDuration, provider==='adapted_english'?29:(meetingMode||rehearsalMode)?178:provider==='sarvam'?29:58);
  const errorCallback=useRef(onError);errorCallback.current=onError;
  const captureStateCallback=useRef(onCaptureStateChange);captureStateCallback.current=onCaptureStateChange;
  useEffect(()=>{captureStateCallback.current?.(state);},[state]);
  useEffect(()=>{if(error)errorCallback.current?.(error);},[error]);
  function release() {
    if(visualStop.current){const summary=visualStop.current();visualStop.current=null;if(attempt.current)attempt.current.visualArticulation=summary;}
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    clearInterval(timer.current);
    audioContext.current?.close().catch(() => {});
    audioContext.current = null;
  }
  function cancel() {
    discardDraft();
    setAssessing(false);
    generation.current += 1;
    if (recorder.current) recorder.current.onstop = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    request.current?.abort();
    release();
    setClip(null);
    setLevel(0);
    setState('idle');
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      feedbackPlayer.current?.pause();
      generation.current += 1;
      if (recorder.current) recorder.current.onstop = null;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      request.current?.abort();
      release();
    };
  }, []);
  useEffect(() => {
    if (!clip) {
      setClipUrl('');
      return;
    }
    const url = URL.createObjectURL(clip);
    setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  function newAttempt() {
    attempt.current = {
      id: crypto.randomUUID(),
      learnerId: learner.id,
      language: learner.language,
      task,
      expectedText,
      provider,
      mode,
      dialect: dialect.trim() || 'unspecified'
    };
  }
  async function start() {
    if(disabled||['requesting','recording','sending','processing'].includes(state))return;
    feedbackPlayer.current?.pause();setFeedback(null);
    setError('');
    setClip(null);
    setResult(null);
    setSeconds(0);
    setQuietSeconds(0);
    setState('requesting');
    discardDraft();newAttempt();
    const current = ++generation.current;
    try {
      request.current = new AbortController();
      await boundedOperation(Promise.resolve().then(()=>beforeRecord?.()),{signal:request.current.signal,timeoutMs:25000,message:'Preparing the recording took too long. Please retry.'});
      if(!active.current||current!==generation.current)return;
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone capture is unavailable. You can import an authorized recording below.');
      const captured = await boundedOperation(navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation:true,noiseSuppression:false,autoGainControl:false}
      }), {
        signal: request.current.signal,
        message: 'Microphone access timed out. Allow it in your browser or use an existing recording.',
        onLateResolve: late => late.getTracks().forEach(track => track.stop())
      });
      if (!active.current || current !== generation.current) {
        captured.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = captured;
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const device = new MediaRecorder(captured, mime ? {
        mimeType: mime
      } : undefined);
      recorder.current = device;
      const chunks = [];
      device.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      device.onstop = () => {
        release();
        if (!active.current || current !== generation.current) return;
        const capturedClip=new Blob(chunks, {
          type: device.mimeType
        });
        if (autoSubmit && !activitySeen) {
          setError('No speech was heard. Tap the mic and try again.');
          setState('idle');
          setLevel(0);
          return;
        }
        setClip(capturedClip);
        setState('recorded');
        setLevel(0);
        if(autoSubmit)void submit(capturedClip);
      };
      device.onerror = () => {
        release();
        if (current === generation.current) {
          setError('Recording failed. Please try again.');
          setState('idle');
        }
      };
      const Context = window.AudioContext || window.webkitAudioContext;
      let activitySeen = false,endpoint=null;
      const detectPause=createPauseDetector({quietMs:quietFinishMs,maxMs:maxSeconds*1000});
      if (!Context && autoSubmit) throw new Error('Automatic recording is unavailable in this browser. Try an up-to-date browser.');
      let measure = () => {};
      if (Context) {
        const context = new Context();
        audioContext.current = context;
        await boundedOperation(context.resume(),{timeoutMs:5000,signal:request.current.signal,
          message:'The microphone could not start. Tap the mic to try again.',
          onLateResolve:()=>context.close().catch(()=>{})});
        if (!active.current || current !== generation.current) {
          captured.getTracks().forEach(track => track.stop());
          return;
        }
        const analyzer = audioContext.current.createAnalyser();
        analyzer.fftSize = 512;
        audioContext.current.createMediaStreamSource(captured).connect(analyzer);
        const samples = new Float32Array(analyzer.fftSize);
        measure = () => {
          if (!active.current || current !== generation.current) return;
          analyzer.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample ** 2, 0) / samples.length);
          endpoint=detectPause(rms,Date.now());
          activitySeen=endpoint.heard;
          setLevel(Math.min(1, rms * 20));
          setQuietSeconds(Math.floor(endpoint.quietMs / 1000));
        };
      }
      device.start();
      visualStop.current=beginVisualAttempt();
      setState('recording');
      const started = Date.now();
      timer.current = setInterval(() => {
        measure();
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if ((elapsed >= maxSeconds || !manualFinishRef.current && (autoFinish||autoSubmit) && endpoint?.finished) && device.state === 'recording') device.stop();
      }, 50);
    } catch (err) {
      release();
      if (active.current && current === generation.current) {
        setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Enable it in browser settings or import an authorized recording.' : err.message);
        setState('idle');
      }
    }
  }
  function importAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Use an audio file smaller than 20 MiB.');
      return;
    }
    cancel();
    newAttempt();
    setClip(file);
    setResult(null);
    setError('');
    setState('recorded');
  }
  async function submit(capturedClip=clip) {
    if (!capturedClip) return;
    setState('sending');
    setError('');
    request.current = new AbortController();
    const current = generation.current;
    if(draftKey)try{await pendingRecording(draftKey,'save',{blob:capturedClip,attempt:attempt.current});setDraftNotice('Encrypted recovery copy saved on this device for up to 24 hours.');}catch{setDraftNotice('Local recovery is unavailable. Keep this page open to retry your recording.');}
    if(!active.current||current!==generation.current)return;
    const data = new FormData();
    data.append('audio', capturedClip, 'recording.audio');
    data.append('attempt_id', attempt.current.id);
    data.append('language', attempt.current.language);
    data.append('task', attempt.current.task);
    data.append('expected_text', attempt.current.expectedText);
    data.append('provider', attempt.current.provider);
    data.append('recognition_mode', attempt.current.mode);
    data.append('dialect', attempt.current.dialect);
    data.append('recognize_audio',String(recognizeAudio));
    if(meetingMode||rehearsalMode)data.append('rehearsal_capture','true');
    if(attempt.current.visualArticulation)data.append('visual_articulation',JSON.stringify(attempt.current.visualArticulation));
    try {
      const response = await portalApi(`/learners/${attempt.current.learnerId}/recordings`, {
        method: 'POST',
        body: data,
        signal: request.current.signal,
        timeoutMs: recognizeAudio?(meetingMode||rehearsalMode?180000:60000):15000
      });
      // The upload is acknowledged even if onRecorded replaces this component
      // with message confirmation before its async callback returns.
      if(draftKey)void pendingRecording(draftKey,'remove').catch(()=>{});
      if (!active.current || current !== generation.current) return;
      setRecoverable(null);setDraftNotice('');
      setResult(response);
      let coaching=null,coachingError='';
      if(assessFeedback&&learner.consent?.cloud_processing_allowed&&response.audio_retained){
        setAssessing(true);
        try{coaching=await portalApi(`/recordings/${response.id}/maya-coaching`,{method:'POST',body:{mode:task==='story'?'story':'listen_then_say',allow_model_audio:true},signal:request.current.signal,timeoutMs:55000});
          if(!active.current||current!==generation.current)return;
          setFeedback(coaching.content);
          const cue=coaching.content.teaching_plan?.[0]?.practice_tip||coaching.content.summary;
          if(readFeedback)void portalApi(`/learners/${learner.id}/speak`,{method:'POST',body:{text:cue.slice(0,1000),language:learner.language},signal:request.current.signal}).then(speech=>{if(active.current&&current===generation.current){feedbackPlayer.current=new Audio(`data:audio/mpeg;base64,${speech.audio_base64}`);void feedbackPlayer.current.play().catch(()=>{});}}).catch(()=>{});
        }catch(err){coachingError=err.message;if(active.current&&current===generation.current&&err.name!=='AbortError')setError(err.message);}
        finally{if(active.current&&current===generation.current)setAssessing(false);}
      }
      if(!active.current||current!==generation.current)return;
      setState('processing');
      await onRecorded?.({...response,coaching,coaching_error:coachingError});
      if(!active.current||current!==generation.current)return;
      setState('saved');
      discardDraft();
    } catch (err) {
      if (active.current && current === generation.current && err.name !== 'AbortError') {
        setError(err.message);
        setState('recorded');
      }
    }
  }
  function stopWaiting() {
    setAssessing(false);
    request.current?.abort();
    generation.current += 1;
    setState('recorded');
    setError('Stopped waiting. Your clip is kept; retry checks whether it was saved.');
  }
  const locked = ['recording', 'requesting', 'sending', 'processing'].includes(state);
  useEffect(()=>{if(cancelToken!==lastCancel.current){lastCancel.current=cancelToken;cancel();}},[cancelToken]);
  useEffect(()=>{
    if(autoStartToken!==lastAutoStart.current&&!disabled&&!locked&&learner.consent?.practice_allowed){lastAutoStart.current=autoStartToken;void start();}
  },[autoStartToken,disabled,locked]);
  useEffect(()=>{onBusyChange?.(locked);return()=>onBusyChange?.(false);},[locked,onBusyChange]);
  useEffect(()=>{onRecordingChange?.(state==='recording');return()=>onRecordingChange?.(false);},[state,onRecordingChange]);
  if(meetingMode)return <div data-meeting-recorder>
    <button data-recording={state==='recording'} onClick={state==='recording'?()=>{if(recorder.current?.state==='recording')recorder.current.stop();}:start} disabled={disabled||(locked&&state!=='recording')||!learner.consent?.practice_allowed} aria-label={t(state==='recording'?'Send contribution now':'Take the floor')}><MicIcon/><span>{t(state==='recording'?'Send contribution now':state==='requesting'?'Waiting for microphone…':state==='sending'?'Transcribing your answer…':state==='processing'?'Preparing the next question…':'Take the floor')}</span></button>
    {(state==='recording'||state==='requesting')&&<button onClick={cancel}>{t('Cancel recording')}</button>}
    {state==='recording'&&<span role="status">{seconds}s / {maxSeconds}s · {t(manualFinish?'Take your time. Tap the microphone when you are done.':'Pause to send automatically')}{maxSeconds-seconds<=15&&<strong> · {t('Recording limit approaching. Finish this section; you can continue in another answer.')}</strong>}</span>}
    {clip&&!locked&&state!=='saved'&&<button onClick={()=>submit()} disabled={disabled}>{t('Retry')}</button>}
    {error&&<span role="alert">{t(error)}</span>}
  </div>;
  return <section className={styles.panel}>
    <h2>{compact?t('Say your answer'):t("Say it your way")}</h2>
    {recoverable&&!locked&&<div role="status"><p>{t('A recording is waiting from this learner’s previous attempt. It has not been assessed offline.')}</p><button disabled={disabled} onClick={restoreDraft}>{t('Recover my recording')}</button><button onClick={discardDraft}>{t('Delete recovery copy')}</button></div>}
    {draftNotice&&<p role="status">{draftNotice}</p>}
    <p>{t('Speech language')}: <strong>{t({en:'English',hi:'Hindi',ml:'Malayalam'}[learner.language])}</strong>{!compact&&<> · {provider === 'sarvam' ? 'Sarvam' : provider === 'deepgram' ? 'Deepgram' : 'Whisper'}</>}</p>
    {expectedText && <p lang={learner.language}>{expectedText}</p>}
    <p>{t(manualFinish?'Take your time. Select Send answer now when you finish.':'Tap the mic and speak once. Your answer finishes and submits after a pause.')} {(!compact||rehearsalMode)&&<>{maxSeconds} {t("seconds.")}</>}</p>
    {!compact&&<>
    <details className={styles.recordingOptions}><summary>{t("Recording options")}</summary>
    <label className={styles.form}>{t("Dialect or home-language variety, optional")}<input value={dialect} onChange={event => setDialect(event.target.value)} maxLength={80} disabled={locked || !!clip} placeholder={t("Describe the language variety you use")} /></label>
    <div className={styles.form}><label>{t("Recognition provider")}<select value={provider} disabled={locked || !!clip} onChange={event => {setProvider(event.target.value);if(event.target.value==='adapted_english')setMode('selected_language');}}><option value="local_whisper">{t("Local Whisper \xB7 audio stays on the application server")}</option>{researchModel?.available&&learner.language==='en'&&learner.age>=18&&<option value="adapted_english">{t('Local adapted English · adult research pilot')}</option>}<option value="sarvam" disabled={!learner.consent?.cloud_processing_allowed}>{t("Sarvam \xB7 English / Hindi / Malayalam \xB7 cloud")}</option><option value="deepgram" disabled={!learner.consent?.cloud_processing_allowed || learner.language === 'ml'}>{t("Deepgram \xB7 English / Hindi \xB7 cloud")}</option></select></label>{provider==='adapted_english'&&<p>{t('Research model trained on one adult speaker. Confirm every message; this is not a personalized model for this learner.')}</p>}<label>{t("Language mode")}<select value={mode} disabled={locked || !!clip} onChange={event => setMode(event.target.value)}><option value="selected_language">{t("Selected practice language")}</option><option value="auto" disabled={provider==='adapted_english'}>{t("Automatic / mixed-language recognition")}</option></select></label><label className={styles.check}><input type="checkbox" checked={autoFinish} disabled={locked} onChange={event => setAutoFinish(event.target.checked)} />{t("Finish automatically after a pause (always on for automatic submission).")}</label></div>
    </details>
    </>}
    <div style={{
      height: 8,
      background: '#e6eee7',
      borderRadius: 8,
      margin: '20px 0'
    }} role="meter" aria-label={t("Microphone level")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><div style={{
        width: `${level * 100}%`,
        height: '100%',
        borderRadius: 8,
        background: '#4e9266'
      }} /></div>
    {state === 'recording' && <p>{t("Recording:")} {seconds}{t("s \xB7 quiet activity:")} {quietSeconds}{t("s. This meter does not assess pronunciation.")}</p>}
    {state === 'recording' && autoSubmit && <p role="status">{t(manualFinish?'Listening. Select Send answer now when you finish.':'Listening. Pause when you finish; your answer sends automatically.')}{maxSeconds-seconds<=15&&<strong> {t('Recording limit approaching.')}</strong>}</p>}
    <div className={styles.switches}>
      {!['recording','sending','processing'].includes(state) && <button className={styles.recordMic} onClick={start} disabled={disabled || locked || !learner.consent?.practice_allowed}><MicIcon />{state === 'requesting' ? t("Waiting for microphone…") : t("Tap to record")}</button>}
      {state === 'recording' && autoSubmit && showSendButton && <button className={styles.recordMic} onClick={()=>{if(recorder.current?.state==='recording')recorder.current.stop();}}>{t('Send answer now')}</button>}
      {state === 'recording' && !autoSubmit && <button className={styles.linkButton} onClick={() => recorder.current.stop()}>{t("Finish recording ·")} {seconds}{t("s")}</button>}
      {(state === 'recording' || state === 'requesting') && <button className={styles.linkButton} onClick={cancel}>{t("Cancel recording")}</button>}
      {clip && !locked && state!=='saved' && <button className={styles.linkButton} onClick={()=>submit()} disabled={disabled}>{t("Retry")}</button>}
    </div>
    {['sending','processing'].includes(state) && <div role="status" aria-live="polite"><strong>{t('Microphone off. Your answer was captured automatically.')}</strong><p>{state==='processing'?t(completionLabel):assessing?t('Listening to your recorded attempt…'):t('Sending your answer…')}</p></div>}
    {!compact && state==='sending' && <details><summary>{t('Processing options')}</summary><button className={styles.linkButton} onClick={stopWaiting}>{t('Cancel processing and keep my clip')}</button></details>}
    {state==='saved' && <p role="status">{t('Answer saved.')}</p>}
    {showFeedback&&feedback&&<div role="status" lang={learner.language}><WordRecognition expected={expectedText} heard={result?.transcript} language={learner.language}/><strong>{t(practiceFeedbackTitle(feedback.state,expectedText,result?.transcript))}</strong>{!(feedback.state==='insufficient_evidence'&&wordRecognition(expectedText,result?.transcript)==='different_word')&&<p>{feedback.summary}</p>}{feedback.teaching_plan?.map((item,index)=><p key={index}>{item.practice_tip}</p>)}</div>}
    {!compact&&<>
    <details className={styles.recordingOptions}><summary>{t("Use an existing recording")}</summary><label className={styles.form}>{t("Choose an audio file you have permission to use")}<input type="file" accept="audio/*" disabled={locked || !learner.consent?.practice_allowed} onChange={importAudio} /></label></details>
    {clipUrl && <audio controls src={clipUrl} style={{
      width: '100%'
    }} />}
    <div aria-live="polite">{error && <p className={styles.error} role="alert">{t(error)}</p>}{result && <><p>{result.transcript ? t("Recognized speech \u2014 check whether this reflects what you meant:") : t("No transcript is available for this recording.")}</p>{result.transcript && <blockquote lang={learner.language}>{result.transcript}</blockquote>}
      {!!result.quality?.flags?.length && <p>{t("Signal observations:")} {result.quality.flags.join(', ')}{t(". Replay before deciding whether to record again.")}</p>}
      <p>{t("Pronunciation feedback awaits clinician review.")} {result.audio_retained ? t("Audio was retained privately with your permission.") : t("Audio was not retained on the server.")}</p></>}</div>
    </>}
    {compact&&error&&<p role="alert">{t(error)}</p>}
  </section>;
}
