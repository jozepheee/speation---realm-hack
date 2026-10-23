// The child's treat shelf, opened from the start screen.

import { useEffect } from 'react'
import { ArrowIcon } from '../components/icons.jsx'
import { TreatShelf } from '../components/TreatShelf.jsx'
import { Button, Headline, Scene } from '../components/ui.jsx'
import { shelfIsFull } from '../game/shelf.js'
import { LINES } from '../speech/lines.js'
import { speak } from '../speech/speak.js'

export function ShelfScreen({ shelf, soundIds, onBake, onFeed, onBack }) {
  const empty = Object.values(shelf).every((count) => count === 0)
  const full = shelfIsFull(shelf, soundIds)
  const line = empty ? LINES.shelfEmpty : LINES.shelfOpen

  useEffect(() => {
    speak(line)
  }, [line])

  return (
    <Scene mood={empty ? 'encourage' : 'cheer'} says={empty ? 'Let’s bake!' : 'So many treats!'}>
      <Headline title="My treats" spoken={line} />

      <div className="center-zone center-zone--shelf">
        {full && <p className="shelf-ribbon">You baked them all! Feed the dragon unlocked!</p>}
        <TreatShelf shelf={shelf} />
      </div>

      <div className="counter-front">
        <Button variant="link" onClick={onBack}>
          Back
        </Button>
        {full ? (
          <Button variant="strong" onClick={onFeed}>
            Feed the dragon <ArrowIcon />
          </Button>
        ) : (
          <Button onClick={onBake}>
            Bake a treat <ArrowIcon />
          </Button>
        )}
      </div>
    </Scene>
  )
}
