import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { MicButton } from '../components/MicButton.jsx'
import { Art, Button, Headline, MarkedWord, Scene, SlowSpeakButton } from '../components/ui.jsx'
import { nearMissBubble, nearMissFrom } from '../game/coach.js'
import { MISSES_BEFORE_PRACTICE } from '../game/gameReducer.js'
import { recordTry } from '../game/progress.js'
import { makeWordCheck } from '../game/wordCheck.js'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'
import { useAfterSpeech } from '../speech/useAfterSpeech.js'
import { LISTEN_MESSAGES, useWordListener } from '../speech/useWordListener.js'

// The animation player is big, so it only loads when a step has an animation.
const TreatAnimation = lazy(() => import('../components/TreatAnimation.jsx').then((m) => ({ default: m.TreatAnimation })))

// The shortest time the dragon reacts before the game moves on.
// (It also waits for the dragon to finish talking.)
const REACTION_MS = 1500
// The longest we wait for a step's animation before moving on anyway.
const ANIMATION_TIMEOUT_MS = 7000

export function BakeScreen({ sound, stepIndex, onCorrect, onMissed, onSkip }) {
  const step = sound.steps[stepIndex]
  const treatBefore = stepIndex === 0 ? sound.startImage : sound.steps[stepIndex - 1].image
  const spoken = LINES.stepPrompt(step)

  const { status, listen } = useWordListener()
  const isCorrect = useMemo(() => makeWordCheck(sound, step), [sound, step])
  const afterSpeech = useAfterSpeech()
  // reaction: null | 'cheer' | 'confused'
  const [reaction, setReaction] = useState(null)
  const [misses, setMisses] = useState(0)
  // The bubble for the last near miss (like "Hmm? I heard 'way'!").
  const [nearMissLine, setNearMissLine] = useState(null)
  // True while this step's Rive animation plays (only for steps that have one).
  const [animating, setAnimating] = useState(false)
  const animationFinished = useRef(null)

  // Read the prompt out loud. (App gives each step a fresh screen, so this
  // runs once per step.)
  useEffect(() => {
    speak(spoken)
  }, [spoken])

  async function handleMic() {
    const attempt = await listen(isCorrect)
    const result = attempt.status
    const nearMiss = result === 'missed' ? nearMissFrom(attempt, step.nearMisses) : null
    // Practice counts stay on this device. Audio uses the learner’s Speation recording permissions.
    if (result === 'correct' || result === 'missed') {
      recordTry({ soundId: sound.id, word: step.word, correct: result === 'correct', swap: nearMiss?.swap })
    }
    if (result === 'correct') {
      setReaction('cheer')
      // Move on once the dragon is done cheering and the animation (if any) is done.
      // (Never wait more than a few seconds, in case the animation can't load.)
      const animationDone = step.animation
        ? Promise.race([
            new Promise((resolve) => {
              animationFinished.current = resolve
            }),
            new Promise((resolve) => setTimeout(resolve, ANIMATION_TIMEOUT_MS)),
          ])
        : null
      if (step.animation) setAnimating(true)
      afterSpeech(Promise.all([speak(LINES.stepCheer), animationDone]), REACTION_MS, onCorrect)
    } else if (result === 'missed') {
      const missesNow = misses + 1
      setMisses(missesNow)
      setNearMissLine(nearMissBubble(nearMiss))
      setReaction('confused')
      if (missesNow >= MISSES_BEFORE_PRACTICE) {
        // Missed it again: go practice the sound, then come back to this word.
        afterSpeech(speak(LINES.stepToPractice), REACTION_MS + 400, onMissed)
      } else {
        // A tip that fits the sound swap we heard, or the general tip for this sound.
        // The mic comes back after the tip, so tapping it can't cut the tip off.
        const tip = nearMiss ? LINES.stepCoach(sound, step, nearMiss.swap) : LINES.stepRetry(sound, step)
        afterSpeech(speak(tip), REACTION_MS, () => setReaction(null))
      }
    }
  }

  const listening = status === 'listening'
  const message = LISTEN_MESSAGES[status]
  // While the animation plays, the "before" picture stays underneath it.
  const treatNow = reaction === 'cheer' && !animating ? step.image : treatBefore

  function handleAnimationDone() {
    setAnimating(false)
    animationFinished.current?.()
  }
  const mood = reaction ?? (listening ? 'listening' : 'idle')
  let confusedLine = misses >= MISSES_BEFORE_PRACTICE ? 'Hmm? Let’s practice!' : 'Hmm? Try again!'
  if (nearMissLine && misses < MISSES_BEFORE_PRACTICE) confusedLine = nearMissLine
  const says = reaction === 'cheer' ? 'You did it!' : reaction === 'confused' ? confusedLine : null

  return (
    <Scene mood={mood} says={says}>
      <Headline
        small={step.action}
        title={
          <>
            Say “<MarkedWord marked={step.marked} />”
          </>
        }
        spoken={spoken}
        actions={<SlowSpeakButton word={step.word} />}
      />

      {message && (
        <div className="center-zone center-zone--top">
          <p className="notice" role="status">
            {message}
          </p>
        </div>
      )}

      <div className="order-card" aria-label={`The order: ${sound.treat}`}>
        <Art src={sound.icon} alt="" />
      </div>

      <div className={`on-counter ${reaction === 'cheer' && !step.animation ? 'on-counter--pop' : ''}`}>
        <Art
          key={treatNow}
          src={treatNow}
          alt={`${sound.treat} in progress`}
          className={`treat__img ${animating ? 'treat__img--under-animation' : ''}`}
        />
        {step.animation && (
          <Suspense fallback={null}>
            <TreatAnimation animation={step.animation} playing={animating} onDone={handleAnimationDone} />
          </Suspense>
        )}
      </div>

      <div className="counter-front">
        {status === 'unsupported' ? (
          <Button onClick={onSkip}>Keep baking</Button>
        ) : (
          <MicButton listening={listening} disabled={reaction !== null} onPress={handleMic} />
        )}
      </div>
    </Scene>
  )
}
