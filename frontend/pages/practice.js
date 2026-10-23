import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import axios from 'axios';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/scheduler.module.css';
const AvatarCanvas = dynamic(() => import('../components/AvatarCanvas'), { ssr: false });
const MODES = {
  companion: ['Companion', 'Tell me about something you enjoyed today.'],
  qa: ['Q&A', 'What is a skill you would like to learn, and why?'],
  roleplay: ['Roleplay', 'Imagine we are at a cafe. Tell me what you would like to order.'],
  stress_test: ['Stress Test', 'Describe a problem you solved and explain your decision. Take your time; you can stop whenever you want.'],
};
export default function Practice() {
  const router = useRouter();
  const mode = MODES[router.query.mode] ? router.query.mode : 'companion';
  const level = Math.max(1, Math.min(3, Number(router.query.difficulty) || 1));
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [turns, setTurns] = useState([]);
  const [result, setResult] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recorder = useRef(null), stream = useRef(null), timer = useRef(null), player = useRef(null);
  const mounted = useRef(true);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  useEffect(() => {
    mounted.current = true;
    axios.get(`${backend}/fluency/status`).then(({data}) => {
      if (mounted.current) { setReady(data.ready); if (!data.ready) setError(data.reason); }
    }).catch(() => { if (mounted.current) setError('Unable to check the scoring service.'); });
    return () => {
      mounted.current = false; clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
      stream.current?.getTracks().forEach(t => t.stop()); player.current?.pause();
    };
  }, [backend]);
  function stop() { if (recorder.current?.state === 'recording') recorder.current.stop(); }
  async function start() {
    setError(''); setResult(null); player.current?.pause(); setSpeaking(false);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({audio: true});
      const rec = new MediaRecorder(stream.current), chunks = [];
      recorder.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        clearTimeout(timer.current); stream.current?.getTracks().forEach(t => t.stop());
        if (!mounted.current) return;
        setRecording(false); setBusy(true);
        const data = new FormData();
        data.append('audio', new Blob(chunks, {type: rec.mimeType}), 'recording.webm');
        data.append('mode', mode); data.append('difficulty', String(level));
        data.append('history_json', JSON.stringify(turns.slice(-20)));
        if (router.query.trajectory_id && !completed) data.append('trajectory_id', router.query.trajectory_id);
        try {
          const response = await axios.post(`${backend}/avatar/voice-chat`, data, {
            headers: { Authorization: `Bearer ${localStorage.getItem('neuronudge_token')}` },
          });
          if (!mounted.current) return;
          const r = response.data; setResult(r); setCompleted(true);
          setTurns(t => [...t, {role: 'user', content: r.original_transcript}, {role: 'assistant', content: r.reply}]);
          if (r.audio_base64) {
            player.current = new Audio(`data:audio/mpeg;base64,${r.audio_base64}`);
            player.current.onended = () => { if (mounted.current) setSpeaking(false); };
            setSpeaking(true); player.current.play().catch(() => setSpeaking(false));
          }
        } catch(e) { if (mounted.current) setError(e.response?.data?.detail || 'Recording could not be analyzed. Please try again.'); }
        finally { if (mounted.current) setBusy(false); }
      };
      rec.start(250); setRecording(true); timer.current = setTimeout(stop, 30000);
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setError('Please allow microphone access to record.'); }
  }
  return <ProtectedRoute><div className={styles.container}>
    <Head><title>{MODES[mode][0]} practice - Speation</title></Head><Navbar />
    <main className={styles.mainContent}>
      <h1>{MODES[mode][0]} practice</h1><p>Difficulty {level} of 3. Record up to 30 seconds per turn.</p>
      <div className={styles.schedulerGrid}>
        <section className={styles.recommendationCard}>
          <div style={{height: 300}}><AvatarCanvas state={recording ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : 'idle'} /></div>
          <p>{turns.length ? turns[turns.length - 1].content : MODES[mode][1]}</p>
          <button className={styles.launchBtn} onClick={recording ? stop : start} disabled={busy || !ready}>
            {busy ? 'Analyzing your recording...' : recording ? 'Stop recording' : 'Record your reply'}
          </button>
          {error && <p role="alert">{typeof error === 'string' ? error : 'Please check your recording and try again.'}</p>}
        </section>
        <section className={styles.parametersCard} aria-live="polite">
          <h2>Your recording</h2>
          {result ? <><p>{result.original_transcript}</p><p>Fluency proxy estimate: {result.fluency_score}/100</p>
            <p>{result.notes}</p>{completed && router.query.trajectory_id && <p>Your observed result has been recorded for the scheduler.</p>}
          </> : <p>Your transcript and model estimate will appear after recording.</p>}
          <Link href="/scheduler">Choose the next session</Link>
        </section>
      </div>
    </main>
  </div></ProtectedRoute>;
}
