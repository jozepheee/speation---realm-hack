import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/fourthstep.module.css';

const AvatarCanvas = dynamic(() => import('../components/AvatarCanvas'), { ssr: false });

export default function FourthStep() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/avatar');
  }, [router]);
  const [selectedVoice, setSelectedVoice] = useState('female-child');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: "Hello! I'm your communication practice buddy. You can speak or type to me anytime. What would you like to talk about today?",
      audio: null
    }
  ]);
  const [currentAudio, setCurrentAudio] = useState(null);
  const animFrameRef = useRef(null);

  const startRecording = () => {
    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsRecording(true);
    recognition.start();

    recognition.onresult = (event) => {
      const userSpeech = event.results[0][0].transcript;
      addMessage('user', userSpeech);
      sendSpeechToBackend(userSpeech);
    };

    recognition.onspeechend = () => {
      setIsRecording(false);
      recognition.stop();
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };
  };

  const stopSpeaking = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setIsSpeaking(false);
      setAudioLevel(0);
    }
  };

  const playAudio = (url) => {
    if (!url) return;
    stopSpeaking();

    const audio = new Audio(url);
    setCurrentAudio(audio);

    audio.play()
      .then(() => {
        setIsSpeaking(true);
        // Animate audio level while playing
        const updateLevel = () => {
          if (!audio.paused && !audio.ended) {
            setAudioLevel(0.45 + Math.random() * 0.4);
            animFrameRef.current = requestAnimationFrame(updateLevel);
          } else {
            setAudioLevel(0);
          }
        };
        updateLevel();
      })
      .catch((error) => console.error('Error playing audio:', error));

    audio.onended = () => {
      setIsSpeaking(false);
      setAudioLevel(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  };

  const sendSpeechToBackend = async (speechText) => {
    try {
      const [gender, age] = selectedVoice.split('-');
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

      const response = await axios.post(`${backendUrl}/fourthstep/process-voice/`, {
        text: speechText,
        gender: gender,
        age: age
      });

      if (response.data) {
        const aiResponse = response.data.reply;
        const audioUrl = response.data.audio_url 
          ? (response.data.audio_url.startsWith('http') ? response.data.audio_url : `${backendUrl}${response.data.audio_url}`)
          : null;

        addMessage('ai', aiResponse, audioUrl);

        if (audioUrl) {
          playAudio(audioUrl);
        }
      }
    } catch (error) {
      console.error('Error processing speech conversation:', error);
      addMessage('ai', "I heard you! Let's keep practicing together. What's on your mind?");
    }
  };

  const addMessage = (sender, text, audio = null) => {
    setMessages((prevMessages) => [
      ...prevMessages, 
      { sender, text, audio }
    ]);
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = inputText.trim();
    setInputText('');
    addMessage('user', msg);
    sendSpeechToBackend(msg);
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Contextual Communication Skills — Speation</title>
        </Head>

        <Navbar />

        {/* Page Title */}
        <h2 className={styles.title}>Contextual Communication Skills</h2>
        <p style={{ color: '#718096', fontSize: '1rem', marginTop: '10px' }}>
          Engage in natural back-and-forth dialogue with your AI communication partner.
        </p>

        {/* Chat Box */}
        <div className={styles.chatBox}>
          {/* Voice Selection */}
          <div className={styles.voiceSelection} style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <label htmlFor="voiceSelect">Select AI Partner Voice: </label>
            <select 
              id="voiceSelect"
              className={styles.dropdown} 
              value={selectedVoice} 
              onChange={(e) => setSelectedVoice(e.target.value)}
            >
              <option value="female-child">Female Child</option>
              <option value="male-child">Male Child</option>
              <option value="female-adult">Female Adult</option>
              <option value="male-adult">Male Adult</option>
            </select>
          </div>

          {/* 3D Human Avatar Communication Partner */}
          <div style={{
            width: '100%',
            maxWidth: '480px',
            height: '380px',
            margin: '0 auto 24px',
            borderRadius: '24px',
            overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 30%, #FFF8F0 0%, #FFFFFF 100%)',
            boxShadow: '0 8px 30px rgba(255, 98, 37, 0.12)',
            border: '1px solid rgba(255, 197, 37, 0.4)',
            position: 'relative'
          }}>
            <AvatarCanvas 
              state={isSpeaking ? 'speaking' : isRecording ? 'listening' : 'idle'} 
              audioLevel={audioLevel} 
              gender={selectedVoice.startsWith('male') ? 'male' : 'female'} 
            />
          </div>

          {/* Chat Messages */}
          <div className={styles.chatContainer} style={{ maxHeight: '380px', overflowY: 'auto', padding: '10px' }}>
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`${styles.message} ${msg.sender === 'ai' ? styles.ai : styles.user}`}
                style={{ textAlign: msg.sender === 'ai' ? 'left' : 'right' }}
              >
                <p style={{ margin: 0, fontWeight: 500, color: '#1A202C' }}>{msg.text}</p>
                {msg.audio && (
                  <div className={styles.audioControls} style={{ marginTop: '8px' }}>
                    <button 
                      className={styles.audioButton} 
                      onClick={() => playAudio(msg.audio)} 
                      title="Replay Voice"
                      type="button"
                    >
                      <Image src="/icons/play.png" alt="Play" width={24} height={24} />
                    </button>
                    {isSpeaking && (
                      <button 
                        className={styles.stopButton} 
                        onClick={stopSpeaking} 
                        title="Stop Voice"
                        type="button"
                      >
                        <Image src="/icons/stop.png" alt="Stop" width={24} height={24} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Text Input Row */}
          <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your response here..."
              style={{
                flex: 1,
                padding: '12px 18px',
                borderRadius: '25px',
                border: '1px solid rgba(0,0,0,0.2)',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
            <button 
              type="submit"
              style={{
                padding: '12px 24px',
                backgroundColor: '#1E2022',
                color: '#fff',
                border: 'none',
                borderRadius: '25px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Send
            </button>
          </form>

          {/* Mic Button */}
          <div className={styles.micContainer} style={{ marginTop: '20px', flexDirection: 'column', alignItems: 'center' }}>
            <button 
              className={styles.micButton} 
              onClick={startRecording} 
              disabled={isRecording}
              style={{ transform: isRecording ? 'scale(1.15)' : 'scale(1)' }}
              title="Click to speak"
              type="button"
            >
              <Image 
                src="/icons/mic.png" 
                alt="Mic" 
                width={56} 
                height={56} 
              />
            </button>
            <span style={{ fontSize: '0.9rem', marginTop: '8px', color: '#4A5568', fontWeight: 600 }}>
              {isRecording ? '🎙️ Listening... Speak naturally.' : 'Click mic to speak aloud'}
            </span>
            {isRecording && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '32px', marginTop: '10px' }}>
                <span style={{ fontSize: '0.82rem', color: '#00B84D', fontWeight: 700, marginRight: '6px' }}>Speech Signal Active:</span>
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
            )}
          </div>
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
