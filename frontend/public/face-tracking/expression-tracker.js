/* Observable cues, not a classifier of feelings or clinical tension.
 * Shared by the inference worker and Node tests. Thresholds are heuristics. */
(function (root) {
  const labels = { neutral: 'No strong expression cue', smile: 'Smile visible',
    brow_furrow: 'Brow furrow visible', eyes_closed: 'Eyes closed',
    mouth_open: 'Mouth movement visible', unknown: 'Expression unclear' };
  function unavailable(status, observation) {
    return { status, expression: null, emotion: null, facial_tension: null,
      confidence: null, observation, source: 'local_face_landmarks' };
  }
  class ExpressionTracker {
    constructor() { this.reset(); }
    reset() { this.average = {}; this.candidate = null; this.since = 0; this.stable = 'unknown'; this.lastTime = null; }
    update(result, timestamp, luminance) {
      const reject = (status, note) => { this.reset(); return unavailable(status, note); };
      if (!Number.isFinite(timestamp) || (this.lastTime !== null && timestamp <= this.lastTime))
        return reject('unavailable', 'Waiting for a fresh camera frame.');
      const faces = result?.faceLandmarks || [];
      if (faces.length === 0) return reject('no_face', 'No face detected. Face the camera.');
      if (faces.length !== 1) return reject('multiple_faces', 'Keep only one face in the camera view.');
      if (!Number.isFinite(luminance) || luminance < 35 || luminance > 235)
        return reject('poor_lighting', 'Use even lighting on your face; avoid backlighting.');
      const points = faces[0];
      if (points.length < 468 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        return reject('unavailable', 'Face tracking unavailable.');
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      if (right - left < 0.2 || bottom - top < 0.25)
        return reject('too_far', 'Move a little closer to the camera.');
      if (left < 0.02 || right > 0.98 || top < 0.02 || bottom > 0.98)
        return reject('face_cropped', 'Keep your whole face inside the camera view.');
      const eyeA = points[33], eyeB = points[263], nose = points[1];
      const eyeDistance = Math.abs(eyeA.x - eyeB.x);
      if (eyeDistance < 0.04 || Math.abs(eyeA.y - eyeB.y) / eyeDistance > 0.35 ||
          Math.abs(nose.x - (eyeA.x + eyeB.x) / 2) / eyeDistance > 0.35)
        return reject('off_angle', 'Look toward the camera for steadier tracking.');
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      const scores = Object.fromEntries(categories.map(c => [c.categoryName, c.score]));
      const required = ['mouthSmileLeft', 'mouthSmileRight', 'browDownLeft', 'browDownRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen'];
      if (required.some(key => !Number.isFinite(scores[key]) || scores[key] < 0 || scores[key] > 1))
        return reject('unavailable', 'Expression signals unavailable.');
      const elapsed = this.lastTime === null ? 125 : timestamp - this.lastTime;
      const alpha = this.lastTime === null ? 1 : 1 - Math.exp(-elapsed / 450);
      for (const key of required) this.average[key] = (this.average[key] ?? scores[key]) * (1 - alpha) + scores[key] * alpha;
      this.lastTime = timestamp;
      const a = this.average;
      const smile = Math.min(a.mouthSmileLeft, a.mouthSmileRight);
      const brow = Math.min(a.browDownLeft, a.browDownRight);
      const eyes = Math.min(a.eyeBlinkLeft, a.eyeBlinkRight);
      let candidate = 'unknown';
      if (eyes > 0.65) candidate = 'eyes_closed';
      else if (smile > 0.5) candidate = 'smile';
      else if (brow > 0.5) candidate = 'brow_furrow';
      else if (a.jawOpen > 0.45) candidate = 'mouth_open';
      else if (Math.max(smile, brow, eyes, a.jawOpen) < 0.3) candidate = 'neutral';
      if (candidate !== this.candidate) { this.candidate = candidate; this.since = timestamp; }
      if (timestamp - this.since >= 900) this.stable = candidate;
      return { status: 'tracking', expression: this.stable, emotion: null, facial_tension: null,
        confidence: null, observation: labels[this.stable], source: 'local_face_landmarks' };
    }
  }
  const api = { ExpressionTracker, unavailable, labels };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FaceExpressions = api;
})(typeof self !== 'undefined' ? self : globalThis);
