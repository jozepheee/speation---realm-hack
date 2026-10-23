import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/scheduler.module.css';

export default function Scheduler() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(null);
  const [difficulty, setDifficulty] = useState(1);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('neuronudge_token')}` });
  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${backend}/session/realtime-metrics`, { headers: headers(), signal: controller.signal })
      .then(({ data }) => { setMetrics(data); setPolicy(data.policy); setError(data.reason || ''); })
      .catch(e => { if (!axios.isCancel(e)) setError(e.response?.data?.detail || 'Unable to load your practice history.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [backend]);
  useEffect(() => {
    if (!metrics?.fluency_history?.length) return;
    const controller = new AbortController();
    setLoading(true); setPolicy(null);
    const timer = setTimeout(() => {
      axios.post(`${backend}/scheduler/recommend`, {
        fluency_history: metrics.fluency_history, mode_history: metrics.mode_history, difficulty,
        total_sessions: metrics.total_sessions,
      }, { headers: headers(), signal: controller.signal })
        .then(({ data }) => { setPolicy(data); setError(''); })
        .catch(e => { if (!axios.isCancel(e)) setError(e.response?.data?.detail || 'Recommendation unavailable.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [metrics, difficulty, backend]);
  async function launch() {
    setStarting(true); setError('');
    try {
      const { data } = await axios.post(`${backend}/scheduler/start`, { difficulty }, { headers: headers() });
      await router.push(data.route);
    } catch (e) { setError(e.response?.data?.detail || 'Unable to start practice.'); }
    finally { setStarting(false); }
  }
  return <ProtectedRoute><div className={styles.container}>
    <Head><title>Adaptive Session Scheduler - Speation</title></Head><Navbar />
    <main className={styles.mainContent}>
      <div className={styles.headerSection}>
        <span className={styles.badge}>Adaptive practice</span><h1 className={styles.title}>Your next conversation</h1>
        <p className={styles.subtitle}>Choose a session using your recent scored recordings, previous dialogue modes, and current difficulty.</p>
      </div>
      <div className={styles.schedulerGrid}>
        <section className={styles.recommendationCard} aria-live="polite">
          {loading ? <p>Evaluating your practice history...</p> : policy ? <>
            <h2 className={styles.recTitle}>{policy.title}</h2>
            <p>Difficulty {policy.difficulty} of 3</p>
            <p>This policy was trained in a simulated practice environment. Real-world effectiveness has not been established.</p>
            <button className={styles.launchBtn} onClick={launch} disabled={starting}>{starting ? 'Starting...' : 'Start recommended practice'}</button>
          </> : <><h2>Establish your baseline</h2><p>A recording scored by the trained audio model is needed before a personalized recommendation.</p><Link href="/session">Record a reading sample</Link></>}
          {error && <p role="alert">{error}</p>}
        </section>
        <section className={styles.parametersCard}>
          <h2>Practice settings</h2>
          <label htmlFor="difficulty">Current difficulty: {difficulty} / 3</label>
          <input id="difficulty" type="range" min="1" max="3" value={difficulty}
            onChange={e => setDifficulty(Number(e.target.value))} className={styles.sliderInput} />
          <p>Changing difficulty recalculates the recommendation. The curriculum may adjust the next level based on your recent scores.</p>
          <p>Recent recording estimates: {metrics?.fluency_history?.slice(-5).join(' → ') || 'No scored recordings yet'}</p>
          {policy && <details><summary>Model action values</summary>
            <p>These are estimated cumulative rewards, not confidence percentages or projected fluency gains.</p>
            <ul>{policy.qValues.map(q => <li key={q.action}>{q.action}: {q.q.toFixed(3)}{q.best ? ' (selected)' : ''}</li>)}</ul>
          </details>}
        </section>
      </div>
    </main><Footer />
  </div></ProtectedRoute>;
}
