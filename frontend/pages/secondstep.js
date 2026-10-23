import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/secondstep.module.css';

export default function SecondStep() {
  const [imageUrl, setImageUrl] = useState('');
  const [scenarioPrompt, setScenarioPrompt] = useState(''); // Kept internal for backend scoring
  const [hint, setHint] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [score, setScore] = useState(null);
  const [notes, setNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const spokenTextRef = useRef('');
  const hasSpokenRef = useRef(false);

  useEffect(() => {
    return () => {
      stopRecordingCleanly();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopRecordingCleanly = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore stop error
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const fetchImage = async () => {
    stopRecordingCleanly();
    try {
      setLoading(true);
      setText('');
      setInterimText('');
      setCorrectedText('');
      setScore(null);
      setNotes('');
      setShowHint(false);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.get(`${backendUrl}/secondstep/generate-image/`);
      setImageUrl(response.data.image_url);
      setScenarioPrompt(response.data.scenario_prompt);
      setHint(response.data.hint || 'Observe the main subjects, setting, and details in the scene.');
    } catch (error) {
      console.error('Error fetching scenario image:', error);
      alert('Unable to load scenario image. Please check your backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const finishAndSubmit = () => {
    const speechFinal = (spokenTextRef.current || interimText || text).trim();
    stopRecordingCleanly();

    if (speechFinal) {
      setText(speechFinal);
      setInterimText('');
      sendSpeechToBackend(speechFinal);
    } else {
      setInterimText('');
    }
  };

  const startRecording = () => {
    if (!scenarioPrompt) {
      alert('Please generate a scenario image first!');
      return;
    }

    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    stopRecordingCleanly();
    spokenTextRef.current = '';
    hasSpokenRef.current = false;
    setText('');
    setInterimText('');
    setCorrectedText('');
    setScore(null);
    setNotes('');
    setIsRecording(true);

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let accumulated = '';
      for (let i = 0; i < event.results.length; i++) {
        accumulated += event.results[i][0].transcript + ' ';
      }
      accumulated = accumulated.trim();

      if (accumulated) {
        hasSpokenRef.current = true;
        spokenTextRef.current = accumulated;
        setInterimText(accumulated);

        // Reset 3-second silence auto-submit timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        let countdown = 3;
        setSilenceCountdown(countdown);

        countdownIntervalRef.current = setInterval(() => {
          countdown -= 1;
          if (countdown > 0) {
            setSilenceCountdown(countdown);
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
      if (event.error === 'no-speech') {
        if (!hasSpokenRef.current) {
          stopRecordingCleanly();
        } else {
          finishAndSubmit();
        }
      } else if (event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
        if (hasSpokenRef.current) {
          finishAndSubmit();
        } else {
          stopRecordingCleanly();
        }
      }
    };

    recognition.onend = () => {
      if (hasSpokenRef.current) {
        finishAndSubmit();
      } else {
        setIsRecording(false);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Recognition start error:', e);
      setIsRecording(false);
    }
  };

  const speakText = (textToSpeak) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const sendSpeechToBackend = async (speechText) => {
    try {
      setEvaluating(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.post(`${backendUrl}/secondstep/process-text/`, {
        text: speechText,
        scenario_prompt: scenarioPrompt
      });

      if (response.data) {
        setCorrectedText(response.data.corrected || 'No correction needed.');
        setScore(response.data.score !== undefined ? response.data.score : 85);
        setNotes(response.data.notes || 'Well phrased description.');
        speakText(response.data.corrected);
      }
    } catch (error) {
      console.error('Error processing speech narrative:', error);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Receptive & Expressive Language — Speation</title>
        </Head>

        <Navbar />

        <div className={styles.fixedContainer}>
          <h2 className={styles.title}>Receptive & Expressive Language Development</h2>
          <p style={{ color: '#718096', fontSize: '0.95rem', marginBottom: '20px' }}>
            Generate a scenario scene, observe the visual details, and describe what you see aloud in your own words.
          </p>

          <div className={styles.buttonContainer}>
            <button className={styles.button} onClick={fetchImage} disabled={loading || isRecording} type="button">
              {loading ? 'Generating Scene...' : '📸 Generate Scenario Image'}
            </button>

            {isRecording ? (
              <button 
                className={styles.button} 
                onClick={finishAndSubmit}
                type="button"
                style={{ backgroundColor: '#FF6225', color: '#fff' }}
              >
                ⏹️ Submit Spoken Description
              </button>
            ) : (
              <button 
                className={styles.button} 
                onClick={startRecording} 
                disabled={!scenarioPrompt || evaluating} 
                type="button"
                style={{ backgroundColor: '#FFC525', color: '#000' }}
              >
                🎙️ Describe Scenario
              </button>
            )}
          </div>

          {/* Voice Activity & Silence Detection Countdown */}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '12px 0', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '28px' }}>
                <span style={{ fontSize: '0.85rem', color: '#00B84D', fontWeight: 700, marginRight: '8px' }}>
                  Microphone Active:
                </span>
                {[0.15, 0.45, 0.75, 0.35, 0.85, 0.55, 0.25, 0.65, 0.95].map((delay, idx) => (
                  <span
                    key={idx}
                    className="green-soundwave-bar"
                    style={{
                      height: `${14 + (idx % 4) * 6}px`,
                      animation: `soundwavePulse 0.75s ease-in-out infinite alternate`,
                      animationDelay: `${delay}s`
                    }}
                  />
                ))}
              </div>

              {silenceCountdown !== null && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  color: '#92400E',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  animation: 'fadeIn 0.3s ease-in'
                }}>
                  <span>⏱️ Silence detected — submitting in {silenceCountdown}s...</span>
                </div>
              )}
            </div>
          )}

          {/* Real-time speech transcript preview while speaking */}
          {isRecording && interimText && (
            <div style={{
              margin: '10px auto',
              maxWidth: '520px',
              padding: '10px 16px',
              backgroundColor: '#F1F5F9',
              borderRadius: '10px',
              fontSize: '0.92rem',
              color: '#1E293B',
              fontStyle: 'italic',
              borderLeft: '4px solid #FFC525'
            }}>
              "{interimText}"
            </div>
          )}

          {evaluating && (
            <div style={{ color: '#D97706', fontWeight: 600, fontSize: '0.95rem', margin: '15px 0' }}>
              ⏳ Evaluating your spoken description against clinical SLP criteria...
            </div>
          )}

          {/* Image & Clinical Observation Prompts (NO SPOILERS) */}
          {imageUrl && (
            <div className={styles.imageContainer} style={{ flexDirection: 'column', alignItems: 'center', gap: '14px', marginTop: '15px' }}>
              <img 
                src={imageUrl} 
                alt="Clinical Language Scenario" 
                className={styles.image} 
                style={{ width: '520px', maxHeight: '340px', objectFit: 'cover', borderRadius: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }} 
              />
              
              {/* Cognitive observation cues instead of plaintext spoilers */}
              <div style={{
                marginTop: '6px',
                padding: '14px 20px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                maxWidth: '520px',
                width: '100%',
                textAlign: 'left',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1E293B' }}>
                    👁️ What to observe:
                  </span>
                  {hint && (
                    <button
                      type="button"
                      onClick={() => setShowHint(!showHint)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#D97706',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      💡 {showHint ? 'Hide Hint' : 'Need a Hint?'}
                    </button>
                  )}
                </div>

                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.86rem', color: '#475569', lineHeight: 1.6 }}>
                  <li>Where is this scene taking place?</li>
                  <li>What items, subjects, or people do you notice?</li>
                  <li>What colors, lighting, or actions stand out?</li>
                </ul>

                {showHint && hint && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    color: '#92400E',
                    lineHeight: 1.4
                  }}>
                    <strong>Clinical Hint:</strong> {hint}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results: Spoken text, SLP score, clinical notes, and corrected speech */}
          {text && !evaluating && (
            <div className={styles.resultContainer} style={{ marginTop: '25px', textAlign: 'left', maxWidth: '560px', margin: '25px auto 0 auto' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#1E293B' }}>Clinical Language Evaluation</h3>
              
              <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Your Spoken Description
                </span>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.96rem', color: '#0F172A', fontWeight: 500 }}>
                  "{text}"
                </p>
              </div>
              
              {correctedText && (
                <div style={{ padding: '16px', backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#0369A1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ✨ Fluent Model Expression
                    </span>
                    {score !== null && (
                      <span style={{
                        backgroundColor: '#FF6225',
                        color: '#fff',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.88rem'
                      }}>
                        Score: {score} / 100
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '4px 0 10px 0', fontSize: '0.98rem', color: '#0C4A6E', fontWeight: 600 }}>
                    "{correctedText}"
                  </p>

                  {notes && (
                    <p style={{ color: '#475569', fontSize: '0.88rem', margin: '8px 0 14px 0', lineHeight: 1.5 }}>
                      💡 <strong>Clinical Observation:</strong> {notes}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button 
                      onClick={() => speakText(correctedText)}
                      style={{
                        padding: '8px 16px',
                        background: '#FFC525',
                        border: 'none',
                        borderRadius: '20px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🔊 Listen to Model
                    </button>
                    {isSpeaking && (
                      <button 
                        onClick={stopSpeaking}
                        style={{
                          padding: '8px 16px',
                          background: '#E2E8F0',
                          border: 'none',
                          borderRadius: '20px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.88rem'
                        }}
                      >
                        ⏹️ Stop Audio
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
