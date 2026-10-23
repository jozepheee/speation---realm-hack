import { ArrowIcon, CheckIcon } from '../components/icons.jsx'
import { Art, Button, Headline, Scene } from '../components/ui.jsx'
import { SOUNDS, SOUND_ORDER } from '../data/sounds.js'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'

const QUESTION = LINES.pickQuestion

// soundIds: the sounds a grown-up turned on (all three by default).
export function PickSoundScreen({ soundId, soundIds = SOUND_ORDER, onPick, onConfirm }) {
  function pick(sound) {
    onPick(sound.id)
    speak(LINES.soundExample(sound))
  }

  return (
    <Scene mood="idle">
      <Headline title={QUESTION} spoken={QUESTION} />

      <div className="center-zone">
        <div className="sound-cards" role="radiogroup" aria-label="Practice sound">
          {soundIds.map((id) => {
            const sound = SOUNDS[id]
            const selected = id === soundId
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`sound-card ${selected ? 'is-selected' : ''}`}
                onClick={() => pick(sound)}
              >
                {selected && (
                  <span className="sound-card__check" aria-hidden="true">
                    <CheckIcon size={20} />
                  </span>
                )}
                <Art src={sound.icon} alt="" className="sound-card__icon" />
                <span className="sound-card__letter">{sound.letter}</span>
                <span className="sound-card__example">like in “{sound.exampleWord}”</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="counter-front">
        <Button onClick={onConfirm}>
          Let’s bake <ArrowIcon />
        </Button>
      </div>
    </Scene>
  )
}
