import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/translator.module.css';

export default function Translator() {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const spokenTextRef = useRef('');
  const hasSpokenRef = useRef(false);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      stopRecordingCleanly();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopRecordingCleanly = () => {
    isRecordingRef.current = false;
    setRecording(false);
    setSilenceCountdown(null);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
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

  const handleTranslateText = async (textToNormalize) => {
    const query = (textToNormalize || inputText || spokenTextRef.current).trim();
    if (!query) {
      alert('Please speak or type a sentence first!');
      return;
    }

    setLoading(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.post(`${backendUrl}/translator/normalize-text/`, {
        text: query
      });

      if (response.data) {
        setTranslatedText(response.data.normalized_text || query);
      }
    } catch (error) {
      console.error('Translation error:', error);
      // Fallback client-side stutter clean
      setTranslatedText(query.replace(/([a-zA-Z])-+/g, '$1'));
    } finally {
      setLoading(false);
    }
  };

  const finishAndSubmit = () => {
    const finalSpeech = (spokenTextRef.current || inputText).trim();
    stopRecordingCleanly();
    if (finalSpeech) {
      handleTranslateText(finalSpeech);
    }
  };

  const startSpeechRecognition = () => {
    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    stopRecordingCleanly();
    spokenTextRef.current = '';
    hasSpokenRef.current = false;
    setInputText('');
    setTranslatedText('');
    setRecording(true);
    isRecordingRef.current = true;

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
        setInputText(accumulated);

        // Reset silence timer: 3 seconds after speaking stops
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
      console.warn('[Translator SpeechRec Error]', event.error);
      if (event.error === 'no-speech') {
        if (!hasSpokenRef.current) {
          stopRecordingCleanly();
        } else {
          finishAndSubmit();
        }
      } else if (event.error !== 'aborted') {
        if (hasSpokenRef.current) {
          finishAndSubmit();
        } else {
          stopRecordingCleanly();
          alert('Microphone access was denied or audio capture failed. Please verify browser permissions.');
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
      console.error('Speech recognition start error:', e);
      stopRecordingCleanly();
    }
  };

  const speakTranslated = () => {
    if (!translatedText) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(translatedText);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Speech Disorder Translator — Speation</title>
        </Head>

        <Navbar />

        <div style={{ marginTop: '140px' }}>
          <h1 className={styles.title}>Speech Disorder Translator</h1>
          <p style={{ color: '#718096', maxWidth: '700px', margin: '0 auto 30px', fontSize: '1.05rem' }}>
            Transform dysarthric, stuttered, or hesitated speech into clear, grammatical, and fluent sentences.
          </p>
        </div>

        {/* Translation Box */}
        <div className={styles.translationBox}>
          {/* Input Section */}
          <div className={styles.inputSection}>
            <textarea
              className={styles.textInput}
              placeholder="Speak aloud or type disordered speech (e.g. 'I-I-I w-w-want go h-home')..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            
            <button
              className={styles.micButton}
              onClick={recording ? finishAndSubmit : startSpeechRecognition}
              style={{
                backgroundColor: recording ? '#FF6225' : '#FFC525',
                color: recording ? '#fff' : '#000',
                boxShadow: recording ? '0 0 0 4px rgba(255,98,37,0.25)' : 'none'
              }}
              title={recording ? 'Click to submit translation now' : 'Click to speak'}
              type="button"
            >
              {recording ? '⏹️' : '🎙️'}
            </button>

            {recording && (
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#00B84D', fontWeight: 700, marginRight: '4px' }}>
                    Listening:
                  </span>
                  {[0.1, 0.4, 0.6, 0.2, 0.8, 0.5, 0.3, 0.7].map((delay, idx) => (
                    <span
                      key={idx}
                      className="green-soundwave-bar"
                      style={{
                        height: `${12 + (idx % 3) * 5}px`,
                        animation: `soundwavePulse 0.75s ease-in-out infinite alternate`,
                        animationDelay: `${delay}s`
                      }}
                    />
                  ))}
                </div>

                {silenceCountdown !== null && (
                  <span style={{
                    fontSize: '0.78rem',
                    color: '#92400E',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 700
                  }}>
                    ⏱️ Auto-translating in {silenceCountdown}s...
                  </span>
                )}
              </div>
            )}
          </div>

          <div className={styles.divider}></div>

          {/* Output Section */}
          <div className={styles.outputSection}>
            <div className={styles.outputText}>
              {loading ? (
                <span style={{ color: '#FF6225', fontWeight: 600 }}>🧠 Normalizing speech with clinical AI...</span>
              ) : translatedText ? (
                <div>
                  <p style={{ color: '#1A202C', fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>
                    "{translatedText}"
                  </p>
                  <button
                    onClick={speakTranslated}
                    style={{
                      marginTop: '12px',
                      padding: '6px 14px',
                      background: '#FFC525',
                      border: 'none',
                      borderRadius: '15px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    type="button"
                  >
                    🔊 Listen to Fluent Output
                  </button>
                </div>
              ) : (
                <span style={{ color: '#A0AEC0' }}>
                  Normalized fluent output will appear here.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.buttonContainer}>
          <button 
            className={styles.translateButton} 
            onClick={() => handleTranslateText(inputText)}
            disabled={loading}
            type="button"
          >
            {loading ? 'Processing...' : '✨ Translate to Fluent Speech'}
          </button>
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
