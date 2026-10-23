// Every line the game says out loud, in one place.
//
// Screens build their spoken text with these functions, and
// tools/make-voice.mjs uses allVoiceLines() to record each one as an mp3.
// If you add or change a line, run `npm run voice` again to record it.
// (Until then, the game uses the browser's built-in voice for that line.)

import { SOUNDS, SOUND_ORDER, guideAsSpeech } from '../data/sounds.js'

export const LINES = {
  pickQuestion: 'Which sound are we practicing today?',
  soundExample: (sound) => `${sound.letter}, like in ${sound.exampleWord}`,
  micAsk: 'I bake with your voice! Can I use the microphone?',
  order: (sound) => `New order! ${sound.orderLine}`,

  guideIntro: (sound, mode) => {
    const opening =
      mode === 'intro'
        ? `Before we bake, let's learn ${sound.guide.nickname}!`
        : `Let's practice ${sound.guide.nickname} together.`
    return `${opening} ${guideAsSpeech(sound)} Now you try! ${sound.guide.practice.cue}`
  },
  guideRow: (row) => `${row.part}. ${row.text}`,
  listenWords: (sound) => `Listen: ${sound.guide.listenWords}`,
  mirrorOpen: 'Look in the mirror! Make your mouth look like the picture.',
  practiceCue: (sound) => sound.guide.practice.cue,
  practiceRetry: (sound) => `Hmm? Let's try again. ${sound.guide.practice.cue}`,
  // A tip for a common sound swap we heard (see src/game/coach.js).
  practiceCoach: (sound, swap) => `Hmm? ${sound.coach[swap]} Say ${sound.guide.practice.say}.`,
  practiceSuccess: (mode) => (mode === 'intro' ? "You did it! Let's bake!" : "You did it! Let's get back to baking!"),
  helpOffer: "That's a tricky one! You're working so hard. Want a grown-up to help?",
  bakeAnyway: "Great practicing! Let's bake!",

  stepPrompt: (step) => `${step.action}! Say ${step.word}.`,
  stepCheer: 'Yay! You did it!',
  stepRetry: (sound, step) => `Hmm? Let's try again. ${sound.coach.general} Say ${step.word}.`,
  stepCoach: (sound, step, swap) => `Hmm? ${sound.coach[swap]} Say ${step.word}.`,
  stepToPractice: "Hmm? Let's practice the sound together.",
  // Just the word by itself. The turtle button plays this same clip slowed down.
  word: (word) => word,

  finishCheer: (sound) => `Amazing! ${sound.finishLine} Tap it to give it to me!`,
  finishThanks: (sound) => `Yum! Thank you for the ${sound.treat}!`,

  shelfAdded: 'Look! Your treat is on the shelf!',
  shelfFull: 'You baked all three treats! You unlocked a surprise!',
  shelfOpen: 'Here are all the treats you baked!',
  shelfEmpty: "Your shelf is empty. Let's bake a treat!",

  feedIntro: "I'm so hungry! Say the word on each treat to feed me!",
  feedYum: 'Yum! More please!',
  feedSkip: "Let's try a different treat!",
  feedDone: 'Yum yum! My tummy is so full! Thank you!',
}

// Every line, with no repeats. Used by the voice recording script.
export function allVoiceLines() {
  const lines = [LINES.pickQuestion, LINES.micAsk, LINES.mirrorOpen, LINES.shelfAdded, LINES.shelfFull, LINES.shelfOpen, LINES.shelfEmpty, LINES.feedIntro, LINES.feedYum, LINES.feedSkip, LINES.feedDone, LINES.helpOffer, LINES.bakeAnyway, LINES.stepCheer, LINES.stepToPractice]
  lines.push(LINES.practiceSuccess('intro'), LINES.practiceSuccess('retry'))

  for (const id of SOUND_ORDER) {
    const sound = SOUNDS[id]
    lines.push(
      LINES.soundExample(sound),
      LINES.order(sound),
      LINES.guideIntro(sound, 'intro'),
      LINES.guideIntro(sound, 'retry'),
      LINES.listenWords(sound),
      LINES.practiceCue(sound),
      LINES.practiceRetry(sound),
      ...Object.keys(sound.guide.practice.nearMisses ?? {}).map((swap) => LINES.practiceCoach(sound, swap)),
      LINES.word(sound.guide.practice.say),
      LINES.finishCheer(sound),
      LINES.finishThanks(sound),
    )
    for (const row of sound.guide.rows) lines.push(LINES.guideRow(row))
    for (const step of sound.steps) {
      lines.push(LINES.stepPrompt(step), LINES.stepRetry(sound, step), LINES.word(step.word))
      for (const swap of Object.keys(step.nearMisses ?? {})) lines.push(LINES.stepCoach(sound, step, swap))
    }
  }
  return [...new Set(lines)]
}
