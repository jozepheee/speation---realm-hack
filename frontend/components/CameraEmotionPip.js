import { useLocale } from "../context/LocaleContext";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../styles/avatar.module.css';
const empty = (status, observation) => ({
  status,
  observation,
  expression: null,
  emotion: null,
  facial_tension: null,
  confidence: null,
  source: 'local_face_landmarks'
});
const OFF = empty('off', 'Camera off.');
const FEELINGS = {
  unknown: 'Not shared',
  calm: 'Comfortable',
  happy: 'Happy',
  anxious: 'Anxious',
  fatigued: 'Tired',
  tense: 'Tense'
};
export default function CameraEmotionPip({
  onEmotionChange,
  inline = false,
  oral = false
}) {
  const {
    t
  } = useLocale();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const timerRef = useRef(null);
  const watchdogRef = useRef(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const callback = useRef(onEmotionChange);
  const lastNotification = useRef('');
  const lastFrameAt = useRef(0);
  const lastVideoTime = useRef(-1);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [feedback, setFeedback] = useState(OFF);
  const [feeling, setFeeling] = useState('unknown');
  const feelingRef = useRef('unknown');
  callback.current = onEmotionChange;
  const publish = useCallback(value => {
    if (!mounted.current) return;
    setFeedback(value);
    const update = {
      ...value,
      emotion: feelingRef.current === 'unknown' ? null : feelingRef.current,
      emotion_source: feelingRef.current === 'unknown' ? null : 'self_report'
    };
    const signature = JSON.stringify(update);
    if (signature !== lastNotification.current) {
      lastNotification.current = signature;
      callback.current?.(update);
    }
  }, []);
  const release = useCallback(() => {
    generation.current += 1;
    clearInterval(timerRef.current);
    clearTimeout(watchdogRef.current);
    workerRef.current?.terminate();
    workerRef.current = null;
    streamRef.current?.getTracks().forEach(track => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    busy.current = false;
  }, []);
  const stop = useCallback(() => {
    release();
    setEnabled(false);
    setStarting(false);
    publish(OFF);
  }, [release, publish]);
  useEffect(() => {
    mounted.current = true;
    publish(OFF);
    return () => {
      mounted.current = false;
      release();
    };
  }, [release, publish]);
  const fail = useCallback(message => {
    release();
    if (!mounted.current) return;
    setEnabled(false);
    setStarting(false);
    publish(empty('error', message));
  }, [release, publish]);
  const bindVideo = useCallback(node => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.onloadedmetadata = () => {
        node.play().catch(error => {
          // React remounts/stopping a stream can interrupt play legitimately.
          if (error.name !== 'AbortError' && node === videoRef.current && streamRef.current) fail('Camera preview could not start. Retry camera access.');
        });
      };
    }
  }, [fail]);
  const start = async () => {
    release();
    const session = generation.current;
    setStarting(true);
    publish(empty('loading', 'Starting local face tracking...'));
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail('Camera access requires HTTPS or localhost in a supported browser.');
      return;
    }
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      fail('Local face tracking is unavailable in this browser. Try a current Chrome, Edge or Firefox.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            ideal: 640
          },
          height: {
            ideal: 480
          },
          frameRate: {
            ideal: 15,
            max: 20
          },
          facingMode: 'user'
        },
        audio: false
      });
      if (!mounted.current || session !== generation.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => fail('Camera disconnected. Reconnect it and retry.');
      setEnabled(true);
      const worker = new Worker('/face-tracking/worker.js');
      workerRef.current = worker;
      watchdogRef.current = setTimeout(() => fail('Face tracker took too long to load. Retry camera access.'), 30000);
      worker.onerror = () => {
        if (session === generation.current) fail('Face tracker failed to load. Retry or continue without the camera.');
      };
      worker.onmessage = ({
        data
      }) => {
        if (session !== generation.current || !mounted.current) return;
        if (data.type === 'error') {
          console.warn('[Local face tracker]', data.diagnostic);
          fail(data.message);
          return;
        }
        if (data.type === 'ready') {
          clearTimeout(watchdogRef.current);
          setStarting(false);
          lastVideoTime.current = -1;
          lastFrameAt.current = performance.now();
          publish(empty('starting', 'Face the camera in even lighting.'));
          // One frame in flight; inference stays off the conversation/UI thread.
          timerRef.current = setInterval(async () => {
            if (session !== generation.current || document.hidden) return;
            const video = videoRef.current;
            if (performance.now() - lastFrameAt.current > 6000) publish(empty('stalled', 'Waiting for fresh camera frames.'));
            if (busy.current || !video || video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime.current) return;
            busy.current = true;
            lastVideoTime.current = video.currentTime;
            const timestamp = performance.now();
            watchdogRef.current = setTimeout(() => fail('Face tracker stopped responding. Retry camera access.'), 8000);
            let frame;
            try {
              frame = await createImageBitmap(video, {
                resizeWidth: 320,
                resizeHeight: Math.round(video.videoHeight * 320 / video.videoWidth)
              });
              if (session !== generation.current) {
                frame.close();
                return;
              }
              if (document.hidden) {
                frame.close();
                busy.current = false;
                clearTimeout(watchdogRef.current);
                return;
              }
              worker.postMessage({
                type: 'frame',
                frame,
                timestamp
              }, [frame]);
            } catch {
              frame?.close();
              if (session === generation.current) fail('Unable to read camera frames. Retry camera access.');
            }
          }, 125);
        } else if (data.type === 'result') {
          busy.current = false;
          clearTimeout(watchdogRef.current);
          lastFrameAt.current = performance.now();
          if (!document.hidden) publish(data.result);
        }
      };
      worker.postMessage({
        type: 'init'
      });
    } catch (error) {
      if (session !== generation.current) return;
      const messages = {
        NotAllowedError: 'Camera permission denied. Allow camera access in your browser, then retry.',
        NotFoundError: 'No camera found. Connect a camera and retry.',
        NotReadableError: 'Camera is busy or unavailable. Close other camera apps and retry.'
      };
      fail(messages[error.name] || 'Camera could not start. Retry or continue without it.');
    }
  };
  useEffect(() => {
    const visibility = () => {
      if (!workerRef.current) return;
      workerRef.current.postMessage({
        type: 'reset'
      });
      lastFrameAt.current = performance.now();
      publish(empty(document.hidden ? 'paused' : 'starting', document.hidden ? 'Tracking paused while this tab is hidden.' : 'Reacquiring your face...'));
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [publish]);
  const changeFeeling = event => {
    feelingRef.current = event.target.value;
    setFeeling(event.target.value);
    publish(feedback);
  };
  const color = feedback.status === 'tracking' ? '#047857' : '#64748B';
  const feelingControl = <label className={styles.cameraFeeling}>{t("How do you feel?")}<select value={feeling} onChange={changeFeeling}>{Object.entries(FEELINGS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
  </label>;
  return <div className={inline ? styles.cameraInline : styles.cameraPipContainer}>
      {!enabled ? <div className={styles.cameraStartPanel}>
          <button type="button" className={styles.enableCameraBtn} onClick={start} disabled={starting}>
            <span aria-hidden="true">📹</span>{starting ? t("Starting camera...") : t("Enable camera feedback")}
          </button>
          {starting && <button type="button" onClick={stop}>{t("Cancel")}</button>}
          <p className={styles.cameraHelp} role="status">{feedback.status === 'error' ? feedback.observation : t("Optional. Camera frames stay on this device.")}</p>
          {!oral && feelingControl}
        </div> : <div className={`${styles.pipCard} ${minimized ? styles.pipMinimized : ''}`} style={{
      borderColor: color
    }}>
          <div className={styles.pipHeader}>
            <div className={styles.pipLiveBadge}><span className={styles.liveDot} style={{
            background: color
          }} /><span className={styles.liveText}>{t("CAMERA FEEDBACK")}</span></div>
            <div className={styles.pipActions}>
              <button type="button" className={styles.pipActionBtn} onClick={() => setMinimized(v => !v)} aria-label={minimized ? t("Expand camera") : t("Minimize camera")} aria-expanded={!minimized}>{minimized ? '□' : '–'}</button>
              <button type="button" className={styles.pipActionBtn} onClick={stop} aria-label={t("Turn off camera")}>✕</button>
            </div>
          </div>
          <div className={styles.videoWrapper} style={{
        display: minimized ? 'none' : undefined
      }}>
            <video ref={bindVideo} autoPlay playsInline muted className={styles.pipVideo} aria-label={t("Your camera preview")} />
          </div>
          <div className={styles.pipFeedback}>
            <div role="status" aria-live="polite" className={styles.observationNote}>{t(feedback.observation)}</div>
            {!minimized && <>
              {oral ? <><p>{t("Visible lip opening, relative to mouth width")}: {feedback.oral ? feedback.oral.lip_opening_ratio.toFixed(2) : t("Unavailable")}</p><p className={styles.cameraHelp}>{t("Visible lip geometry only. This does not track your tongue or judge exercise correctness.")}</p></> : <>{feelingControl}<p className={styles.cameraHelp}>{t("Expression cues only. Feelings come from what you share.")}</p></>}
            </>}
          </div>
        </div>}
    </div>;
}
