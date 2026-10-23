// Picks the dragon's tip after a missed word.
//
// The browser's speech recognition hears words, not sounds. But some common
// sound swaps turn the word into a different real word ("ray" -> "way",
// "key" -> "tea"). Each word in src/data/sounds.js lists those near-miss words
// in `nearMisses`, grouped by which tip fits. If we hear one, we give that tip.
//
// Privacy: `heardOptions` is what the browser thinks it heard on this try.
// It's only compared here and then thrown away. It's never saved or logged.

// Returns { heard, swap } for the first near-miss word we heard, or null.
//   heardOptions: the browser's guesses, best guess first
//   nearMisses:   { swap: ['word', ...] } from the word list
export function findNearMiss(heardOptions = [], nearMisses = {}) {
  for (const option of heardOptions) {
    for (const heardWord of normalize(option).split(' ')) {
      for (const [swap, words] of Object.entries(nearMisses)) {
        if (words.includes(heardWord)) return { heard: heardWord, swap }
      }
    }
  }
  return null
}

// The near miss for a try: a sound swap found by listening to the sound itself
// (see speech/rSoundCheck.js), or else a near-miss word the browser heard.
// attempt: what useWordListener's listen() returned.
export function nearMissFrom(attempt, nearMisses = {}) {
  if (attempt.soundSwap && Object.hasOwn(nearMisses, attempt.soundSwap)) return { heard: null, swap: attempt.soundSwap, bySound: true }
  return findNearMiss(attempt.heardOptions, nearMisses)
}

// The dragon's speech bubble for a near miss.
export function nearMissBubble(nearMiss) {
  if (!nearMiss) return null
  if (nearMiss.bySound) return 'Let’s practise that sound together!'
  return `Hmm? I heard “${nearMiss.heard}”!`
}

// The first near-miss word in the list. Used by the M demo key.
export function exampleNearMiss(nearMisses = {}) {
  return Object.values(nearMisses).flat()[0] ?? ''
}

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}
