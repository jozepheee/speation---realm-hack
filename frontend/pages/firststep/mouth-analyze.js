import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from '../../styles/mouth-analyze.module.css';

const EXERCISES = [
  { text: "1st Exercise: Open Your Mouth Wide", video: "/videos/mouth_wide.mp4", instruction: "Hold mouth wide open for 3 seconds to stretch masseter muscles." },
  { text: "2nd Exercise: Say 'oooo' (Lip Rounding)", video: "/videos/say_o.mp4", instruction: "Pucker your lips firmly into an 'O' shape to strengthen orbicularis oris." },
  { text: "3rd Exercise: Say 'eeeee' (Smile Extension)", video: "/videos/say_e.mp4", instruction: "Retract both lip corners outward into a broad grin to build lateral motor control." }
];

// MediaPipe Lip landmark indices from Fluention
const UPPERLIP_LANDMARKS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78, 62];
const LOWERLIP_LANDMARKS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 402, 317, 14, 87, 178, 88, 95, 78, 62, 76];

export default function MouthAnalyze() {
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [exerciseStatus, setExerciseStatus] = useState("Position your face in the mirror to begin.");
  const [reps, setReps] = useState(0);
  const [sets, setSets] = useState(1);
  const [holdProgress, setHoldProgress] = useState(0);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraHelperRef = useRef(null);
  
  const holdStartRef = useRef(0);
  const repsRef = useRef(0);
  const setsRef = useRef(1);
  const currentStepRef = useRef(0);

  useEffect(() => {
    repsRef.current = reps;
    setsRef.current = sets;
    currentStepRef.current = currentStep;
  }, [reps, sets, currentStep]);

  // Load MediaPipe Face Mesh dynamically
  useEffect(() => {
    let scriptFaceMesh = document.getElementById('mediapipe-facemesh-script');
    let scriptCamera = document.getElementById('mediapipe-camera-script');

    const initMediaPipe = () => {
      if (window.FaceMesh && !faceMeshRef.current) {
        try {
          const fm = new window.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });
          fm.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });
          fm.onResults(onFaceMeshResults);
          faceMeshRef.current = fm;
          console.log("MediaPipe FaceMesh loaded successfully");
        } catch (e) {
          console.warn("FaceMesh init fallback:", e);
        }
      }
    };

    if (!scriptCamera) {
      scriptCamera = document.createElement('script');
      scriptCamera.id = 'mediapipe-camera-script';
      scriptCamera.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
      scriptCamera.crossOrigin = 'anonymous';
      scriptCamera.onload = () => {
        if (window.FaceMesh) initMediaPipe();
      };
      document.body.appendChild(scriptCamera);
    }

    if (!scriptFaceMesh) {
      scriptFaceMesh = document.createElement('script');
      scriptFaceMesh.id = 'mediapipe-facemesh-script';
      scriptFaceMesh.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
      scriptFaceMesh.crossOrigin = 'anonymous';
      scriptFaceMesh.onload = () => {
        initMediaPipe();
      };
      document.body.appendChild(scriptFaceMesh);
    } else if (window.FaceMesh) {
      initMediaPipe();
    }
  }, []);

  const speakCount = (text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      window.speechSynthesis.speak(utter);
    }
  };

  const onFaceMeshResults = (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Top HUD: "Sets: 1/3, Reps: 0/3" (exactly like authentic Fluention)
    ctx.font = "bold 24px 'Livvic', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 8;
    ctx.fillText(`Sets: ${setsRef.current}/3,  Reps: ${repsRef.current}/3`, width / 2 - 120, 48);
    ctx.shadowBlur = 0;

    let isHoldingGoal = false;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Draw Green Upper Lip Connected Lines
      ctx.beginPath();
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00FF00';
      ctx.shadowBlur = 6;

      for (let i = 0; i < UPPERLIP_LANDMARKS.length - 1; i++) {
        const pt1 = landmarks[UPPERLIP_LANDMARKS[i]];
        const pt2 = landmarks[UPPERLIP_LANDMARKS[i + 1]];
        // Mirror X coordinate to align with mirrored camera feed
        const x1 = (1 - pt1.x) * width;
        const y1 = pt1.y * height;
        const x2 = (1 - pt2.x) * width;
        const y2 = pt2.y * height;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // Draw Green Lower Lip Connected Lines
      ctx.beginPath();
      for (let i = 0; i < LOWERLIP_LANDMARKS.length - 1; i++) {
        const pt1 = landmarks[LOWERLIP_LANDMARKS[i]];
        const pt2 = landmarks[LOWERLIP_LANDMARKS[i + 1]];
        const x1 = (1 - pt1.x) * width;
        const y1 = pt1.y * height;
        const x2 = (1 - pt2.x) * width;
        const y2 = pt2.y * height;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // Draw Green Dots at every Lip Landmark Vertex
      ctx.fillStyle = '#00FF00';
      for (const idx of [...UPPERLIP_LANDMARKS, ...LOWERLIP_LANDMARKS]) {
        const pt = landmarks[idx];
        const x = (1 - pt.x) * width;
        const y = pt.y * height;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Compute lip aspect ratio
      const topLip = landmarks[13];
      const bottomLip = landmarks[14];
      const leftLip = landmarks[61];
      const rightLip = landmarks[291];

      const lipHeight = Math.hypot((topLip.x - bottomLip.x) * width, (topLip.y - bottomLip.y) * height);
      const lipWidth = Math.hypot((leftLip.x - rightLip.x) * width, (leftLip.y - rightLip.y) * height);
      const lipRatio = lipHeight / (lipWidth || 1);

      const step = currentStepRef.current;
      const isMouthOpen = lipRatio > 0.22;
      const isOoooo = lipRatio > 0.23 && lipRatio < 0.35;
      const isEeeee = lipRatio > 0.16 && lipRatio < 0.24;

      if ((step === 0 && isMouthOpen) || (step === 1 && isOoooo) || (step === 2 && isEeeee)) {
        isHoldingGoal = true;
      }
    }

    // Handle Rep / Set progression
    const now = Date.now();
    if (isHoldingGoal) {
      if (holdStartRef.current === 0) {
        holdStartRef.current = now;
      }
      const elapsed = (now - holdStartRef.current) / 1000;
      const progress = Math.min(elapsed / 2.0, 1.0);
      setHoldProgress(progress);

      // Render Green Progress Bar
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(width / 2 - 120, height - 70, 240, 16);
      ctx.fillStyle = "#00FF66";
      ctx.fillRect(width / 2 - 120, height - 70, 240 * progress, 16);
      ctx.font = "bold 14px 'Livvic', sans-serif";
      ctx.fillStyle = "#00FF66";
      ctx.fillText("Holding position: 2.0s...", width / 2 - 70, height - 80);

      if (elapsed >= 2.0) {
        const nextR = repsRef.current + 1;
        holdStartRef.current = 0;
        setHoldProgress(0);

        if (nextR >= 3) {
          speakCount("Great job! Moving to next exercise.");
          setReps(0);
          const nextS = currentStepRef.current + 1;
          if (nextS < EXERCISES.length) {
            setCurrentStep(nextS);
          } else {
            setCurrentStep(0);
            setSets((prev) => (prev >= 3 ? 1 : prev + 1));
          }
        } else {
          speakCount(`${nextR}`);
          setReps(nextR);
        }
      }
    } else {
      holdStartRef.current = 0;
      setHoldProgress(0);
    }
  };

  // Start Camera Stream
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
        setExerciseStatus("MediaPipe FaceMesh active. Green lines track your lip movements.");

        // Real-time loop
        let isProcessing = false;
        const processLoop = async () => {
          if (videoRef.current && videoRef.current.readyState >= 2 && faceMeshRef.current && !isProcessing) {
            isProcessing = true;
            try {
              await faceMeshRef.current.send({ image: videoRef.current });
            } catch (err) {
              // ignore transient frame drop
            }
            isProcessing = false;
          }
          animFrameRef.current = requestAnimationFrame(processLoop);
        };
        animFrameRef.current = requestAnimationFrame(processLoop);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setExerciseStatus("Camera permission needed for live green line tracking. You can still mirror the model video.");
    }
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
    };
  }, [currentStep]);

  const nextExercise = () => {
    if (currentStep < EXERCISES.length - 1) {
      setCurrentStep(currentStep + 1);
      setReps(0);
    } else {
      alert("🎉 Excellent work! All mouth control exercises completed.");
      setCurrentStep(0);
      setReps(0);
    }
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Mouth Analyzer — Speation Oral Training</title>
        </Head>

        <Navbar />

        <div style={{ marginTop: '140px', textAlign: 'center' }}>
          <h2 className={styles.title}>Oral & Breath Control: Mouth Analyzer</h2>
          <p style={{ color: '#6C757D', marginBottom: '30px' }}>
            Follow the clinical movement guide on the left and mirror the posture using your live webcam feed.
          </p>
        </div>

        <div className={styles.exerciseContainer}>
          <h3>{EXERCISES[currentStep].text}</h3>

          <video 
            key={currentStep}
            className={styles.video} 
            controls 
            autoPlay 
            loop
            muted
          >
            <source src={EXERCISES[currentStep].video} type="video/mp4" />
            Your browser does not support video playback.
          </video>

          <p style={{ margin: '15px 0', fontSize: '0.95rem', color: '#4A5568', fontStyle: 'italic' }}>
            💡 {EXERCISES[currentStep].instruction}
          </p>

          <button className={styles.nextButton} onClick={nextExercise} type="button">
            Next Exercise ({currentStep + 1}/{EXERCISES.length}) ➡️
          </button>
        </div>

        {/* Live Camera Feed */}
        <div className={styles.cameraContainer}>
          <h3 className={styles.cameraTitle}>Live Mirror & Articulatory Feedback</h3>
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
                Vocal Signal Active
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
