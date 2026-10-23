import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/session.module.css';

const PRACTICE_PROMPTS = [
  {
    id: 1,
    category: 'Breath & Phonation Pacing',
    text: 'The warm morning breeze whispered softly through the ancient pine trees across the quiet valley.',
    tips: 'Inhale deeply from your diaphragm. Aim for smooth, uninterrupted airflow across syllables.'
  },
  {
    id: 2,
    category: 'Vowel Prolongation & Rhythm',
    text: 'Clear rivers flow gently over polished stones, carrying silver reflections toward the distant horizon.',
    tips: 'Slightly elongate the vowels in "gently" and "horizon" to stabilize vocal fold vibration.'
  },
  {
    id: 3,
    category: 'Consonant Articulation & Precision',
    text: 'Persistent practice brings profound progress in every creative discipline and daily conversation.',
    tips: 'Maintain light articulatory contact on "p" and "b" plosives to prevent tension.'
  },
  {
    id: 4,
    category: 'Contextual Conversational Flow',
    text: 'When we listen with patience and empathy, genuine connections flourish naturally between friends.',
    tips: 'Pause mindfully at natural punctuation marks to reset your respiratory baseline.'
  }
];

export default function Session() {
  const router = useRouter();
  const [completedTrajectory, setCompletedTrajectory] = useState(null);
  const recordingTimer = useRef(null);
  useEffect(() => () => {
    clearTimeout(recordingTimer.current);
    recognitionRef.current?.stop();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
  }, []);
  const [promptIndex, setPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Click microphone to begin speaking');
  const [audioBlobUrl, setAudioBlobUrl] = useState(null);
  const [scores, setScores] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);

  const level = Math.max(1, Math.min(3, Number(router.query.difficulty) || 1));
  const currentPrompt = { ...PRACTICE_PROMPTS[promptIndex], text: level === 1
    ? ['The warm breeze moves through the trees.', 'Clear rivers flow over smooth stones.',
       'Daily practice helps me communicate.', 'We listen with patience and care.'][promptIndex]
    : level === 3 ? PRACTICE_PROMPTS[promptIndex].text + ' Explain what this sentence brings to mind.'
    : PRACTICE_PROMPTS[promptIndex].text };

  // Cycle to next prompt
  const handleNextPrompt = () => {
    setPromptIndex((prev) => (prev + 1) % PRACTICE_PROMPTS.length);
    setScores(null);
    setTranscript('');
    setAudioBlobUrl(null);
    setStatusText('Click microphone to begin speaking');
  };

  const startRecording = async () => {
    setScores(null);
    setTranscript('');
    setAudioBlobUrl(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        clearTimeout(recordingTimer.current);
        setIsRecording(false);
        recognitionRef.current?.stop();
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(url);
        stream.getTracks().forEach((track) => track.stop());
        processFluencyAnalysis(audioBlob);
      };

      // Browser Speech Recognition for instant transcript
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        recognition.onerror = (err) => {
          console.warn('Speech recognition warning:', err);
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      mediaRecorder.start(250);
      recordingTimer.current = setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 30000);
      setIsRecording(true);
      setStatusText('Listening... Speak the sentence clearly at your natural pace');
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      setStatusText('Microphone access was denied. Please allow microphone permissions in your browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      setStatusText('Analyzing audio and transcript...');
      setAnalyzing(true);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processFluencyAnalysis = async (audioBlob) => {
    setAnalyzing(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('mode', 'reading');
      formData.append('difficulty', String(level));
      if (router.query.trajectory_id && router.query.trajectory_id !== completedTrajectory) {
        formData.append('trajectory_id', router.query.trajectory_id);
      }
      formData.append('target_text', currentPrompt.text);

      const token = localStorage.getItem('neuronudge_token');
      const headers = { 'Content-Type': 'multipart/form-data' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await axios.post(`${backendUrl}/fluency/score`, formData, {
        headers
      });

      setScores(response.data);
      if (router.query.trajectory_id) setCompletedTrajectory(router.query.trajectory_id);
      if (response.data.transcript) {
        setTranscript(response.data.transcript);
      }
      setStatusText('Analysis Complete!');
    } catch (err) {
      console.error('Fluency analysis error:', err);
      const errDetail = err.response?.data?.detail || err.message || 'Unable to connect to fluency scoring backend.';
      setStatusText(`Fluency analysis service error: ${errDetail}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
      <Head>
        <title>Oral & Breath Control Practice — Speation</title>
      </Head>

      <Navbar />

      <div className={styles.yellowCircle}></div>
      <div className={styles.orangeCircle}></div>
      <div className={styles.whiteCover1}></div>

      <main className={styles.mainContent}>
        <div className={styles.sessionCard}>
          <div className={styles.headerSection}>
            <span className={styles.badge}>Module 01 • Bio-Acoustic Training</span>
            <h1 className={styles.title}>Oral & Breath Control</h1>
            <p className={styles.subtitle}>
              Read the prompt aloud into your microphone. Our multimodal fusion engine analyzes your rhythm, pitch stability, and phoneme velocity.
            </p>
          </div>

          {/* Prompt Box */}
          <div className={styles.promptBox}>
            <div className={styles.promptHeader}>
              <span className={styles.promptLabel}>Practice Prompt #{currentPrompt.id}</span>
              <button className={styles.reloadPromptBtn} onClick={handleNextPrompt}>
                <Image src="/icons/reload.png" alt="Reload" width={16} height={16} />
                Next Sentence
              </button>
            </div>
            <div className={styles.promptText}>"{currentPrompt.text}"</div>
          </div>

          {/* Mic Controls and Live Audio Waves */}
          <div className={styles.controlsSection}>
            <button
              className={`${styles.recordButton} ${isRecording ? styles.recordingActive : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'Click to stop' : 'Click to start speaking'}
            >
              <Image
                src={isRecording ? '/icons/stop.png' : '/icons/mic.png'}
                alt="Mic"
                width={38}
                height={38}
              />
            </button>

            {/* Live Waveform Bars */}
            <div className={styles.waveformDisplay}>
              {[12, 28, 45, 20, 36, 50, 24, 40, 18, 32, 48, 22, 38, 16, 30].map((h, idx) => (
                <div
                  key={idx}
                  className={`${styles.waveBar} ${isRecording ? styles.waveBarActive : ''}`}
                  style={{
                    height: isRecording
                      ? `${Math.max(10, (h * (1 + Math.sin(Date.now() / 200 + idx)))) % 46 + 8}px`
                      : '8px'
                  }}
                />
              ))}
            </div>

            <div className={styles.statusText}>{statusText}</div>
          </div>

          {/* Results Display */}
          {scores && (
            <div className={styles.resultsContainer}>
              <div className={styles.resultsHeader}>
                <h3>Fluency proxy estimate</h3>
                <div className={styles.overallScoreBadge}>
                  {scores.composite} / 100
                </div>
              </div>

              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricTitle}>Modality attention</div>
                  <div className={styles.metricScore}>Audio {scores.acoustic_weight == null ? '—' : `${(scores.acoustic_weight * 100).toFixed(1)}%`}</div>
                  <div className={styles.metricSubtext}>Text {scores.semantic_weight == null ? '—' : `${(scores.semantic_weight * 100).toFixed(1)}%`} · model contributions</div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricTitle}>Reference meaning similarity</div>
                  <div className={styles.metricScore}>{scores.semantic == null ? "No reference" : `${scores.semantic}%`}</div>
                  <div className={styles.metricSubtext}>Meaning similarity to the reference sentence</div>
                </div>

                <div className={styles.metricCard}>
                  <div className={styles.metricTitle}>Pacing & Velocity</div>
                  <div className={styles.metricScore}>{scores.rate || 'Unavailable'}</div>
                  <div className={styles.metricSubtext}>Words per minute in this recording</div>
                </div>
              </div>

              {transcript && (
                <div className={styles.transcriptBox}>
                  <div className={styles.transcriptLabel}>Transcribed Speech</div>
                  <div className={styles.transcriptText}>"{transcript}"</div>
                </div>
              )}

              {audioBlobUrl && (
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: '#6C757D', marginBottom: '6px' }}>Listen to your recorded sample:</p>
                  <audio controls src={audioBlobUrl} style={{ width: '100%', maxWidth: '400px' }} />
                </div>
              )}

              <div className={styles.recommendationBox}>
                <strong>💡 Feedback: </strong>
                {scores.recommendation || currentPrompt.tips}
              </div>
            </div>
          )}
        </div>
      </main>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
