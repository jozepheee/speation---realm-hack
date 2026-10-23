import {storageKey} from './storage';
// What the grown-up corner shows: time practiced and how practice went.
//
// Saved on this device only (in the browser's storage) and never sent anywhere.
// It keeps counts only: no voice, no transcripts, no names. For a sound swap
// we keep the kind of swap (like "R sounded like W"), not what was heard.

import { SOUND_ORDER } from '../data/sounds.js'

const STORAGE_KEY = 'speakery-progress-v1'
// Don't count more than this much time at once (like a tab left open).
const LONGEST_CHUNK_SECONDS = 10 * 60

function emptyProgress() {
  return {
    sounds: Object.fromEntries(SOUND_ORDER.map((id) => [id, { seconds: 0, tries: 0, correct: 0, lastPlayed: null }])),
    // 'R:roll' -> { tries, correct }
    words: {},
    // 'R:w' -> how many times that swap came up
    swaps: {},
    // Time in the "Feed the dragon" bonus round.
    feedSeconds: 0,
  }
}

export function loadProgress(scope) {
  const progress = emptyProgress()
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(STORAGE_KEY,scope)))
    if (!saved) return progress
    for (const id of SOUND_ORDER) Object.assign(progress.sounds[id], saved.sounds?.[id])
    progress.words = saved.words ?? {}
    progress.swaps = saved.swaps ?? {}
    progress.feedSeconds = Number(saved.feedSeconds) || 0
  } catch {
    // Storage is blocked or the data is broken: start fresh.
  }
  return progress
}

function save(progress,scope) {
  try {
    localStorage.setItem(storageKey(STORAGE_KEY,scope), JSON.stringify(progress))
  } catch {
    // Storage is blocked: nothing is saved, and the game still works.
  }
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// One try at a word. swap is the kind of near miss heard (like 'w'), if any.
export function recordTry({ soundId, word, correct, swap = null }) {
  const progress = loadProgress()
  const sound = progress.sounds[soundId]
  if (!sound) return
  sound.tries += 1
  if (correct) sound.correct += 1
  sound.lastPlayed = today()

  const wordKey = `${soundId}:${word}`
  const wordStats = progress.words[wordKey] ?? { tries: 0, correct: 0 }
  wordStats.tries += 1
  if (correct) wordStats.correct += 1
  progress.words[wordKey] = wordStats

  if (swap) {
    const swapKey = `${soundId}:${swap}`
    progress.swaps[swapKey] = (progress.swaps[swapKey] ?? 0) + 1
  }
  save(progress)
}

// Adds practice time. bucket is a sound id ('R', 'S', 'K') or 'feed'.
export function addTime(bucket, seconds,scope) {
  const counted = Math.min(Math.round(seconds), LONGEST_CHUNK_SECONDS)
  if (counted <= 0) return
  const progress = loadProgress(scope)
  if (bucket === 'feed') progress.feedSeconds += counted
  else if (progress.sounds[bucket]) progress.sounds[bucket].seconds += counted
  else return
  save(progress,scope)
}

export function clearProgress() {
  try {
    localStorage.removeItem(storageKey(STORAGE_KEY))
  } catch {
    // Nothing to clear.
  }
}

// Everything the grown-up corner needs, worked out from the saved counts.
export function summarize(progress) {
  const perSound = SOUND_ORDER.map((id) => {
    const stats = progress.sounds[id]
    const extraTries = stats.tries - stats.correct
    const words = Object.entries(progress.words)
      .filter(([key]) => key.startsWith(`${id}:`))
      .map(([key, w]) => ({ word: key.slice(2), extraTries: w.tries - w.correct, tries: w.tries }))
      .sort((a, b) => b.extraTries - a.extraTries)
    const swaps = Object.entries(progress.swaps)
      .filter(([key]) => key.startsWith(`${id}:`))
      .map(([key, count]) => ({ swap: key.slice(2), count }))
      .sort((a, b) => b.count - a.count)
    return {
      id,
      seconds: stats.seconds,
      tries: stats.tries,
      correct: stats.correct,
      extraTries,
      // Extra tries for each word said right. Higher means it took more practice.
      extraPerWord: stats.correct > 0 ? extraTries / stats.correct : extraTries,
      lastPlayed: stats.lastPlayed,
      trickiestWord: words[0]?.extraTries > 0 ? words[0].word : null,
      topSwap: swaps[0] ?? null,
    }
  })

  // The sound that needed the most practice, once there's enough to tell (5+ tries).
  const candidates = perSound.filter((s) => s.tries >= 5 && s.extraTries > 0)
  const mostPractice = candidates.sort((a, b) => b.extraPerWord - a.extraPerWord)[0]?.id ?? null

  const totalSeconds = perSound.reduce((sum, s) => sum + s.seconds, 0) + progress.feedSeconds
  return { perSound, mostPractice, totalSeconds, feedSeconds: progress.feedSeconds }
}
