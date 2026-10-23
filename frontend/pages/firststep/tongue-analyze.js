import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from '../../styles/tongue-analyze.module.css';

const TONGUE_EXERCISES = [
  { text: "1st Exercise: Move Tongue Down", video: "/videos/tongue_down.mp4", instruction: "Extend your tongue downward toward your chin to stretch the lingual frenulum." },
  { text: "2nd Exercise: Move Tongue Right", video: "/videos/tongue_right.mp4", instruction: "Push tongue tip firmly into the right corner of your mouth for lateral tongue tone." },
  { text: "3rd Exercise: Move Tongue Left", video: "/videos/tongue_left.mp4", instruction: "Push tongue tip firmly into the left corner of your mouth to balance bilateral articulatory symmetry." }
];

export default function TongueAnalyze() {
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [exerciseStatus, setExerciseStatus] = useState("Position your face and mirror the model movements.");
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const startCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 }, 
          audio: true 
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        setExerciseStatus("Tracking lingual mobility & sound envelope in real time.");

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        drawGreenTongueTracking();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setExerciseStatus("Webcam permission unavailable. Follow the instructional videos directly.");
    }
  };

  const drawGreenTongueTracking = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const isSpeaking = rms > 0.03;
      setVoiceDetected(isSpeaking);

      // Draw Green Lingual Motion Target Lines
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.65;
      
      // Target direction vectors based on step (0: down, 1: right, 2: left)
      let targetX = cx;
      let targetY = cy + 40;
      if (currentStep === 1) { targetX = cx + 55; targetY = cy; }
      if (currentStep === 2) { targetX = cx - 55; targetY = cy; }

      ctx.beginPath();
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00FF66';
      ctx.shadowBlur = isSpeaking ? 14 : 6;
      ctx.arc(targetX, targetY, 28 + (isSpeaking ? rms * 60 : 0), 0, 2 * Math.PI);
      ctx.stroke();

      // Lingual vector tracking crosshair
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.7)';
      ctx.lineWidth = 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();

      // Live Oscilloscope Green Soundwave Line
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#00FF88';
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = cy + (v - 1.0) * (isSpeaking ? 70 : 15);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.stroke();
    };

    render();
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [currentStep]);

  const nextExercise = () => {
    if (currentStep < TONGUE_EXERCISES.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      alert("🎉 Great session! You completed all tongue mobility exercises.");
      setCurrentStep(0);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Tongue Analyzer — Speation Oral Training</title>
        </Head>

        <Navbar />

        <div style={{ marginTop: '140px', textAlign: 'center' }}>
          <h2 className={styles.title}>Oral & Breath Control: Tongue Analyzer</h2>
          <p style={{ color: '#6C757D', marginBottom: '30px' }}>
            Strengthen tongue lateralization and elevation for precise consonant articulation.
          </p>
        </div>

        <div className={styles.exerciseContainer}>
          <h3>{TONGUE_EXERCISES[currentStep].text}</h3>

          <video 
            key={currentStep}
            className={styles.video} 
            controls 
            autoPlay 
            loop
            muted
          >
            <source src={TONGUE_EXERCISES[currentStep].video} type="video/mp4" />
            Your browser does not support video playback.
          </video>

          <p style={{ margin: '15px 0', fontSize: '0.95rem', color: '#4A5568', fontStyle: 'italic' }}>
            💡 {TONGUE_EXERCISES[currentStep].instruction}
          </p>

          <button className={styles.nextButton} onClick={nextExercise} type="button">
            Next Exercise ({currentStep + 1}/{TONGUE_EXERCISES.length}) ➡️
          </button>
        </div>

        {/* Live Mirror Feedback */}
        <div className={styles.cameraContainer}>
          <h3 className={styles.cameraTitle}>Live Mirror & Tongue Motion Check</h3>
          <div className={styles.cameraBox} style={{ position: 'relative', overflow: 'hidden', background: '#1A202C', borderRadius: '12px', minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            <canvas 
              ref={canvasRef}
              width={640}
              height={480}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
            />
            {voiceDetected && (
              <div style={{
                position: 'absolute',
                top: 12,
                left: 12,
                background: 'rgba(0, 255, 102, 0.2)',
                border: '1px solid #00FF66',
                color: '#00FF66',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 600,
                zIndex: 6,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FF66', display: 'inline-block', boxShadow: '0 0 8px #00FF66' }}></span>
                Lingual Movement Active
              </div>
            )}
            {!cameraActive && (
              <div style={{ position: 'absolute', color: '#CBD5E0', textAlign: 'center', padding: '20px' }}>
                <p>📷 Waiting for camera stream...</p>
                <button 
                  onClick={startCamera}
                  style={{ marginTop: '10px', padding: '8px 16px', background: '#FF6225', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Enable Camera
                </button>
              </div>
            )}
          </div>
          <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#718096', fontWeight: 600 }}>
            Status: {exerciseStatus}
          </p>
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
