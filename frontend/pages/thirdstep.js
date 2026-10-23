import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/thirdstep.module.css';

export default function ThirdStep() {
  const [currentWord, setCurrentWord] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [userSpeech, setUserSpeech] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [containerColor, setContainerColor] = useState(styles.fixedContainer);
  const [feedback, setFeedback] = useState('');
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState(null); // { correct, accuracyScore, verdict, target, userSaid }
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const recognitionRef    = useRef(null);
  const silenceTimerRef   = useRef(null);
  const countdownIntervalRef = useRef(null);
  const initialTimeoutRef = useRef(null);
  const spokenTextRef     = useRef('');
  const hasSpokenRef      = useRef(false);
  const isRecordingRef    = useRef(false);

  // Fetch word from backend on initial mount & restore previous result if any
  useEffect(() => {
    fetchWord();
    return () => {
      stopRecordingCleanly();
    };
  }, []);

  const stopRecordingCleanly = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setSilenceCountdown(null);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (initialTimeoutRef.current) {
      clearTimeout(initialTimeoutRef.current);
      initialTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }
  };

  const fetchWord = async () => {
    stopRecordingCleanly();
    try {
      setContainerColor(styles.fixedContainer);
      setUserSpeech('');
      setFeedback('');
      setResult(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.get(`${backendUrl}/thirdstep/get-word/`);
      setCurrentWord(response.data.word);
      setPhonetic(response.data.phonetic || '');
    } catch (error) {
      console.error('Error fetching target word:', error);
      setCurrentWord('soliloquy');
      setPhonetic('/səˈlɪləkwi/');
    }
  };

  const playWordPronunciation = async () => {
    if (!currentWord) return;

    try {
      setAudioLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.get(`${backendUrl}/thirdstep/text-to-speech/?word=${encodeURIComponent(currentWord)}`, {
        responseType: 'blob'
      });

      const blobUrl = URL.createObjectURL(response.data);
      const audio = new Audio(blobUrl);
      audio.play();
    } catch (error) {
      console.error('Error generating ElevenLabs TTS:', error);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentWord);
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setAudioLoading(false);
    }
  };

  const finishAndSubmit = () => {
    const spoken = (spokenTextRef.current || userSpeech).trim();
    stopRecordingCleanly();

    if (spoken) {
      setFeedback('');
      checkPronunciation(spoken);
    } else {
      setFeedback('No voice detected. Please click 🎙️, pronounce the word clearly, and wait for the score.');
    }
  };

  const startRecording = () => {
    if (!currentWord) {
      alert('Click Next Word first!');
      return;
    }

    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    stopRecordingCleanly();
    spokenTextRef.current = '';
    hasSpokenRef.current = false;
    setUserSpeech('');
    setFeedback('Listening… Speak now. (Input auto-submits 3s after silence)');
    setResult(null);
    isRecordingRef.current = true;
    setIsRecording(true);

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // Timeout if user clicks record but says nothing after 10 seconds
    initialTimeoutRef.current = setTimeout(() => {
      if (!hasSpokenRef.current && isRecordingRef.current) {
        setFeedback('No voice heard. Click 🎙️ and pronounce the word aloud.');
        stopRecordingCleanly();
      }
    }, 10000);

    recognition.onresult = (event) => {
      let accumulated = '';
      for (let i = 0; i < event.results.length; i++) {
        accumulated += event.results[i][0].transcript + ' ';
      }
      accumulated = accumulated.trim();

      if (accumulated) {
        hasSpokenRef.current = true;
        spokenTextRef.current = accumulated;
        setUserSpeech(accumulated);

        // Reset silence timer: 3 seconds after speaking stops
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (initialTimeoutRef.current) clearTimeout(initialTimeoutRef.current);

        let countdown = 3;
        setSilenceCountdown(countdown);
        setFeedback(`Heard speech! Auto-submitting in ${countdown}s (or click ⏹️ Submit)`);

        countdownIntervalRef.current = setInterval(() => {
          countdown -= 1;
          if (countdown > 0) {
            setSilenceCountdown(countdown);
            setFeedback(`Heard speech! Auto-submitting in ${countdown}s (or click ⏹️ Submit)`);
          } else {
            clearInterval(countdownIntervalRef.current);
          }
        }, 1000);

        silenceTimerRef.current = setTimeout(() => {
          finishAndSubmit();
        }, 3000);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[SpeechRec error]', event.error);
      if (event.error === 'no-speech') {
        if (!hasSpokenRef.current) {
          setFeedback('No voice heard. Click 🎙️ to try again.');
          stopRecordingCleanly();
        } else {
          finishAndSubmit();
        }
      } else if (event.error !== 'aborted') {
        if (hasSpokenRef.current) {
          finishAndSubmit();
        } else {
          stopRecordingCleanly();
          setFeedback('Audio capture issue. Please verify microphone permissions in browser.');
        }
      }
    };

    recognition.onend = () => {
      if (hasSpokenRef.current) {
        finishAndSubmit();
      } else {
        stopRecordingCleanly();
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn('[SpeechRec Start]', e);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const checkPronunciation = async (spokenWord) => {
    try {
      setEvaluating(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.post(`${backendUrl}/thirdstep/check-pronunciation/`, {
        word: currentWord,
        user_said: spokenWord
      });

      const data = response.data;
      const isCorrect = data.correct;
      const accScore = data.accuracy_score !== undefined ? data.accuracy_score : (isCorrect ? 100 : 50);

      setResult({
        correct: isCorrect,
        accuracyScore: accScore,
        verdict: data.verdict || (isCorrect ? 'Excellent articulation and consonant precision!' : 'Listen to the audio model and focus on syllable stress.'),
        target: data.target || currentWord,
        userSaid: data.user_said || spokenWord
      });

      if (isCorrect) {
        setContainerColor(styles.correctContainer);
        setStreak((prev) => prev + 1);
      } else {
        setContainerColor(styles.incorrectContainer);
      }
    } catch (error) {
      console.error('Pronunciation check error:', error);
      const isMatch = spokenWord.toLowerCase().includes(currentWord.toLowerCase());
      const accScore = isMatch ? 100 : 55;
      setResult({
        correct: isMatch,
        accuracyScore: accScore,
        verdict: isMatch ? 'Great job! Word matched successfully.' : 'Needs practice. Listen to the model pronunciation and try again.',
        target: currentWord,
        userSaid: spokenWord
      });
      if (isMatch) {
        setContainerColor(styles.correctContainer);
        setStreak((prev) => prev + 1);
      } else {
        setContainerColor(styles.incorrectContainer);
      }
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Vocabulary Enhancement & Pronunciation — Speation</title>
        </Head>

        <Navbar />

        <div className={containerColor}>
          <h2 className={styles.title}>Vocabulary Enhancement & Pronunciation Game</h2>
          <p style={{ color: '#718096', marginBottom: '25px', fontSize: '0.95rem' }}>
            Strengthen phoneme velocity and consonant precision. Listen to the AI model, then speak.
          </p>

          <div className={styles.gameBox}>
            {/* Word Display & Native Audio Player */}
            <div className={styles.wordContainer}>
              <button className={styles.wordButton} type="button">
                {currentWord || 'Loading...'}
              </button>
              <button 
                className={styles.playButton} 
                onClick={playWordPronunciation} 
                disabled={audioLoading} 
                title="Listen to pronunciation"
                type="button"
              >
                {audioLoading ? '⏳' : '🔊'}
              </button>
            </div>

            {phonetic && (
              <p style={{ color: '#718096', fontStyle: 'italic', marginBottom: '15px' }}>
                Phonetic: {phonetic}
              </p>
            )}

            {/* Microphone & Submission Action */}
            <div style={{ margin: '20px 0' }}>
              <button 
                onClick={isRecording ? finishAndSubmit : startRecording} 
                disabled={evaluating}
                style={{
                  background: isRecording ? '#FF6225' : '#FFC525',
                  color: isRecording ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: '50%',
                  width: '68px',
                  height: '68px',
                  fontSize: '1.9rem',
                  cursor: evaluating ? 'not-allowed' : 'pointer',
                  boxShadow: isRecording ? '0 0 0 6px rgba(255,98,37,0.25), 0 4px 14px rgba(0,0,0,0.18)' : '0 4px 14px rgba(0,0,0,0.12)',
                  transition: 'all 0.2s',
                  transform: isRecording ? 'scale(1.05)' : 'scale(1)',
                }}
                title={isRecording ? 'Click to submit now' : 'Click to speak'}
                type="button"
              >
                {evaluating ? '⏳' : (isRecording ? '⏹️' : '🎙️')}
              </button>

              {/* Active Soundwave & Countdown */}
              {isRecording && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '32px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#00B84D', fontWeight: 700, marginRight: '6px' }}>Listening:</span>
                    {[0.1, 0.4, 0.7, 0.3, 0.8, 0.5, 0.2, 0.6, 0.9, 0.3].map((delay, idx) => (
                      <span
                        key={idx}
                        className="green-soundwave-bar"
                        style={{
                          height: `${14 + (idx % 4) * 5}px`,
                          animation: `soundwavePulse 0.75s ease-in-out infinite alternate`,
                          animationDelay: `${delay}s`
                        }}
                      />
                    ))}
                  </div>

                  {silenceCountdown !== null && (
                    <div style={{
                      marginTop: 8,
                      fontSize: '0.84rem',
                      color: '#FF6225',
                      fontWeight: 700,
                      background: 'rgba(255,98,37,0.12)',
                      padding: '4px 14px',
                      borderRadius: 16,
                      display: 'inline-block',
                    }}>
                      ⏱️ Silence detected — scoring in {silenceCountdown}s (or click ⏹️ Submit)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status Feedback while listening or evaluating */}
            {feedback && !result && (
              <p style={{ fontWeight: 600, margin: '14px 0', fontSize: '0.95rem', color: '#4A5568' }}>
                {feedback}
              </p>
            )}

            {/* Real-time recognized voice bubble while speaking */}
            {isRecording && userSpeech && (
              <div style={{
                margin: '10px auto',
                padding: '8px 14px',
                backgroundColor: '#F1F5F9',
                borderRadius: '12px',
                fontSize: '0.9rem',
                color: '#1E293B',
                fontStyle: 'italic',
                maxWidth: '360px',
                borderLeft: '4px solid #FFC525'
              }}>
                Hearing: "{userSpeech}"
              </div>
            )}

            {evaluating && (
              <div style={{ color: '#D97706', fontWeight: 700, fontSize: '0.95rem', margin: '16px 0' }}>
                ⏳ Evaluating pronunciation accuracy and phonemes...
              </div>
            )}

            {/* ========================================================= */}
            {/* DEDICATED SCORE & CLINICAL OUTPUT CARD                    */}
            {/* ========================================================= */}
            {result && !evaluating && (
              <div style={{
                marginTop: '22px',
                padding: '18px 20px',
                borderRadius: '16px',
                backgroundColor: result.correct ? 'rgba(34, 197, 94, 0.09)' : 'rgba(239, 68, 68, 0.09)',
                border: `2px solid ${result.correct ? '#22c55e' : '#ef4444'}`,
                textAlign: 'center',
                animation: 'fadeIn 0.3s ease-in'
              }}>
                {/* Status Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.6rem' }}>{result.correct ? '🎉' : '🎯'}</span>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: result.correct ? '#15803d' : '#b91c1c' }}>
                    {result.correct ? 'Pronunciation Mastered!' : 'Needs Practice'}
                  </h3>
                </div>

                {/* Accuracy Score Pill */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '6px',
                  margin: '8px 0 12px 0',
                  padding: '6px 18px',
                  borderRadius: '24px',
                  backgroundColor: result.correct ? '#dcfce7' : '#fee2e2'
                }}>
                  <span style={{ fontSize: '1.9rem', fontWeight: 800, color: result.correct ? '#16a34a' : '#dc2626' }}>
                    {result.accuracyScore}%
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: result.correct ? '#15803d' : '#991b1b' }}>
                    Accuracy Score
                  </span>
                </div>

                {/* Target vs Heard Comparison Box */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  padding: '10px 14px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  margin: '10px 0'
                }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Target Word
                    </span>
                    <strong style={{ color: '#0F172A', fontSize: '1.05rem' }}>{result.target}</strong>
                  </div>
                  <div style={{ width: '1px', backgroundColor: '#E2E8F0' }} />
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      What We Heard
                    </span>
                    <strong style={{ color: result.correct ? '#16a34a' : '#dc2626', fontSize: '1.05rem' }}>
                      "{result.userSaid}"
                    </strong>
                  </div>
                </div>

                {/* Clinical Verdict */}
                <p style={{ margin: '10px 0 14px 0', fontSize: '0.88rem', color: '#475569', lineHeight: 1.4 }}>
                  💡 <strong>Clinical Observation:</strong> {result.verdict}
                </p>

                {/* Quick Retry & Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={playWordPronunciation}
                    type="button"
                    style={{
                      padding: '8px 14px',
                      background: '#FFC525',
                      color: '#000',
                      border: 'none',
                      borderRadius: '18px',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    🔊 Hear Model
                  </button>

                  <button
                    onClick={startRecording}
                    type="button"
                    style={{
                      padding: '8px 14px',
                      background: '#1E293B',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '18px',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    🎙️ Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Next Word Button */}
            <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button 
                onClick={fetchWord}
                style={{
                  padding: '10px 22px',
                  background: '#1E2022',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
                type="button"
              >
                Next Word ➡️
              </button>
            </div>

            {/* Streak Counter */}
            {streak > 0 && (
              <p style={{ marginTop: '15px', color: '#FF6225', fontWeight: 700 }}>
                🔥 Correct Streak: {streak}
              </p>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
