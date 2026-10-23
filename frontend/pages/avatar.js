import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import axios from 'axios';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import CameraEmotionPip from '../components/CameraEmotionPip';
import styles from '../styles/avatar.module.css';

const AvatarCanvas = dynamic(() => import('../components/AvatarCanvas'), { ssr: false });

// ─── Scenario definitions ────────────────────────────────────────────────────
const SCENARIOS = {
  coffee_shop: {
    id: 'coffee_shop', title: 'Coffee Shop Ordering', icon: '☕',
    badge: 'Barista Roleplay',
    tip: 'Take your time. Breathe calmly, pause naturally, and order your drink.',
  },
  phone_call: {
    id: 'phone_call', title: 'Phone Call Simulation', icon: '📞',
    badge: 'Phone Practice',
    tip: 'Practice speaking clearly and pacing your sentences with zero rush.',
  },
  breath_control: {
    id: 'breath_control', title: 'Breath Pacing & Calm', icon: '🌬️',
    badge: 'Diaphragmatic Breath',
    tip: 'Inhale 4s, hold 2s, exhale 4s — let your shoulders drop.',
  },
  pronunciation: {
    id: 'pronunciation', title: 'Articulation Precision', icon: '🎯',
    badge: 'Speech Precision',
    tip: 'Light crisp contact on consonants, smooth vowel extensions.',
  },
  confidence_boost: {
    id: 'confidence_boost', title: 'Confidence Boost', icon: '💪',
    badge: 'Vocal Mindset',
    tip: 'Every word spoken is valuable practice!',
  },
};

const QUICK_PRACTICES = [
  { key: 'coffee_shop',      label: '☕ Practice ordering at a café' },
  { key: 'phone_call',       label: '📞 Phone call simulation' },
  { key: 'breath_control',   label: '🌬️ Calm breathing & pacing' },
  { key: 'pronunciation',    label: '🎯 Articulation & word practice' },
  { key: 'confidence_boost', label: '💪 Confidence boost' },
];

// ─── Status helpers (zero jargon) ───────────────────────────────────────────
const STATUS_LABELS = {
  idle:         { text: 'Click  🎙️  to start talking',           color: '#94a3b8' },
  connecting:   { text: 'Getting ready…',                        color: '#f59e0b' },
  connected:    { text: 'Ready — say anything',                  color: '#22c55e' },
  listening:    { text: '🎙️ I\'m listening…',                    color: '#38bdf8' },
  speaking:     { text: '🔊 Speaking…',                          color: '#a78bfa' },
  disconnected: { text: 'Session ended — click 🎙️ to start again', color: '#94a3b8' },
  error:        { text: '⚠️ Connection issue — click 🎙️ to retry', color: '#f87171' },
};

export default function AvatarPage() {
  const { user } = useAuth();

  // ── Core state ───────────────────────────────────────────────────────────
  const [messages,        setMessages]        = useState([]);
  const [avatarState,     setAvatarState]     = useState('idle');
  const [avatarGender,    setAvatarGender]    = useState('female');
  const [audioLevel,      setAudioLevel]      = useState(0);
  const [showSubtitle,    setShowSubtitle]    = useState(false);
  const [subtitleText,    setSubtitleText]    = useState('');

  // ── ConvAI session state ─────────────────────────────────────────────────
  const [convStatus,      setConvStatus]      = useState('idle');
  const [activeScenario,  setActiveScenario]  = useState(null);
  const [sessionStats,    setSessionStats]    = useState({ streak: 0, fluency: 0 });
  const [sessionNote,     setSessionNote]     = useState('');
  const [sessionFeedback, setSessionFeedback] = useState(null); // post-session card

  // ── Facial emotion state (camera PiP) ────────────────────────────────────
  const [userEmotion, setUserEmotion] = useState({ emotion: null, emotion_source: null, expression: null, status: 'off' });
  const lastCameraContext = useRef({ key: '', at: 0, feeling: null });

  // ── Text input fallback ──────────────────────────────────────────────────
  const [inputText,       setInputText]       = useState('');
  const [isSendingText,   setIsSendingText]   = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const convRef          = useRef(null);
  const animFrameRef     = useRef(null);
  const subtitleTimerRef = useRef(null);
  const chatBottomRef    = useRef(null);
  const genderRef        = useRef(avatarGender);
  const sessionStartRef  = useRef(null); // tracks session start time for duration
  const messagesRef      = useRef(messages);

  useEffect(() => { genderRef.current = avatarGender; }, [avatarGender]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Unlock browser audio policy on user interaction ───────────────────────
  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // inaudible blip to bless audio context
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
        ctx.resume();
      }
    } catch (e) {
      console.warn('[Audio unlock]', e);
    }
  }, []);

  // ── Real-Time Facial Emotion Injection into Active Conversation ──────────
  const handleEmotionChange = useCallback((emotionData) => {
    setUserEmotion(emotionData);
    if (convRef.current && convRef.current.sendContextualUpdate) {
      try {
        const key = `${emotionData.status}:${emotionData.expression}:${emotionData.emotion}`;
        const now = Date.now();
        const clearsTracking = emotionData.status !== 'tracking';
        const changedFeeling = emotionData.emotion !== lastCameraContext.current.feeling;
        if (key === lastCameraContext.current.key || (!clearsTracking && !changedFeeling && now - lastCameraContext.current.at < 10000)) return;
        lastCameraContext.current = { key, at: now, feeling: emotionData.emotion };
        const reported = emotionData.emotion_source === 'self_report' ? emotionData.emotion : 'not shared';
        const updateText = `[OPTIONAL CAMERA CONTEXT]: Visible expression: ${emotionData.expression || 'unavailable'}. User-reported feeling: ${reported}. Facial appearance does not establish feelings, fatigue or clinical tension. Ask how they feel rather than making assumptions.`;
        convRef.current.sendContextualUpdate(updateText);
      } catch (err) {
        console.warn('[ConvAI Context Injection]', err);
      }
    }
  }, []);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  const getAuthHdr = useCallback(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('neuronudge_token') : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  // ── Auto-scroll chat ─────────────────────────────────────────────────────
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (convRef.current) convRef.current.endSession().catch(() => {});
    };
  }, []);

  // ── Subtitle helpers ─────────────────────────────────────────────────────
  const flashSubtitle = useCallback((text) => {
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    setSubtitleText(text);
    setShowSubtitle(true);
    subtitleTimerRef.current = setTimeout(() => setShowSubtitle(false), 5500);
  }, []);

  // ── Audio level polling for lip-sync ─────────────────────────────────────
  const startVolumePoll = useCallback((conv) => {
    const poll = () => {
      if (convRef.current !== conv) return;
      try {
        const out = conv.getOutputVolume ? conv.getOutputVolume() : 0;
        const inp = conv.getInputVolume  ? conv.getInputVolume()  : 0;
        setAudioLevel(Math.max(out, inp) * 1.6);
      } catch { /* ignore */ }
      animFrameRef.current = requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }, []);

  // ── Push a chat bubble (with deduplication) ──────────────────────────────
  const pushMessage = useCallback((sender, text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.sender === sender && last.text.trim() === trimmed) {
        return prev;
      }
      return [...prev, {
        sender,
        text: trimmed,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }];
    });
    if (sender === 'buddy') flashSubtitle(trimmed);
  }, [flashSubtitle]);

  // ─────────────────────────────────────────────────────────────────────────
  //  START ConvAI session
  // ─────────────────────────────────────────────────────────────────────────
  const startSession = useCallback(async (scenarioKey) => {
    // Unlock browser audio context on user interaction
    unlockAudio();

    // End any existing session cleanly
    if (convRef.current) {
      try { await convRef.current.endSession(); } catch { /* ignore */ }
      convRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    setConvStatus('connecting');
    setAvatarState('thinking');
    setMessages([]);
    setSessionFeedback(null);
    sessionStartRef.current = Date.now();

    try {
      // 1. Get signed WebSocket URL from backend (API key stays server-side)
      const params = new URLSearchParams({ gender: genderRef.current });
      if (scenarioKey) params.set('scenario', scenarioKey);

      const { data } = await axios.get(
        `${backendUrl}/avatar/convai-session?${params.toString()}`,
        { headers: getAuthHdr() }
      );

      const { signed_url, avatar_name, streak, fluency } = data;
      if (streak  !== undefined) setSessionStats(s => ({ ...s, streak }));
      if (fluency !== undefined) setSessionStats(s => ({ ...s, fluency: Math.round(fluency) }));

      // 2. Dynamically import ElevenLabs client (avoids SSR issues)
      const { Conversation } = await import('@elevenlabs/client');

      // 3. Open the WebSocket conversation
      const conv = await Conversation.startSession({
        signedUrl: signed_url,

        onConnect: () => {
          setConvStatus('connected');
          setAvatarState('idle');
          try {
            if (conv.setVolume) conv.setVolume({ volume: 1.0 });
          } catch (e) {}
        },

        onMessage: ({ message, source }) => {
          const sender = source === 'ai' ? 'buddy' : 'user';
          pushMessage(sender, message);
          if (source === 'ai') {
            setSessionNote('Natural response — you\'re doing great!');
          }
        },

        onModeChange: ({ mode }) => {
          if (mode.mode === 'speaking') {
            setConvStatus('speaking');
            setAvatarState('speaking');
          } else if (mode.mode === 'listening') {
            setConvStatus('listening');
            setAvatarState('listening');
          } else {
            setConvStatus('connected');
            setAvatarState('idle');
          }
        },

        onStatusChange: ({ status }) => {
          if (status.status === 'disconnected') {
            setConvStatus('disconnected');
            setAvatarState('idle');
            setAudioLevel(0);
            convRef.current = null;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          }
        },

        onError: (error) => {
          console.error('[ConvAI Error]', error);
          setConvStatus('error');
          setAvatarState('idle');
        },
      });

      convRef.current = conv;
      try {
        if (conv.setVolume) conv.setVolume({ volume: 1.0 });
      } catch (e) {}
      startVolumePoll(conv);

    } catch (err) {
      console.error('[ConvAI Session Error]', err);
      setConvStatus('error');
      setAvatarState('idle');
      pushMessage('buddy', '⚠️ Could not connect. Please check your internet and try again.');
    }
  }, [backendUrl, getAuthHdr, pushMessage, startVolumePoll, unlockAudio]);

  // ─────────────────────────────────────────────────────────────────────────
  //  END ConvAI session → score + persist transcript
  // ─────────────────────────────────────────────────────────────────────────
  const endSession = useCallback(async (currentMessages) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    if (convRef.current) {
      try { await convRef.current.endSession(); } catch { /* ignore */ }
      convRef.current = null;
    }
    setConvStatus('disconnected');
    setAvatarState('idle');
    setActiveScenario(null);

    // POST transcript to backend for real scoring + memory persistence
    const msgs = (currentMessages && currentMessages.length > 0)
      ? currentMessages
      : (messagesRef.current || []);

    if (msgs.length >= 1) {
      const durationSecs = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : 0;
      try {
        const res = await axios.post(
          `${backendUrl}/avatar/session-end`,
          {
            transcript: msgs.map(m => ({ sender: m.sender, text: m.text, time: m.time })),
            scenario: activeScenario ? activeScenario.id : null,
            duration_secs: durationSecs,
          },
          { headers: { 'Content-Type': 'application/json', ...getAuthHdr() } }
        );
        const { fluency_score, streak, feedback, improvement_tip, turns_completed } = res.data;
        setSessionStats({ streak, fluency: fluency_score == null ? null : Math.round(fluency_score) });
        setSessionFeedback({ fluency_score, feedback, improvement_tip, turns_completed });
      } catch (e) {
        console.warn('[session-end]', e);
      }
    }
  }, [backendUrl, getAuthHdr, activeScenario]);

  // ─────────────────────────────────────────────────────────────────────────
  //  SCENARIO handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleStartScenario = useCallback(async (key) => {
    const scenario = SCENARIOS[key];
    if (!scenario) return;
    setActiveScenario(scenario);
    await startSession(key);
  }, [startSession]);

  const handleExitScenario = useCallback(async (currentMessages) => {
    setActiveScenario(null);
    await endSession(currentMessages);
    await startSession(null);
  }, [startSession, endSession]);

  // ─────────────────────────────────────────────────────────────────────────
  //  GENDER toggle — restart with new voice
  // ─────────────────────────────────────────────────────────────────────────
  const handleGenderToggle = useCallback(async (newGender) => {
    if (newGender === genderRef.current) return;
    setAvatarGender(newGender);
    genderRef.current = newGender;
    if (convRef.current) {
      await endSession(messages);
      await startSession(activeScenario ? activeScenario.id : null);
    }
  }, [activeScenario, startSession, endSession, messages]);

  // ─────────────────────────────────────────────────────────────────────────
  //  TEXT CHAT fallback
  // ─────────────────────────────────────────────────────────────────────────
  const handleSendText = useCallback(async () => {
    const query = inputText.trim();
    if (!query || isSendingText) return;

    pushMessage('user', query);
    setInputText('');
    setIsSendingText(true);
    setAvatarState('thinking');

    try {
      const res = await axios.post(`${backendUrl}/avatar/chat`, {
        message:          query,
        gender:           avatarGender,
        detected_emotion: userEmotion?.emotion || null,
        emotion_source: userEmotion?.emotion_source || null,
        visible_expression: userEmotion?.status === 'tracking' ? userEmotion.expression : null,
        history: messages.slice(-8).map(m => ({
          role:    m.sender === 'buddy' ? 'assistant' : 'user',
          content: m.text,
        })),
      }, { headers: { 'Content-Type': 'application/json', ...getAuthHdr() } });

      const { reply, audio_base64 } = res.data;
      pushMessage('buddy', reply);

      if (audio_base64) {
        const audio = new Audio(`data:audio/mp3;base64,${audio_base64}`);
        audio.onplay  = () => setAvatarState('speaking');
        audio.onended = () => setAvatarState('idle');
        audio.play().catch(() => setAvatarState('idle'));
      } else {
        setAvatarState('idle');
      }
    } catch (err) {
      pushMessage('buddy', `⚠️ ${err.response ? err.response.data.detail : 'Could not reach backend.'}`);
      setAvatarState('idle');
    } finally {
      setIsSendingText(false);
    }
  }, [inputText, isSendingText, avatarGender, userEmotion, messages, backendUrl, getAuthHdr, pushMessage]);

  // ── Derived UI state ─────────────────────────────────────────────────────
  const isLive       = convStatus === 'connected' || convStatus === 'listening' || convStatus === 'speaking';
  const isConnecting = convStatus === 'connecting';
  const statusInfo   = STATUS_LABELS[convStatus] || STATUS_LABELS.idle;
  const avatarName   = avatarGender === 'female' ? 'Maya' : 'Alex';

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Maya — Your Practice Buddy | Speation</title>
          <meta name="description" content="Live AI speech practice companion. Maya listens, responds in context, and adapts to help you grow." />
        </Head>

        <Navbar />

        {/* ── FULL-SCREEN 3D AVATAR ─────────────────────────────────── */}
        <div className={styles.fullScreenStage}>
          <AvatarCanvas
            state={avatarState}
            audioLevel={audioLevel}
            gender={avatarGender}
          />
        </div>

        {/* ── TOP OVERLAY ───────────────────────────────────────────── */}
        <div className={styles.topOverlay}>
          <div className={styles.topLeftCard}>
            <div className={styles.personaHeader}>
              <div>
                <h2 className={styles.personaTitle}>
                  {avatarName}
                </h2>
                <p className={styles.personaSubtitle} style={{ color: statusInfo.color, transition: 'color 0.4s' }}>
                  {statusInfo.text}
                </p>
              </div>

              <div className={styles.genderToggle}>
                <button
                  type="button"
                  className={`${styles.genderBtn} ${avatarGender === 'female' ? styles.genderBtnActive : ''}`}
                  onClick={() => handleGenderToggle('female')}
                >
                  👩 Maya
                </button>
                <button
                  type="button"
                  className={`${styles.genderBtn} ${avatarGender === 'male' ? styles.genderBtnActive : ''}`}
                  onClick={() => handleGenderToggle('male')}
                >
                  👨 Alex
                </button>
              </div>
            </div>

            {/* Live Stats — no model names, no jargon */}
            <div className={styles.liveStats}>
              {sessionStats.fluency > 0 && (
                <div className={styles.statPill}>
                  <span className={styles.statPillIcon}>📈</span>
                  <span className={styles.statPillVal}>{sessionStats.fluency}%</span>
                  <span className={styles.statPillLabel}>Speech Flow</span>
                </div>
              )}
              {sessionStats.streak > 0 && (
                <div className={styles.statPill}>
                  <span className={styles.statPillIcon}>🔥</span>
                  <span className={styles.statPillVal}>{sessionStats.streak}d</span>
                  <span className={styles.statPillLabel}>Streak</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CAMERA EMOTION PiP ────────────────────────────────────── */}
        <CameraEmotionPip
          onEmotionChange={handleEmotionChange}
        />

        {/* ── SUBTITLE OVERLAY ──────────────────────────────────────── */}
        {showSubtitle && subtitleText && (
          <div className={styles.subtitleOverlay}>
            <p className={styles.subtitleText}>{subtitleText}</p>
          </div>
        )}

        {/* ── BOTTOM CONSOLE ────────────────────────────────────────── */}
        <div className={styles.bottomOverlay}>

          {/* Chat transcript */}
          <div className={styles.chatDrawer}>
            {messages.length === 0 && !isLive && !isConnecting && (
              <div style={{ textAlign: 'center', color: 'rgba(148,163,184,0.6)', padding: '24px 0', fontSize: '0.9rem' }}>
                Click <strong>🎙️ Start Session</strong> to begin your live conversation with {avatarName}.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`${styles.chatMsg} ${m.sender === 'buddy' ? styles.buddyMsg : styles.userMsg}`}
              >
                <div className={styles.chatMsgSender}>
                  {m.sender === 'buddy' ? avatarName : 'You'}
                  <span className={styles.chatMsgTime}>{m.time}</span>
                </div>
                <div className={styles.chatMsgText}>{m.text}</div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Active scenario banner */}
          {activeScenario && (
            <div className={styles.activeScenarioBanner}>
              <div className={styles.activeScenarioLeft}>
                <span className={styles.activeScenarioIcon}>{activeScenario.icon}</span>
                <div>
                  <div className={styles.activeScenarioTitle}>
                    {activeScenario.title}
                    <span className={styles.activeScenarioBadge}>{activeScenario.badge}</span>
                  </div>
                  <div className={styles.activeScenarioTip}>{activeScenario.tip}</div>
                </div>
              </div>
              <button
                type="button"
                className={styles.exitScenarioBtn}
                onClick={() => handleExitScenario(messages)}
              >
                ✕ End Scenario
              </button>
            </div>
          )}

          {/* Post-session feedback card */}
          {sessionFeedback && !isLive && (
            <div style={{
              background: 'rgba(255,255,255,0.96)',
              border: '1.5px solid rgba(255,98,37,0.3)',
              borderRadius: 14,
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              animation: 'slideUp 0.3s ease',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1E2022', marginBottom: 2 }}>
                  {sessionFeedback.feedback}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                  💡 {sessionFeedback.improvement_tip}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FF6225' }}>
                  {sessionFeedback.fluency_score == null ? "Audio score unavailable" : `${Math.round(sessionFeedback.fluency_score)}%`}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Speech Flow
                </div>
              </div>
            </div>
          )}

          {/* Session note */}
          {sessionNote && isLive && (
            <div className={styles.sessionNote}>💬 {sessionNote}</div>
          )}

          {/* ── CONTROL BAR ─────────────────────────────────────────── */}
          <div className={styles.controlBar}>
            {/* PRIMARY: Live session toggle */}
            <button
              id="convai-mic-btn"
              type="button"
              className={`${styles.mainMicBtn} ${isLive ? styles.micActive : ''}`}
              onClick={isLive ? () => endSession(messages) : () => startSession(activeScenario ? activeScenario.id : null)}
              disabled={isConnecting}
              title={isLive ? 'End session' : 'Start talking'}
            >
              {isConnecting ? '⏳' : isLive ? '⏹️' : '🎙️'}
            </button>

            {/* LIVE indicator badge */}
            {isLive && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 20,
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                fontSize: '0.72rem', fontWeight: 700, color: '#22c55e',
                letterSpacing: '0.06em',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
                  animation: 'pulse 1.4s infinite',
                }} />
                LIVE
              </div>
            )}

            {/* Text input fallback */}
            <input
              type="text"
              className={styles.textInput}
              placeholder={
                isLive
                  ? 'Voice is live — or type here…'
                  : 'Type a message, or click 🎙️ to talk…'
              }
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSendText(); } }}
              disabled={isSendingText}
            />

            <button
              type="button"
              className={styles.sendActionBtn}
              onClick={handleSendText}
              disabled={isSendingText || !inputText.trim()}
            >
              {isSendingText ? '…' : 'Send'}
            </button>
          </div>

          {/* Quick practice pills */}
          <div className={styles.quickPillsRow}>
            {QUICK_PRACTICES.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.quickPill} ${activeScenario && activeScenario.id === p.key ? styles.quickPillActive : ''}`}
                disabled={isConnecting}
                onClick={() => handleStartScenario(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
