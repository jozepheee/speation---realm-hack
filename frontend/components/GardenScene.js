import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GardenScene({ quiet = false }) {
  const mount = useRef(null);
  useEffect(() => {
    const root = mount.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0, 0); root.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
    camera.position.set(0, 3, 13); camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight('#e6e0ff', 2));
    const sun = new THREE.DirectionalLight('#ffefbb', 4); sun.position.set(-3, 6, 5); scene.add(sun);
    const rim = new THREE.DirectionalLight('#8ee5de', 2); rim.position.set(6, 2, -3); scene.add(rim);
    const islands = [];
    const rock = new THREE.MeshStandardMaterial({ color: '#a1aab9', roughness: 1, flatShading: true });
    const grass = new THREE.MeshStandardMaterial({ color: '#9bd0a1', roughness: .8 });
    const trunk = new THREE.MeshStandardMaterial({ color: '#a9785e', roughness: 1 });
    const leaves = new THREE.MeshStandardMaterial({ color: '#7baa9a', roughness: .7 });
    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group(); const scale = .7 + (i % 3) * .25;
      const stone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 7), rock); stone.rotation.z = Math.PI; stone.position.y = -.8; group.add(stone);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.3, .25, 32), grass); group.add(top);
      for (let j = 0; j < 3; j++) {
        const tree = new THREE.Group(); tree.position.set(Math.cos(j * 2.1) * .7, .25, Math.sin(j * 2.1) * .7);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .7, 6), trunk); stem.position.y = .3; tree.add(stem);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.43, 1), leaves); crown.position.y = .75; tree.add(crown); group.add(tree);
      }
      group.scale.setScalar(scale); group.position.set((i - 2) * 3.7, (i % 2) * 1.8 - 1, -i % 3);
      group.rotation.y = i; group.userData.baseY = group.position.y; scene.add(group); islands.push(group);
    }
    const dustGeometry = new THREE.BufferGeometry();
    const coordinates = Float32Array.from({ length: 240 }, (_, i) => i % 3 === 0 ? (Math.random() - .5) * 22 : i % 3 === 1 ? Math.random() * 10 - 3 : (Math.random() - .5) * 10);
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3));
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#fff3cb', size: .045, transparent: true, opacity: .65 })); scene.add(dust);
    let frame, started = performance.now(), visible = true;
    const resize = () => { const width = root.clientWidth, height = root.clientHeight; if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); if (quiet) renderer.render(scene, camera); };
    const observer = new ResizeObserver(resize); observer.observe(root); resize();
    const visibility = () => { visible = !document.hidden; }; document.addEventListener('visibilitychange', visibility);
    const animate = () => { if (!quiet) frame = requestAnimationFrame(animate); if (!visible) return; const time = (performance.now() - started) / 1000;
      if (!quiet) { islands.forEach((island, i) => { island.position.y = island.userData.baseY + Math.sin(time * .45 + i) * .18; island.rotation.y += .0006; }); dust.rotation.y = time * .007; }
      renderer.render(scene, camera);
    }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
      const geometries = new Set(), materials = new Set(); scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [quiet]);
  return <div ref={mount} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />;
}
