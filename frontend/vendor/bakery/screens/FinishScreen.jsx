import { useEffect } from 'react'
import { Sparkles } from '../components/Sparkles.jsx'
import { TreatShelf } from '../components/TreatShelf.jsx'
import { AgainIcon } from '../components/icons.jsx'
import { Art, Button, Headline, Scene } from '../components/ui.jsx'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'
import { useAfterSpeech } from '../speech/useAfterSpeech.js'
import { shelfIsFull } from '../game/shelf.js'

// Two moments on one screen: celebrate the treat, then give it to the dragon.
// After giving it, the treat goes on the child's shelf.
// justFilled: this treat was the last one missing from the shelf.
export function FinishScreen({ sound, treatGiven, shelf, soundIds, justFilled, onGive, onPlayAgain, onFeed }) {
  const finalImage = sound.steps[sound.steps.length - 1].image
  const cheer = LINES.finishCheer(sound)
  const thanks = LINES.finishThanks(sound)

  const afterSpeech = useAfterSpeech()

  useEffect(() => {
    if (!treatGiven) {
      speak(cheer)
      return
    }
    // "Thank you!", then point at the shelf.
    afterSpeech(speak(thanks), 300, () => speak(justFilled ? LINES.shelfFull : LINES.shelfAdded))
  }, [treatGiven, thanks, cheer, justFilled, afterSpeech])

  return (
    <Scene mood={treatGiven ? 'yum' : 'cheer'} says={treatGiven ? 'Yum! Thank you!' : 'Is that for me?'}>
      {treatGiven ? (
        <Headline title="Yum! Thank you!" spoken={thanks} />
      ) : (
        <Headline small="Amazing!" title={sound.finishLine} spoken={cheer} />
      )}

      {treatGiven && (
        <div className="center-zone center-zone--shelf">
          {justFilled && <p className="shelf-ribbon">You baked them all! Feed the dragon unlocked!</p>}
          <TreatShelf shelf={shelf} newSoundId={sound.id} />
        </div>
      )}

      {!treatGiven && (
        <button type="button" className="on-counter give" onClick={onGive} aria-label={`Give the ${sound.treat} to the dragon`}>
          <Sparkles />
          <Art src={finalImage} alt="" className="treat__img" />
        </button>
      )}

      <div className="counter-front">
        {treatGiven ? (
          <>
            <Button onClick={onPlayAgain}>
              <AgainIcon /> Bake another treat
            </Button>
            {shelfIsFull(shelf, soundIds) && (
              <Button variant="strong" onClick={onFeed}>
                Feed the dragon
              </Button>
            )}
          </>
        ) : (
          <p className="counter-hint">Tap the {sound.treat} to give it to the dragon</p>
        )}
      </div>
    </Scene>
  )
}
