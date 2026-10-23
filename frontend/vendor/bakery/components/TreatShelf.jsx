// A wooden shelf with a spot for each treat (R, S, K).
// Baked treats sit on it. Spots not baked yet show a faded outline.

import { SOUND_ORDER, SOUNDS } from '../data/sounds.js'
import { Sparkles } from './Sparkles.jsx'
import { Art } from './ui.jsx'

// newSoundId: the treat that was just added, so it can bounce in.
export function TreatShelf({ shelf, newSoundId = null }) {
  return (
    <section className="treat-shelf" aria-label="Your treat shelf">
      <ul className="treat-shelf__row">
        {SOUND_ORDER.map((id) => {
          const sound = SOUNDS[id]
          const count = shelf[id] ?? 0
          const baked = count > 0
          const isNew = id === newSoundId
          return (
            <li
              key={id}
              className={`treat-shelf__spot ${baked ? '' : 'treat-shelf__spot--empty'} ${isNew ? 'treat-shelf__spot--new' : ''}`}
            >
              <div className="treat-shelf__treat">
                {isNew && <Sparkles />}
                <Art src={sound.icon} alt={baked ? sound.treat : `${sound.treat}, not baked yet`} />
                {count > 1 && (
                  <span className="treat-shelf__count" aria-label={`${count} baked`}>
                    ×{count}
                  </span>
                )}
              </div>
              <span className="treat-shelf__tag" aria-hidden="true">
                {sound.letter}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="treat-shelf__plank" aria-hidden="true" />
    </section>
  )
}
