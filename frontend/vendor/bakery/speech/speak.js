// Says a line out loud, so kids who can't read yet can still play.
//
// If the line was recorded with ElevenLabs (see `npm run voice` and
// public/bakery/assets/voice/manifest.json), it plays that mp3. Otherwise it falls
// back to the browser's built-in voice, so the game always talks.
//
// speak() returns a promise that finishes when the line is done (or was
// stopped). Screens wait for it before moving on, so the dragon never gets
// cut off by the next screen. See useAfterSpeech.js.

const VOICE_FOLDER = '/bakery/assets/voice/'

// Speeds. With recordings, the turtle plays the word clip slowed down
// (the pitch stays normal). With the browser voice, it uses a slow rate.
export const NORMAL = 'normal'
export const SLOW = 'slow'
const CLIP_RATE = { normal: 1, slow: 0.6 }
const BROWSER_RATE = { normal: 0.85, slow: 0.4 }

// If a line somehow never reports that it ended, stop waiting after this long.
const LONGEST_LINE_MS = 45000
// When a line is interrupted, fade it out over about this long instead of a hard cut.
const FADE_MS = 150
// Turning the mic on or off makes the computer switch its sound setup for a
// moment (very noticeable with AirPods). A line that starts during that switch
// comes out as a glitchy noise. So after the mic stops, wait this long first.
const MIC_SETTLE_MS = 700
let quietUntil = 0

// Call this right after the mic stops listening.
export function letMicSettle() {
  quietUntil = Date.now() + MIC_SETTLE_MS
}

const canUseBrowserVoice = typeof window !== 'undefined' && 'speechSynthesis' in window

// Load the list of recorded lines once. If there isn't one, that's fine.
const recordings =
  typeof window === 'undefined'
    ? Promise.resolve({})
    : fetch(`${VOICE_FOLDER}manifest.json`)
        .then((response) => (response.ok ? response.json() : {}))
        .then((manifest) => manifest.lines ?? {})
        .catch(() => ({}))

// If the exact same line is asked for again this quickly, skip it.
// (In development, React runs each screen's startup code twice.)
const REPEAT_WINDOW_MS = 1000
let lastKey = ''
let lastTime = 0
let lastDone = Promise.resolve()

let currentClip = null
// Chrome stops talking partway through if nothing holds on to the utterance.
let currentUtterance = null
let finishCurrent = () => {}
let requestId = 0

export function speak(text, { speed = NORMAL } = {}) {
  const key = `${speed}|${text}`
  const now = Date.now()
  if (key === lastKey && now - lastTime < REPEAT_WINDOW_MS) return lastDone
  lastKey = key
  lastTime = now

  stopAudio()
  const thisRequest = ++requestId

  lastDone = new Promise((resolve) => {
    let settled = false
    const safety = setTimeout(() => finish(), LONGEST_LINE_MS)
    function finish() {
      if (settled) return
      settled = true
      clearTimeout(safety)
      resolve()
    }
    finishCurrent = finish

    recordings.then((lines) => {
      const settleMs = Math.max(0, quietUntil - Date.now())
      setTimeout(() => {
        // Something newer was asked for while we waited. Let that one play.
        if (thisRequest !== requestId) return finish()
        const file = lines[text]
        if (file) playClip(`${VOICE_FOLDER}${file}`, speed, text, finish)
        else browserSpeak(text, speed, finish)
      }, settleMs)
    })
  })
  return lastDone
}

export function stopSpeaking() {
  lastKey = ''
  requestId++
  stopAudio()
}

function playClip(url, speed, text, finish) {
  const clip = new Audio(url)
  clip.playbackRate = CLIP_RATE[speed]
  clip.preservesPitch = true
  clip.onended = finish
  currentClip = clip
  clip.play().catch(() => {
    // The file is missing or the browser blocked it: use the built-in voice.
    if (currentClip === clip) browserSpeak(text, speed, finish)
    else finish()
  })
}

function browserSpeak(text, speed, finish) {
  if (!canUseBrowserVoice) return finish()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = BROWSER_RATE[speed]
  utterance.pitch = 1.1
  utterance.onend = finish
  utterance.onerror = finish
  // Some browsers forget to say when they're done. Don't wait much longer than the line should take.
  const expectedMs = (text.length * 75) / BROWSER_RATE[speed] + 1500
  setTimeout(finish, expectedMs)
  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
}

function stopAudio() {
  finishCurrent()
  finishCurrent = () => {}
  if (currentClip) {
    fadeOut(currentClip)
    currentClip = null
  }
  if (currentUtterance) currentUtterance.onend = null
  if (canUseBrowserVoice) window.speechSynthesis.cancel()
  currentUtterance = null
}

// Turns a clip down quickly, then stops it, so an interruption sounds soft.
function fadeOut(clip) {
  const steps = 5
  let step = 0
  const timer = setInterval(() => {
    step++
    if (step >= steps) {
      clearInterval(timer)
      clip.pause()
      return
    }
    // Some phones don't allow changing the volume. Then it just stops at the end.
    try {
      clip.volume = 1 - step / steps
    } catch {
      // ignore
    }
  }, FADE_MS / steps)
}
