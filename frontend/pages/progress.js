import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/progress.module.css';

export default function Progress() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
        const token = localStorage.getItem('neuronudge_token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await axios.get(`${backendUrl}/session/history`, { headers });
        setSessions(res.data.sessions || []);
        setStats(res.data.stats || null);
      } catch (err) {
        console.error('Failed to fetch session history:', err);
        setError(err.response?.data?.detail || 'Unable to load practice history.');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  const totalSessions = stats?.total_sessions ?? sessions.length;
  const latestScore = stats?.latest_score ?? (sessions.length > 0 ? sessions[0].composite_score : (user?.fluencyLevel || 0));
  const streakDays = stats?.streak ?? (user?.streak || (totalSessions > 0 ? 1 : 0));

  return (
    <ProtectedRoute>
      <div className={styles.container}>
      <Head>
        <title>Fluency Progress & Clinical Analytics — Speation</title>
      </Head>

      <Navbar />

      <div className={styles.yellowCircle}></div>
      <div className={styles.orangeCircle}></div>
      <div className={styles.whiteCover1}></div>

      <main className={styles.mainContent}>
        <div className={styles.headerSection}>
          <span className={styles.badge}>Clinical Data Analytics</span>
          <h1 className={styles.title}>Your Fluency Trajectory</h1>
          <p className={styles.subtitle}>
            Longitudinal breakdown of acoustic stability, phoneme precision, and reinforcement learning adaptations.
          </p>
        </div>

        {/* 4 Stat Cards */}
        <div className={styles.statsBanner}>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{latestScore > 0 ? `${latestScore}%` : 'N/A'}</div>
            <div className={styles.statTitle}>Latest Fluency Score</div>
            <div className={styles.statChange}>Multimodal Attention Index</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statNum}>{streakDays} {streakDays === 1 ? 'Day' : 'Days'}</div>
            <div className={styles.statTitle}>Active Streak</div>
            <div className={styles.statChange}>Practice Consistency</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statNum}>{totalSessions}</div>
            <div className={styles.statTitle}>Completed Sessions</div>
            <div className={styles.statChange}>Verified Records</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statNum}>Optimal</div>
            <div className={styles.statTitle}>Current Target Range</div>
            <div className={styles.statChange}>Diaphragmatic Support</div>
          </div>
        </div>

        {/* Real Practice History Table */}
        <div className={styles.tableCard}>
          <div className={styles.tableTitle}>Recorded Speech Practice Sessions</div>

          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#718096' }}>
              Loading clinical session logs...
            </div>
          ) : error ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#C81E1E' }}>
              {error}
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#555' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '14px' }}>
                No speech practice sessions recorded yet.
              </p>
              <Link href="/session" className="btn-primary">
                Launch First Practice Session →
              </Link>
            </div>
          ) : (
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Training Module</th>
                  <th>Composite Score</th>
                  <th>Acoustic Attention</th>
                  <th>Semantic Match</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.recorded_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 600, color: '#1E2022' }}>{row.session_type || 'Oral & Breath Control'}</td>
                    <td>
                      <span className={styles.scoreBadge}>{row.composite_score} / 100</span>
                    </td>
                    <td>{row.acoustic_weight == null ? '—' : `${(row.acoustic_weight * 100).toFixed(1)}%`}</td>
                    <td>{row.semantic_score == null ? "No reference" : `${row.semantic_score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
