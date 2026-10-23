// The game's rules, kept separate from screens and from speech recognition.
// Screens send actions ("the child picked S", "the word was correct"),
// and this function decides what happens next.

import { SOUNDS } from '../data/sounds.js'

export const initialGameState = {
  screen: 'start', // start | grownups | shelf | feed | pickSound | micCheck | order | guide | bake | practice | finish
  soundId: 'S',
  stepIndex: 0,
  missesOnStep: 0,
  micReady: false,
  treatGiven: false,
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START':
      return { ...state, screen: 'pickSound' }

    // The treat shelf, opened from the start screen.
    case 'OPEN_SHELF':
      return { ...state, screen: 'shelf' }

    // The grown-up corner (after the grown-ups-only check).
    case 'OPEN_GROWNUPS':
      return { ...state, screen: 'grownups' }

    // "Feed the dragon", unlocked by a full shelf.
    case 'OPEN_FEED':
      return { ...state, screen: 'feed' }

    case 'PICK_SOUND':
      return { ...state, soundId: action.soundId }

    case 'CONFIRM_SOUND':
      return { ...state, screen: state.micReady ? 'order' : 'micCheck' }

    case 'MIC_READY':
      return { ...state, micReady: true, screen: 'order' }

    // Before the first word: show how to make the sound.
    case 'SHOW_GUIDE':
      return { ...state, screen: 'guide' }

    case 'BEGIN_BAKING':
      return { ...state, screen: 'bake', stepIndex: 0, missesOnStep: 0, treatGiven: false }

    // A correct word moves to the next step. Skipping only happens when the
    // browser can't listen at all.
    case 'WORD_CORRECT':
    case 'SKIP_WORD': {
      const steps = SOUNDS[state.soundId].steps
      const isLastStep = state.stepIndex >= steps.length - 1
      if (isLastStep) {
        return { ...state, screen: 'finish', missesOnStep: 0 }
      }
      return { ...state, screen: 'bake', stepIndex: state.stepIndex + 1, missesOnStep: 0 }
    }

    // Missed the same word too many times: go back to the sound table to
    // practice the sound, then return to the same word.
    case 'WORD_MISSED':
      return { ...state, screen: 'practice' }

    case 'PRACTICE_DONE':
      return { ...state, screen: 'bake', missesOnStep: 0 }

    case 'GIVE_TREAT':
      return { ...state, treatGiven: true }

    case 'PLAY_AGAIN':
      return { ...state, screen: 'pickSound', stepIndex: 0, missesOnStep: 0, treatGiven: false }

    case 'GO_HOME':
      return { ...initialGameState, micReady: state.micReady, soundId: state.soundId }

    default:
      return state
  }
}

// How many misses on one bakery word before going back to practice the sound.
export const MISSES_BEFORE_PRACTICE = 2
