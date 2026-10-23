import { useLocale } from '../context/LocaleContext';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SPEECH_MORPHS, timedVisemes } from '../lib/avatarVisemes';

export default function AvatarCanvas({ 
  state = 'idle', // idle | listening | thinking | speaking
  audioLevel = 0,
  gender = 'female', // female (Maya) | male (Alex)
  alignment = null, // { characters, character_start_times_seconds, character_end_times_seconds }
  audioTime = 0,
  framing = 'portrait'
}) {
  const { t } = useLocale();
  const mountRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const stateRef = useRef(state);
  const audioLevelRef = useRef(audioLevel);
  const alignmentRef = useRef(alignment);
  const audioTimeRef = useRef(audioTime);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    alignmentRef.current = alignment;
  }, [alignment]);

  useEffect(() => {
    audioTimeRef.current = audioTime;
  }, [audioTime]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let disposed = false;
    setIsLoaded(false); setLoadError(null);
    function releaseModel(root) {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      root?.traverse(object => { if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
          materials.add(material); Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
        }
      });
      textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
    }

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Three.js Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    // Camera initialized; will be precisely framed once model loads
    camera.position.set(0, 1.52, 0.82);

    // 2. High-Performance WebGL Renderer
    const compactDevice = window.matchMedia('(pointer: coarse)').matches;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true,
      powerPreference: compactDevice ? 'low-power' : 'high-performance' }); }
    catch { setLoadError('The 3D view is unavailable. Voice and text still work; choose Quiet 2D view.'); return; }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactDevice ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    let contextLost = false;
    const onContextLost = event => { event.preventDefault(); contextLost = true; if (!disposed) setLoadError('The 3D view paused. You can continue with voice, text or Quiet 2D view.'); };
    const onContextRestored = () => { contextLost = false; if (!disposed) setLoadError(null); };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // 3. Realistic 3-Point Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Key Light (Warm frontal portrait illumination)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(0.8, 2.2, 1.6);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Fill Light (Soft cool contrast on shadow side)
    const fillLight = new THREE.DirectionalLight(0xe8f0fe, 1.3);
    fillLight.position.set(-1.0, 1.8, 1.2);
    scene.add(fillLight);

    // Rim Light (Hair & shoulder edge definition)
    const rimLight = new THREE.DirectionalLight(0xffe8d6, 2.0);
    rimLight.position.set(0, 2.2, -1.5);
    scene.add(rimLight);

    // Soft Chin Bounce Light
    const bounceLight = new THREE.DirectionalLight(0xfff8f0, 0.7);
    bounceLight.position.set(0, 0.3, 1.0);
    scene.add(bounceLight);

    // 4. Interactive Mouse Tracking
    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouse.x = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      mouse.y = THREE.MathUtils.clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1), -1, 1);
    };
    const onPointerLeave = () => { mouse.x = 0; mouse.y = 0; };
    container.addEventListener('pointermove', onMouseMove);
    container.addEventListener('pointerleave', onPointerLeave);

    // 5. Load Realistic 3D Avatar (GLB)
    const isMale = gender === 'male';
    const modelUrl = isMale ? '/avatar/alex.glb' : '/avatar/brunette.glb';

    let morphMeshes = [];
    let headBone = null;
    let headRestY = 0;
    let neckBone = null;
    let spineBone = null;
    let avatarRoot = null;

    const setMorph = (name, val) => {
      for (let i = 0; i < morphMeshes.length; i++) {
        const m = morphMeshes[i];
        const idx = m.morphTargetDictionary[name];
        if (idx !== undefined) {
          m.morphTargetInfluences[idx] = val;
        }
      }
    };

    const getMorph = (name) => {
      for (let i = 0; i < morphMeshes.length; i++) {
        const m = morphMeshes[i];
        const idx = m.morphTargetDictionary[name];
        if (idx !== undefined) {
          return m.morphTargetInfluences[idx];
        }
      }
      return 0;
    };

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) { releaseModel(gltf.scene); return; }
        avatarRoot = gltf.scene;

        // Traverse to find morph targets, bones, and optimize materials
        avatarRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
              child.material.roughness = Math.max(child.material.roughness, 0.4);
            }

            if (child.morphTargetDictionary && child.morphTargetInfluences) {
              morphMeshes.push(child);
            }
          }

          if (child.isBone) {
            const lower = child.name.toLowerCase();
            if (!headBone && (lower === 'head' || lower === 'headtop_end')) {
              headBone = child;
              headRestY = child.position.y;
            } else if (!neckBone && lower === 'neck') {
              neckBone = child;
            } else if (!spineBone && (lower === 'spine' || lower === 'spine2')) {
              spineBone = child;
            }
          }
        });

        // Compute Bounding Box & Frame Head and Upper Chest
        const box = new THREE.Box3().setFromObject(avatarRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Center on X and Z
        avatarRoot.position.x = -center.x;
        avatarRoot.position.z = -center.z;
        avatarRoot.position.y = -box.min.y; // Sit on ground plane

        // Optimal Portrait framing: eye level around upper 70% of frame
        const headHeight = size.y * 0.88;
        const room = framing === 'room';
        const close=framing==='mouth';
        camera.position.set(0, headHeight + (close?-.045:.02), close?.40:room ? Math.max(size.y * .82, .86 / Math.max(.55, width / height)) : .72);
        camera.lookAt(0, headHeight - (close?.065:room ? .16 : .03), 0);

        scene.add(avatarRoot);

        // Friendly baseline expression: warm natural smile
        setMorph('mouthSmile', 0.16);
        setMorph('mouthSmileLeft', 0.16);
        setMorph('mouthSmileRight', 0.16);

        setIsLoaded(true);
      },
      undefined,
      (err) => {
        if (disposed) return;
        console.error('Failed to load realistic avatar model:', err);
        setLoadError('Failed to load 3D character');
        setIsLoaded(true);
      }
    );

    // 6. Lifelike Animation Engine
    const clock = new THREE.Clock();
    let blinkTimer = 0;
    let nextBlinkTime = 2.8;
    let isBlinking = false;
    let blinkStartTime = 0;
    const blinkDuration = 0.14; // rapid natural human blink

    let currentMouthOpen = 0;
    let currentVisemeAA = 0;
    let currentVisemeO = 0;
    let currentVisemeE = 0;

    let animId;
    const animate = () => {
      if (disposed) return;
      animId = requestAnimationFrame(animate);
      if (document.hidden || contextLost) return;

      const delta = Math.min(clock.getDelta(), .1), elapsedTime = clock.elapsedTime;
      const currentState = stateRef.current;
      const currentAudio = audioLevelRef.current;

      if (avatarRoot) {
        // --- A. Natural Breathing (Chest & subtle posture sway) ---
        const breath = Math.sin(elapsedTime * 1.6) * 0.012;
        if (spineBone) {
          spineBone.rotation.x = breath * 0.5;
        }

        // --- B. Lifelike Eye Blinking ---
        blinkTimer += delta;
        if (!isBlinking && blinkTimer > nextBlinkTime) {
          isBlinking = true;
          blinkStartTime = elapsedTime;
          blinkTimer = 0;
          nextBlinkTime = 2.6 + Math.random() * 2.8;
        }

        let blinkWeight = 0;
        if (isBlinking) {
          const progress = (elapsedTime - blinkStartTime) / blinkDuration;
          if (progress <= 0.5) {
            blinkWeight = progress * 2;
          } else if (progress <= 1.0) {
            blinkWeight = (1.0 - progress) * 2;
          } else {
            isBlinking = false;
            blinkWeight = 0;
          }
        }

        setMorph('eyeBlinkLeft', blinkWeight);
        setMorph('eyeBlinkRight', blinkWeight);

        // --- C. Subtle Gaze & Attentive Head Tracking ---
        const naturalSwayY = Math.sin(elapsedTime * 0.7) * 0.015;
        const naturalSwayX = Math.cos(elapsedTime * 0.9) * 0.012;

        const targetRotY = naturalSwayY + mouse.x * 0.035;
        const targetRotX = naturalSwayX - mouse.y * 0.025;

        if (headBone) {
          if (currentState === 'listening') {
            // Attentive tilt
            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetRotY + 0.05, 0.08);
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetRotX, 0.08);
            headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, 0.04, 0.08);
            setMorph('browInnerUp', 0.22);
          } else if (currentState === 'thinking') {
            // Thoughtful slight drift up
            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetRotY - 0.06, 0.05);
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetRotX - 0.05, 0.05);
            headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, -0.02, 0.05);
            setMorph('browInnerUp', 0.12);
          } else {
            // Friendly neutral presence
            headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, targetRotY, 0.08);
            headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, targetRotX, 0.08);
            headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, 0, 0.08);
            setMorph('browInnerUp', 0.05);
          }
        }

        // Use the asset's actual mouth controls for aligned examples. Live audio
        // without timing retains an explicitly energy-driven animation fallback.
        const timed=timedVisemes(alignmentRef.current,audioTimeRef.current,currentState==='speaking');
        for(const name of SPEECH_MORPHS){
          const value=timed?.[name]||0;
          setMorph(name,THREE.MathUtils.lerp(getMorph(name),value,timed?0.65:0.5));
        }
        if(timed){
          // Visemes already deform the jaw/lips. Adding jawOpen again distorts
          // closures, especially P/B/M and the lip-to-teeth F/V shape.
          currentMouthOpen=0;currentVisemeAA=0;currentVisemeO=0;currentVisemeE=0;
          setMorph('jawOpen',0);setMorph('mouthOpen',0);
          setMorph('mouthSmile',0);setMorph('mouthSmileLeft',0);setMorph('mouthSmileRight',0);
        } else if (currentState === 'speaking') {
          const currentAlign = alignmentRef.current;
          const curTime = audioTimeRef.current;

          let targetOpen = 0;
          let targetAA = 0;
          let targetO = 0;
          let targetE = 0;

          if(currentAlign?.mouthCues){
            const cue=currentAlign.mouthCues.find(c=>curTime>=c.start&&curTime<c.end)?.value||'X';
            const shapes={A:[0,0,0,0],B:[.22,0,0,.4],C:[.48,.4,0,.5],D:[.8,.9,0,0],E:[.45,0,.65,0],F:[.3,0,.95,0],G:[.15,0,0,.25],H:[.3,.15,0,.4],X:[0,0,0,0]};
            [targetOpen,targetAA,targetO,targetE]=shapes[cue]||shapes.X;
          }else if (currentAlign && currentAlign.characters && currentAlign.character_start_times_seconds) {
            const chars = currentAlign.characters;
            const starts = currentAlign.character_start_times_seconds;
            const ends = currentAlign.character_end_times_seconds;
            let activeChar = '';

            for (let i = 0; i < starts.length; i++) {
              if (curTime >= starts[i] && curTime <= (ends[i] || starts[i] + 0.08)) {
                activeChar = (chars[i] || '').toLowerCase();
                break;
              }
            }

            if (['a', 'ah', 'ar', 'h'].includes(activeChar)) {
              targetOpen = 0.85; targetAA = 0.9; targetO = 0.1; targetE = 0.1;
            } else if (['o', 'u', 'w', 'oo'].includes(activeChar)) {
              targetOpen = 0.55; targetAA = 0.1; targetO = 0.95; targetE = 0.0;
            } else if (['e', 'i', 'y', 'ee'].includes(activeChar)) {
              targetOpen = 0.45; targetAA = 0.1; targetO = 0.0; targetE = 0.9;
            } else if (['m', 'b', 'p'].includes(activeChar)) {
              targetOpen = 0.0; targetAA = 0.0; targetO = 0.0; targetE = 0.0; // Bilabial plosive close
            } else if (['f', 'v'].includes(activeChar)) {
              targetOpen = 0.2; targetAA = 0.0; targetO = 0.0; targetE = 0.4;
            } else if (['s', 'z', 't', 'd', 'n', 'th', 'c', 'k', 'g', 'r', 'l', 'j'].includes(activeChar)) {
              targetOpen = 0.28; targetAA = 0.0; targetO = 0.0; targetE = 0.6;
            } else if (activeChar.trim()) {
              targetOpen = 0.4; targetAA = 0.3; targetO = 0.2; targetE = 0.3;
            } else {
              targetOpen = 0.05; targetAA = 0.0; targetO = 0.0; targetE = 0.0;
            }
          } else {
            // Follow measured energy and stay still in silence. No invented speech motion.
            const speechAmp = Math.min(1.0, Math.max(0, currentAudio) * 4);
            targetOpen = speechAmp * 0.75;
            targetAA = speechAmp * 0.55;
          }

          currentMouthOpen = THREE.MathUtils.lerp(currentMouthOpen, targetOpen, 0.45);
          currentVisemeAA  = THREE.MathUtils.lerp(currentVisemeAA, targetAA, 0.4);
          currentVisemeO   = THREE.MathUtils.lerp(currentVisemeO, targetO, 0.4);
          currentVisemeE   = THREE.MathUtils.lerp(currentVisemeE, targetE, 0.4);

          setMorph('jawOpen', currentMouthOpen);
          setMorph('mouthOpen', currentMouthOpen * 0.8);
          setMorph('viseme_aa', currentVisemeAA);
          setMorph('viseme_O', currentVisemeO);
          setMorph('viseme_E', currentVisemeE);

          // Subtle head emphasis nodding while talking
          if (headBone) {
            headBone.position.y = headRestY + Math.sin(elapsedTime * 8) * 0.001;
          }
        } else {
          if (headBone) headBone.position.y = THREE.MathUtils.lerp(headBone.position.y, headRestY, .15);
          // Smooth return to resting friendly mouth
          currentMouthOpen = THREE.MathUtils.lerp(currentMouthOpen, 0, 0.25);
          currentVisemeAA  = THREE.MathUtils.lerp(currentVisemeAA, 0, 0.25);
          currentVisemeO   = THREE.MathUtils.lerp(currentVisemeO, 0, 0.25);
          currentVisemeE   = THREE.MathUtils.lerp(currentVisemeE, 0, 0.25);

          setMorph('jawOpen', currentMouthOpen);
          setMorph('mouthOpen', currentMouthOpen);
          setMorph('viseme_aa', currentVisemeAA);
          setMorph('viseme_O', currentVisemeO);
          setMorph('viseme_E', currentVisemeE);
          setMorph('mouthSmile', 0.15);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Viewport Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize); resizeObserver.observe(container);

    // 8. Cleanup
    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', onMouseMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('resize', handleResize);
      releaseModel(avatarRoot);
      scene.traverse(object => { if (object.isLight) object.shadow?.map?.dispose(); });
      renderer.dispose(); renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [gender, framing]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas Container */}
      <div 
        ref={mountRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }} 
      />

      {/* Loading Spinner */}
      {!isLoaded && !loadError && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFF9F5',
          zIndex: 10
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            border: '4px solid #FFE6D5',
            borderTopColor: '#FF6225',
            borderRadius: '50%',
            animation: 'spin 0.85s linear infinite',
            marginBottom: '14px'
          }} />
          <p style={{ fontWeight: 600, color: '#2D3748', fontSize: '0.95rem' }}>
            {t('Preparing your practice partner...')}
          </p>
          <style jsx>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Error Fallback */}
      {loadError && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#DC2626',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          {t(loadError)}
        </div>
      )}
    </div>
  );
}
