import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/dashboard.module.css';

export default function Dashboard() {
  const { user } = useAuth();
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : 'Learner');
  const streakDays = user?.streak ?? 0;
  const fluencyScore = user?.fluencyLevel ? `${user.fluencyLevel}%` : 'New';

  return (
    <ProtectedRoute>
      <div className={styles.container}>
      <Head>
        <title>Speech Assistant Hub — Speation</title>
      </Head>

      <Navbar />

      <div className={styles.yellowCircle}></div>
      <div className={styles.orangeCircle}></div>
      <div className={styles.whiteCover1}></div>
      <div className={styles.whiteCover2}></div>

      <main className={styles.mainContent}>
        {/* User Summary Status Banner */}
        <div className={styles.userWelcomeBar}>
          <div className={styles.userInfo}>
            <h2>Hello, {userName} 👋</h2>
            <p>Your adaptive practice cycle is ready. Let's strengthen your vocal fluency today.</p>
          </div>
          <div className={styles.userStats}>
            <div className={styles.statPill}>
              🔥 Streak: <span className={styles.statHighlight}>{streakDays} Days</span>
            </div>
            <div className={styles.statPill}>
              🎯 Est. Fluency: <span className={styles.statHighlight}>{fluencyScore}%</span>
            </div>
          </div>
        </div>

        <div className={styles.titleContainer}>
          <h1 className={styles.title}>Speech Assistant Modules</h1>
          <p className={styles.subtitle}>
            Select a targeted speech pathology module or jump directly into conversational AI
          </p>
        </div>

        {/* 4 Core Modules Container */}
        <div className={styles.boxContainer}>
          {/* Box 1: Oral & Breath Control Training */}
          <Link href="/session" className={styles.box}>
            <div>
              <div className={styles.boxTop}>
                <span className={styles.boxIcon}>🎙️</span>
                <span className={styles.boxTag}>Acoustic Live</span>
              </div>
              <h3 className={styles.boxTitle}>Oral & Breath Control</h3>
              <p className={styles.boxDesc}>
                Real-time vocal rhythm pacing, phonation steadiness, and pause reduction with live multimodal scoring.
              </p>
            </div>
            <span className={styles.boxAction}>Launch Live Mic Practice →</span>
          </Link>

          {/* Box 2: Vocabulary Enhancement & Pronunciation Game */}
          <Link href="/pronunciation" className={styles.box}>
            <div>
              <div className={styles.boxTop}>
                <span className={styles.boxIcon}>🎯</span>
                <span className={styles.boxTag}>Phoneme Match</span>
              </div>
              <h3 className={styles.boxTitle}>Vocabulary & Pronunciation</h3>
              <p className={styles.boxDesc}>
                Word-by-word pronunciation game. Audio playback, microphone capture, and instant phoneme accuracy verification.
              </p>
            </div>
            <span className={styles.boxAction}>Start Pronunciation Game →</span>
          </Link>

          {/* Box 3: Conversational AI 3D Buddy */}
          <Link href="/avatar" className={styles.box}>
            <div>
              <div className={styles.boxTop}>
                <span className={styles.boxIcon}>🤖</span>
                <span className={styles.boxTag}>3D Real-Time</span>
              </div>
              <h3 className={styles.boxTitle}>3D Conversational Buddy</h3>
              <p className={styles.boxDesc}>
                Empathetic 3D character with streaming audio, viseme lip synchronization, natural listening, and conversational turns.
              </p>
            </div>
            <span className={styles.boxAction}>Converse with Buddy →</span>
          </Link>

          {/* Box 4: Adaptive RL Session Scheduler */}
          <Link href="/scheduler" className={styles.box}>
            <div>
              <div className={styles.boxTop}>
                <span className={styles.boxIcon}>🧠</span>
                <span className={styles.boxTag}>Reinforcement Learning</span>
              </div>
              <h3 className={styles.boxTitle}>Adaptive RL Recommendation</h3>
              <p className={styles.boxDesc}>
                DQN algorithm computes the optimal next training step based on fatigue, past scores, and learning persona.
              </p>
            </div>
            <span className={styles.boxAction}>View AI Session Plan →</span>
          </Link>
        </div>

        {/* Quick Strip for Progress Dashboard */}
        <div className={styles.quickStrip}>
          <div className={styles.quickStripText}>
            <h3>Want to review your long-term acoustic trajectories?</h3>
            <p>Track pitch stability, pause frequency reductions, and composite scores across all sessions.</p>
          </div>
          <Link href="/progress" className={styles.quickBtn}>
            View Analytics Chart
          </Link>
        </div>
      </main>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
