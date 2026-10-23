import {storageKey} from './storage';
// The treat shelf: how many of each treat the child has baked.
//
// Saved on this device only (in the browser's storage), never sent anywhere.
// It holds counts only, like { R: 2, S: 1, K: 0 }. No names or voice data.

import { SOUND_ORDER } from '../data/sounds.js'

const STORAGE_KEY = 'speakery-shelf-v1'

export function emptyShelf() {
  return Object.fromEntries(SOUND_ORDER.map((id) => [id, 0]))
}

export function loadShelf() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(STORAGE_KEY)))
    const shelf = emptyShelf()
    for (const id of SOUND_ORDER) {
      const count = Number(saved?.[id])
      if (Number.isInteger(count) && count > 0) shelf[id] = count
    }
    return shelf
  } catch {
    // Storage is blocked (like a private window): start with an empty shelf.
    return emptyShelf()
  }
}

function saveShelf(shelf) {
  try {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(shelf))
  } catch {
    // Storage is blocked: the shelf still works until the page closes.
  }
}

// Returns a new shelf with one more of this treat, and saves it.
export function addToShelf(shelf, soundId) {
  const next = { ...shelf, [soundId]: (shelf[soundId] ?? 0) + 1 }
  saveShelf(next)
  return next
}

// For testing and demos (the ?debug panel).
export function setShelf(shelf) {
  saveShelf(shelf)
  return shelf
}

// True once the child has baked every kind of treat at least once.
// soundIds: the sounds a grown-up turned on (all three by default).
export function shelfIsFull(shelf, soundIds = SOUND_ORDER) {
  return soundIds.every((id) => shelf[id] > 0)
}
