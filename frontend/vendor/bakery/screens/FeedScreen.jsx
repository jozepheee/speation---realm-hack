// "Feed the dragon": the bonus round unlocked by a full treat shelf.
// Treats float in one at a time, each with a word from R, S, or K.
// Saying the word feeds the treat to the dragon. Rules are in game/feedRound.js.

import { useEffect, useMemo, useRef, useState } from 'react'
import { MicButton } from '../components/MicButton.jsx'
import { Sparkles } from '../components/Sparkles.jsx'
import { AgainIcon } from '../components/icons.jsx'
import { Art, Button, Headline, MarkedWord, Scene, SlowSpeakButton } from '../components/ui.jsx'
import { SOUNDS } from '../data/sounds.js'
import { nearMissBubble, nearMissFrom } from '../game/coach.js'
import { currentTreat, feedCorrect, feedMissed, newFeedRound, roundIsOver } from '../game/feedRound.js'
import { recordTry } from '../game/progress.js'
import { makeWordCheck } from '../game/wordCheck.js'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'
import { useAfterSpeech } from '../speech/useAfterSpeech.js'
import { LISTEN_MESSAGES, useWordListener } from '../speech/useWordListener.js'

// How long the treat takes to fly into the dragon's mouth (matches FeedScreen.css).
const EAT_MS = 650
const FLOAT_AWAY_MS = 600

// soundIds: the sounds a grown-up turned on.
export function FeedScreen({ soundIds, onHome }) {
  const [round, setRound] = useState(() => newFeedRound(undefined, soundIds))
  // motion: 'float' | 'eaten' | 'away'
  const [motion, setMotion] = useState('float')
  // reaction: null | 'yum' | 'confused'
  const [reaction, setReaction] = useState(null)
  const [tip, setTip] = useState(null)
  const [mouthOffset, setMouthOffset] = useState({ x: 0, y: 0 })
  const treatRef = useRef(null)

  const { status, listen } = useWordListener()
  const afterSpeech = useAfterSpeech()

  const treat = currentTreat(round)
  const sound = treat ? SOUNDS[treat.soundId] : null
  const step = treat ? sound.steps[treat.stepIndex] : null
  const isCorrect = useMemo(() => (step ? makeWordCheck(sound, step) : null), [sound, step])
  const over = roundIsOver(round)
  const fedTotal = round.fed

  // Say hello once, then say each new treat's word when it floats in.
  const greeted = useRef(false)
  const lastAnnounced = useRef(null)
  const treatId = treat ? `${treat.key}-${treat.cameBack}` : 'done'
  const word = step?.word
  useEffect(() => {
    if (lastAnnounced.current === treatId) return
    lastAnnounced.current = treatId
    if (!word) {
      speak(LINES.feedDone)
    } else if (!greeted.current) {
      greeted.current = true
      afterSpeech(speak(LINES.feedIntro), 200, () => speak(LINES.word(word)))
    } else {
      speak(LINES.word(word))
    }
  }, [treatId, word, afterSpeech])

  // Where the dragon's mouth is, relative to the treat, so it flies the right way.
  function aimAtMouth() {
    const dragon = document.querySelector('.scene__dragon')
    const box = treatRef.current
    if (!dragon || !box) return
    const d = dragon.getBoundingClientRect()
    const t = box.getBoundingClientRect()
    setMouthOffset({
      x: d.left + d.width * 0.5 - (t.left + t.width / 2),
      y: d.top + d.height * 0.36 - (t.top + t.height / 2),
    })
  }

  async function handleMic() {
    const attempt = await listen(isCorrect)
    const result = attempt.status
    const nearMiss = result === 'missed' ? nearMissFrom(attempt, step.nearMisses) : null
    if (result === 'correct' || result === 'missed') {
      recordTry({ soundId: sound.id, word: step.word, correct: result === 'correct', swap: nearMiss?.swap })
    }
    if (result === 'correct') {
      aimAtMouth()
      setTip(null)
      setMotion('eaten')
      setReaction('yum')
      afterSpeech(speak(LINES.feedYum), EAT_MS + 300, () => {
        setRound((r) => feedCorrect(r))
        setMotion('float')
        setReaction(null)
      })
    } else if (result === 'missed') {
      const { round: next, outcome } = feedMissed(round)
      setReaction('confused')
      setTip(nearMissBubble(nearMiss))
      if (outcome === 'retry') {
        const line = nearMiss ? LINES.stepCoach(sound, step, nearMiss.swap) : LINES.stepRetry(sound, step)
        afterSpeech(speak(line), 900, () => setReaction(null))
      } else {
        // Tried twice: this treat floats away for now. No pressure.
        setMotion('away')
        afterSpeech(speak(LINES.feedSkip), FLOAT_AWAY_MS + 300, () => {
          setRound(next)
          setMotion('float')
          setReaction(null)
          setTip(null)
        })
        return
      }
      setRound(next)
    }
  }

  function playAgain() {
    greeted.current = true
    lastAnnounced.current = null
    setRound(newFeedRound(undefined, soundIds))
    setMotion('float')
    setReaction(null)
    setTip(null)
  }

  const listening = status === 'listening'
  const message = LISTEN_MESSAGES[status]

  if (over) {
    return (
      <Scene mood="yum" says="I’m so full!">
        <Headline small="Feed the dragon" title="Yum yum! I’m full!" spoken={LINES.feedDone} />
        <div className="center-zone">
          <p className="feed-score">
            You fed the dragon <strong>{fedTotal}</strong> {fedTotal === 1 ? 'treat' : 'treats'}!
          </p>
        </div>
        <div className="counter-front">
          <Button variant="link" onClick={onHome}>
            Home
          </Button>
          <Button onClick={playAgain}>
            <AgainIcon /> Play again
          </Button>
        </div>
      </Scene>
    )
  }

  const mood = reaction ?? (listening ? 'listening' : 'idle')
  let says = 'Feed me!'
  if (reaction === 'yum') says = 'Yum!'
  if (reaction === 'confused') says = tip ?? 'Hmm? Try again!'
  if (motion === 'away') says = 'Let’s try another!'

  return (
    <Scene mood={mood} says={says}>
      <Headline
        small="Feed the dragon!"
        title={
          <>
            Say “<MarkedWord marked={step.marked} />”
          </>
        }
        spoken={LINES.word(step.word)}
        actions={<SlowSpeakButton word={step.word} />}
      >
        <ol className="progress feed-progress" aria-label={`${fedTotal} treats fed`}>
          {Array.from({ length: round.total }, (_, i) => (
            <li key={i} className={i < fedTotal ? 'is-done' : ''} />
          ))}
        </ol>
      </Headline>

      {message && (
        <div className="center-zone center-zone--top">
          <p className="notice" role="status">
            {message}
          </p>
        </div>
      )}

      <div className="feed-stage">
        <div
          key={treatId}
          ref={treatRef}
          className={`feed-treat feed-treat--${motion}`}
          style={{ '--to-x': `${mouthOffset.x}px`, '--to-y': `${mouthOffset.y}px` }}
        >
          {motion === 'eaten' && <Sparkles />}
          <Art src={sound.icon} alt={`${sound.treat} with the word ${step.word}`} className="feed-treat__img" />
          <span className="feed-treat__word" aria-hidden="true">
            <MarkedWord marked={step.marked} />
          </span>
        </div>
      </div>

      <div className="counter-front">
        <MicButton listening={listening} disabled={reaction !== null || motion !== 'float'} onPress={handleMic} />
      </div>
    </Scene>
  )
}
