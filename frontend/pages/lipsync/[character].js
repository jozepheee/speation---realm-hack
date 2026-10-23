import { useLocale } from "../../context/LocaleContext";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from '../../styles/lipsync.module.css';
export default function LipsyncVideo() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {
    character
  } = router.query;
  const [userText, setUserText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lipsyncVideo, setLipsyncVideo] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const videoPath = character ? `/lipsyncs/sync_${character}.mp4` : '';
  const characterTitle = character ? character.charAt(0).toUpperCase() + character.slice(1) : 'Character';
  useEffect(() => {
    if (character) {
      setLipsyncVideo(videoPath);
    }
  }, [character, videoPath]);
  const generateLipsync = async () => {
    if (!character || !userText.trim()) {
      alert('Please enter a message for your character to speak!');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
      const response = await axios.post(`${backendUrl}/lipsync/generate`, {
        character,
        text: userText
      });
      if (response.data && response.data.request_id) {
        // Play video
        setLipsyncVideo(videoPath);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play();
        }

        // Also trigger ElevenLabs audio
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(userText);
          utterance.pitch = character === 'pooh' ? 0.8 : character === 'barbie' ? 1.2 : 1.0;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err) {
      console.error('Error generating lipsync:', err);
      setError('Could not generate speech message. Playing default character video.');
    } finally {
      setIsLoading(false);
    }
  };
  return <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>{characterTitle} {t("Message \u2014 Speation")}</title>
        </Head>

        <Navbar />

        <div style={{
        marginTop: '140px'
      }}>
          <h2 className={styles.title}>{t("Message from")} {characterTitle}!</h2>
          <p style={{
          color: '#718096',
          margin: '10px 0 25px',
          fontSize: '1rem'
        }}>{t("Type a sentence you want to hear")}{characterTitle}{t("say, then watch and listen!")}</p>
        </div>

        {/* Video Player */}
        <div style={{
        maxWidth: '600px',
        margin: '0 auto 30px',
        borderRadius: '15px',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
      }}>
          {lipsyncVideo && <video ref={videoRef} key={lipsyncVideo} controls autoPlay loop style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          backgroundColor: '#000'
        }}>
              <source src={lipsyncVideo} type="video/mp4" />{t("Your browser does not support the video tag.")}</video>}
        </div>

        {/* Input Section */}
        <div style={{
        maxWidth: '600px',
        margin: '0 auto 40px',
        padding: '0 20px'
      }}>
          <textarea rows="3" value={userText} onChange={e => setUserText(e.target.value)} placeholder={t("Type a motivational message for {value0} to speak...", {
          value0: characterTitle
        })} style={{
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: '2px solid #FFC525',
          fontSize: '1rem',
          outline: 'none',
          boxSizing: 'border-box'
        }} />

          <div style={{
          marginTop: '15px',
          display: 'flex',
          justifyContent: 'center',
          gap: '15px'
        }}>
            <button onClick={generateLipsync} disabled={isLoading} style={{
            padding: '12px 28px',
            background: '#FF6225',
            color: '#fff',
            border: 'none',
            borderRadius: '25px',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer'
          }} type="button">
              {isLoading ? t("Generating Audio...") : t("\uD83D\uDDE3\uFE0F Make {value0} Speak", {
              value0: characterTitle
            })}
            </button>

            <Link href="/lipsync" style={{
            padding: '12px 24px',
            background: '#E2E8F0',
            color: '#1A202C',
            textDecoration: 'none',
            borderRadius: '25px',
            fontWeight: 600,
            fontSize: '1rem',
            display: 'inline-block'
          }}>{t("\u2190 Choose Another Character")}</Link>
          </div>

          {error && <p style={{
          color: '#E53E3E',
          marginTop: '12px',
          fontWeight: 600
        }}>
              {t(error)}
            </p>}
        </div>

        <Footer />
      </div>
    </ProtectedRoute>;
}
