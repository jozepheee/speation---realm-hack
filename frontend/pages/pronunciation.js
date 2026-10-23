import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/pronunciation.module.css';

const VOCABULARY_LIST = [
  { word: 'Articulation', phonetic: '/ɑːrˌtɪkjʊˈleɪʃən/', hint: 'Notice the crisp tongue contact on "t" and "l".' },
  { word: 'Fluency', phonetic: '/ˈfluːənsi/', hint: 'Keep the transition from "f" to "l" smooth and continuous.' },
  { word: 'Resilience', phonetic: '/rɪˈzɪljəns/', hint: 'Softly prolong the "z" sound before transitioning to the vowel.' },
  { word: 'Synchrony', phonetic: '/ˈsɪŋkrəni/', hint: 'Maintain steady nasal resonance on the "ng" phoneme.' },
  { word: 'Equilibrium', phonetic: '/ˌiːkwɪˈlɪbriəm/', hint: 'Pace each syllable evenly across the entire word.' },
  { word: 'Diaphragm', phonetic: '/ˈdaɪəfræm/', hint: 'Engage abdominal support for the open vowel onset.' },
  { word: 'Modulation', phonetic: '/ˌmɒdjʊˈleɪʃən/', hint: 'Allow natural pitch variance as you reach the stressed syllable.' }
];

export default function Pronunciation() {
  const [index, setIndex] = useState(0);
  const [userSpeech, setUserSpeech] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [containerStyle, setContainerStyle] = useState(styles.fixedContainer);
  const [resultState, setResultState] = useState(null); // 'correct' | 'incorrect' | null
  const [streak, setStreak] = useState(0);

  const recognitionRef = useRef(null);
  const currentItem = VOCABULARY_LIST[index];

  // Play audio pronunciation of the current word
  const playWordPronunciation = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentItem.word);
      utterance.rate = 0.85; // Slightly slower for therapeutic clarity
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const nextWord = () => {
    setIndex((prev) => (prev + 1) % VOCABULARY_LIST.length);
    setContainerStyle(styles.fixedContainer);
    setUserSpeech('');
    setResultState(null);
  };

  // Start voice recording and speech recognition
  const startRecording = () => {
    setContainerStyle(styles.fixedContainer);
    setUserSpeech('');
    setResultState(null);

    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsRecording(true);

      recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript.trim();
        setUserSpeech(spoken);
        checkPronunciation(spoken);
      };

      recognition.onspeechend = () => {
        setIsRecording(false);
        recognition.stop();
      };

      recognition.onerror = (err) => {
        console.warn('Speech recognition warning:', err);
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } else {
      alert('Speech Recognition is not supported by your current browser. Please open in Google Chrome or Microsoft Edge with microphone permissions.');
    }
  };

  // Evaluate accuracy
  const checkPronunciation = (spokenWord) => {
    const cleanSpoken = spokenWord.toLowerCase().replace(/[^a-z]/g, '');
    const cleanTarget = currentItem.word.toLowerCase().replace(/[^a-z]/g, '');

    const isMatch = cleanSpoken === cleanTarget || cleanSpoken.includes(cleanTarget) || cleanTarget.includes(cleanSpoken);

    if (isMatch) {
      setContainerStyle(styles.correctContainer);
      setResultState('correct');
      setStreak((s) => s + 1);
    } else {
      setContainerStyle(styles.incorrectContainer);
      setResultState('incorrect');
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
      <Head>
        <title>Vocabulary & Pronunciation Game — Speation</title>
      </Head>

      <Navbar />

      <div className={styles.yellowCircle}></div>
      <div className={styles.orangeCircle}></div>
      <div className={styles.whiteCover1}></div>

      <main className={styles.mainContent}>
        <div className={containerStyle}>
          <span className={styles.badge}>Module 02 • Phoneme Precision</span>
          <h1 className={styles.title}>Vocabulary Enhancement</h1>
          <p className={styles.subtitle}>
            Listen to the target pronunciation, then speak clearly into your microphone to verify phoneme accuracy.
          </p>

          <div className={styles.gameBox}>
            {/* Word & Speaker Section */}
            <div className={styles.wordContainer}>
              <button className={styles.wordButton} type="button">
                {currentItem.word}
              </button>
              <button
                className={styles.playButton}
                onClick={playWordPronunciation}
                title="Hear target pronunciation"
                type="button"
              >
                <Image src="/icons/speaker.png" alt="Speaker" width={28} height={28} />
              </button>
            </div>

            <div className={styles.phoneticTag}>{currentItem.phonetic}</div>

            {/* Mic Record Button */}
            <button
              className={styles.recordButton}
              onClick={startRecording}
              disabled={isRecording}
              title={isRecording ? 'Listening...' : 'Click and pronounce'}
              type="button"
            >
              <Image
                src="/icons/mic.png"
                alt="Mic"
                width={38}
                height={38}
                className={isRecording ? styles.micBlink : ''}
              />
            </button>

            {/* Live Status Message */}
            <div className={styles.statusMessage}>
              {isRecording && <span style={{ color: '#FF6225' }}>Listening... Say "{currentItem.word}" now!</span>}
              {!isRecording && resultState === 'correct' && (
                <span className={styles.correctText}>
                  ✨ Perfect Pronunciation! Streak: {streak} 🔥
                </span>
              )}
              {!isRecording && resultState === 'incorrect' && (
                <span className={styles.incorrectText}>
                  Heard "{userSpeech || 'unclear'}". Give it another try!
                </span>
              )}
              {!isRecording && !resultState && (
                <span style={{ color: '#718096' }}>Click mic and say the word above</span>
              )}
            </div>

            {/* Hint / Clinical Guidance */}
            <div className={styles.feedbackDetail}>
              <strong>Phonetic Tip: </strong>
              {currentItem.hint}
            </div>

            {/* Next Word Button */}
            <button className={styles.nextWordBtn} onClick={nextWord} type="button">
              Next Word ({index + 1}/{VOCABULARY_LIST.length}) →
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  </ProtectedRoute>
);
}
