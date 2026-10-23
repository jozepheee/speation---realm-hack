// Rules for "Feed the dragon", the bonus round unlocked by a full treat shelf.
// Treats float down one at a time, each with a word from one of the three
// sounds. Saying the word feeds it to the dragon.
//
// Never trap a child: a treat gets 2 tries. Then it floats away and comes
// back once at the end of the line. If it's still tricky, it just floats off,
// and the round keeps going.

import { SOUND_ORDER, SOUNDS } from '../data/sounds.js'

export const TREATS_PER_ROUND = 8
export const TRIES_PER_TREAT = 2

function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Picks words from all three sounds, taking turns so they're mixed.
// soundIds: the sounds a grown-up turned on (all three by default).
export function newFeedRound(size = TREATS_PER_ROUND, soundIds = SOUND_ORDER) {
  const bySound = soundIds.map((id) => shuffle(SOUNDS[id].steps.map((_, stepIndex) => ({ soundId: id, stepIndex }))))
  const order = shuffle(soundIds.map((_, i) => i))
  const queue = []
  for (let turn = 0; queue.length < size && turn < 50; turn++) {
    const list = bySound[order[turn % order.length]]
    const pick = list.shift()
    if (pick) queue.push({ ...pick, key: `${pick.soundId}-${pick.stepIndex}`, misses: 0, cameBack: false })
  }
  return { queue, fed: 0, total: queue.length }
}

export function currentTreat(round) {
  return round.queue[0] ?? null
}

export function roundIsOver(round) {
  return round.queue.length === 0
}

// The child said the word: the dragon eats it.
export function feedCorrect(round) {
  return { ...round, queue: round.queue.slice(1), fed: round.fed + 1 }
}

// Not this time. Returns the new round and what happens to the treat:
// 'retry' (try again now), 'later' (comes back at the end), or 'away' (floats off).
export function feedMissed(round) {
  const [treat, ...rest] = round.queue
  const misses = treat.misses + 1
  if (misses < TRIES_PER_TREAT) {
    return { round: { ...round, queue: [{ ...treat, misses }, ...rest] }, outcome: 'retry' }
  }
  if (!treat.cameBack) {
    return { round: { ...round, queue: [...rest, { ...treat, misses: 0, cameBack: true }] }, outcome: 'later' }
  }
  return { round: { ...round, queue: rest }, outcome: 'away' }
}
