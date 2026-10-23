import { useState } from 'react'
import { GrownUpGate } from '../components/GrownUpGate.jsx'
import { ArrowIcon, LockIcon, ShelfIcon } from '../components/icons.jsx'
import { Button, Scene } from '../components/ui.jsx'

export function StartScreen({ onStart, onOpenShelf, onOpenGrownUps }) {
  const [gateOpen, setGateOpen] = useState(false)

  return (
    <Scene mood="idle" dragonPlace="center">
      <header className="hero">
        <h1 className="hero__title">The Speakery</h1>
        <p className="hero__tagline">Say the magic words to bake yummy treats.</p>
      </header>
      <div className="counter-front">
        <Button onClick={onStart} className="btn--xl">
          Start <ArrowIcon size={32} />
        </Button>
        <Button onClick={onOpenShelf}>
          <ShelfIcon /> My treats
        </Button>
      </div>

      {/* Tucked in the corner on purpose: it's for grown-ups. */}
      <button type="button" className="corner-grownups" onClick={() => setGateOpen(true)}>
        <LockIcon size={16} /> Grown-ups
      </button>
      <GrownUpGate
        open={gateOpen}
        onPass={() => {
          setGateOpen(false)
          onOpenGrownUps()
        }}
        onCancel={() => setGateOpen(false)}
      />
    </Scene>
  )
}
