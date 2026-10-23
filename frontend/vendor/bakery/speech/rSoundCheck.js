// Listens to HOW the R was said, not just which word the browser heard.
//
// The browser's speech recognition "fixes" a W-for-R swap: a child saying
// "bwown" usually comes back as "brown". So for R words we also look at the
// sound itself, at the start of the word (where the R is in all our R words).
//
// A real R pulls one of the voice's resonances (F3) way down, so the start of
// the word has extra sound energy around 1,300 to 2,000 Hz. A W keeps that
// area quiet: its energy sits low (under about 900 Hz) and up high (2,400 Hz+).
// We measure the sound "shape" at 20 pitches, both on its own and compared
// with the vowel later in the word (so it adapts to each voice), and combine
// them into one score from 0 (sounds like W) to 1 (sounds like R).
//
// The weights below were fitted on hundreds of computer-voice R/W pairs
// ("ray"/"way", "brown"/"bwown", ...), in 8 voices, at different pitches, with
// and without background noise. On voices it wasn't fitted on, it flagged about
// 2% of real R's as W and caught about 87% of W's. Real kids will vary more.
//
// This is a sound-science heuristic, not a speech test. When it isn't sure,
// it says 'unsure' and the game goes with the browser's answer.
//
// Privacy: the audio is only kept in memory for this one try, analyzed, and
// then thrown away. Nothing is saved, uploaded, or logged.

// Score at or below W_MAX: sounds like a W. At or above R_MIN: sounds like an R.
// In between, we're not sure (and the browser decides). Tune with ?debug, which
// shows the score. If clear R's get flagged as W, lower W_MAX (like 0.1).
// If W's slip through, raise W_MAX (like 0.3).
export const W_MAX = 0.2
export const R_MIN = 0.5

const TARGET_RATE = 11025
const FRAME_MS = 30
const HOP_MS = 10
const LPC_ORDER = 12

// The pitches (Hz) where we measure the sound's shape.
const BANDS = [250, 291, 339, 395, 459, 535, 623, 725, 844, 983, 1144, 1333, 1551, 1806, 2103, 2449, 2851, 3320, 3865, 4500]
// How much each measurement pushes toward R (+) or W (-).
// First 20: the start of the word. Last 20: the start minus the vowel.
const WEIGHTS = [
  -0.0317, -0.0372, 0.0372, 0.0323, 0.0335, -0.0588, -0.1933, -0.1801, -0.363, -0.063,
  0.3158, 0.3998, 0.2466, 0.2574, -0.2508, -0.2166, -0.6389, -0.0989, 0.0366, 0.1199,
  -0.0713, -0.0523, 0.0686, -0.1027, -0.0488, 0.0363, 0.0754, -0.1425, 0.0372, 0.1455,
  0.1091, -0.0756, -0.0935, 0.0963, 0.0471, 0.0193, -0.0523, -0.0831, 0.0695, -0.0424,
]
const BIAS = 0.5068

// samples: Float32Array of the child's try. Returns
// { verdict: 'r' | 'w' | 'unsure', score, frames }.
export function checkRSound(samples, sampleRate) {
  const { signal, rate } = downsample(samples, sampleRate)
  const shapes = voicedFrames(signal, rate)
    .map((frame) => soundShape(frame, rate))
    .filter(Boolean)
  const n = shapes.length
  if (n < 12) return { verdict: 'unsure', score: null, frames: n }

  const start = average(shapes.slice(0, Math.max(3, Math.round(n * 0.3))))
  const vowel = average(shapes.slice(Math.round(n * 0.45), Math.round(n * 0.85)))
  const features = [...start, ...start.map((value, i) => value - vowel[i])]

  let total = BIAS
  features.forEach((value, i) => (total += value * WEIGHTS[i]))
  const score = 1 / (1 + Math.exp(-total))
  const verdict = score <= W_MAX ? 'w' : score >= R_MIN ? 'r' : 'unsure'
  return { verdict, score: Math.round(score * 100) / 100, frames: n }
}

// ---------- Sound math (you shouldn't need to change anything below) ----------

// Cuts the sample rate to about 11 kHz (plenty for speech resonances).
function downsample(samples, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE))
  if (factor === 1) return { signal: Float32Array.from(samples), rate: sampleRate }
  // Simple low-pass first (average over the factor), then keep every Nth sample.
  const out = new Float32Array(Math.floor(samples.length / factor))
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k]
    out[i] = sum / factor
  }
  return { signal: out, rate: sampleRate / factor }
}

// Splits the sound into short frames and keeps the voiced part of the word.
function voicedFrames(signal, rate) {
  const size = Math.round((rate * FRAME_MS) / 1000)
  const hop = Math.round((rate * HOP_MS) / 1000)
  const frames = []
  for (let start = 0; start + size <= signal.length; start += hop) {
    const frame = signal.subarray(start, start + size)
    let energy = 0
    let crossings = 0
    for (let i = 0; i < size; i++) {
      energy += frame[i] * frame[i]
      if (i > 0 && frame[i - 1] < 0 !== frame[i] < 0) crossings++
    }
    frames.push({ frame, energy: energy / size, zcr: crossings / size })
  }
  if (!frames.length) return []
  const loudest = Math.max(...frames.map((f) => f.energy))
  // Voiced: loud enough (within 25 dB of the loudest) and not hissy.
  const voiced = frames.map((f) => f.energy > loudest * 0.003 && f.zcr < 0.25)

  // The longest stretch of voiced frames (small gaps allowed) is the word.
  let best = [0, -1]
  let runStart = -1
  let gap = 0
  for (let i = 0; i <= voiced.length; i++) {
    if (i < voiced.length && voiced[i]) {
      if (runStart < 0) runStart = i
      gap = 0
    } else if (runStart >= 0) {
      gap++
      if (gap > 6 || i === voiced.length) {
        const end = i - gap
        if (end - runStart > best[1] - best[0]) best = [runStart, end]
        runStart = -1
        gap = 0
      }
    }
  }
  return frames.slice(best[0], best[1] + 1).map((f) => f.frame)
}

// The loudness (in dB) of one frame at each pitch in BANDS, measured from a
// smooth outline of the spectrum (linear prediction), relative to the frame's
// average so a loud or quiet voice doesn't matter.
function soundShape(frame, rate) {
  const size = frame.length
  const x = new Float64Array(size)
  // Pre-emphasis and a Hamming window, the usual prep for speech analysis.
  for (let i = 0; i < size; i++) {
    const emphasized = frame[i] - 0.97 * (i > 0 ? frame[i - 1] : 0)
    x[i] = emphasized * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1)))
  }
  const coeffs = lpc(x, LPC_ORDER)
  if (!coeffs) return null
  const levels = BANDS.map((hz) => {
    const w = (2 * Math.PI * hz) / rate
    let re = 0
    let im = 0
    coeffs.forEach((a, k) => {
      re += a * Math.cos(w * k)
      im -= a * Math.sin(w * k)
    })
    return -10 * Math.log10(re * re + im * im)
  })
  const mean = levels.reduce((sum, v) => sum + v, 0) / levels.length
  return levels.map((v) => v - mean)
}

// The average shape of several frames.
function average(shapes) {
  return BANDS.map((_, i) => shapes.reduce((sum, shape) => sum + shape[i], 0) / shapes.length)
}

// Linear prediction coefficients [1, a1, ..., ap] (Levinson-Durbin).
function lpc(x, order) {
  const r = new Float64Array(order + 1)
  for (let lag = 0; lag <= order; lag++) {
    let sum = 0
    for (let i = lag; i < x.length; i++) sum += x[i] * x[i - lag]
    r[lag] = sum
  }
  if (r[0] <= 0) return null
  r[0] *= 1.0001
  let a = new Float64Array(order + 1)
  a[0] = 1
  let error = r[0]
  for (let i = 1; i <= order; i++) {
    let acc = r[i]
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j]
    const k = -acc / error
    const next = Float64Array.from(a)
    for (let j = 1; j < i; j++) next[j] = a[j] + k * a[i - j]
    next[i] = k
    a = next
    error *= 1 - k * k
    if (error <= 0) return null
  }
  return a
}
