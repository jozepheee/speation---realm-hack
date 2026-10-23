import {storageKey} from './storage';
// Grown-up settings, saved on this device only.
// Right now there's one: which sounds the child practices.

import { SOUND_ORDER } from '../data/sounds.js'

const STORAGE_KEY = 'speakery-settings-v1'

export function defaultSettings() {
  return { sounds: [...SOUND_ORDER] }
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(STORAGE_KEY)))
    const sounds = SOUND_ORDER.filter((id) => saved?.sounds?.includes(id))
    return { sounds: sounds.length ? sounds : [...SOUND_ORDER] }
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(settings))
  } catch {
    // Storage is blocked: the setting lasts until the page closes.
  }
  return settings
}

// Turns a sound on or off. At least one sound always stays on.
export function toggleSound(settings, soundId) {
  const on = settings.sounds.includes(soundId)
  if (on && settings.sounds.length === 1) return settings
  const sounds = SOUND_ORDER.filter((id) => (id === soundId ? !on : settings.sounds.includes(id)))
  return saveSettings({ ...settings, sounds })
}
