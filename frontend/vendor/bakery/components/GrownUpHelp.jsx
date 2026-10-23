// "Grown-up help" on the sound practice screen.
// Kids can't skip practice on their own. A grown-up can open this, press and
// hold to prove they're a grown-up, then let the child keep baking.

import { useEffect, useRef, useState } from 'react'
import { Button } from './ui.jsx'

const HOLD_MS = 3000

export function GrownUpHelp({ highlight, onBakeAnyway }) {
  const dialogRef = useRef(null)
  const [unlocked, setUnlocked] = useState(false)

  function open() {
    setUnlocked(false)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  function bakeAnyway() {
    close()
    onBakeAnyway()
  }

  return (
    <>
      <button type="button" className={`grownup-link ${highlight ? 'grownup-link--highlight' : ''}`} onClick={open}>
        Grown-up help
      </button>

      <dialog ref={dialogRef} className="grownup-dialog" aria-labelledby="grownup-title">
        <h2 id="grownup-title">For grown-ups</h2>
        <p>
          If this sound is still tricky, your child can keep baking and practice it again later. Practice works best
          when it stays fun.
        </p>
        {unlocked ? (
          <Button variant="strong" onClick={bakeAnyway}>
            Let’s bake anyway
          </Button>
        ) : (
          <HoldButton onDone={() => setUnlocked(true)} />
        )}
        <Button variant="link" onClick={close}>
          Keep practicing
        </Button>
      </dialog>
    </>
  )
}

// A button that only works when pressed and held for 3 seconds,
// so a young child doesn't open it by accident.
function HoldButton({ onDone }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef(null)

  function start() {
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      onDone()
    }, HOLD_MS)
  }

  function stop() {
    clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  function onKeyDown(event) {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault()
      start()
    }
  }

  return (
    <button
      type="button"
      className={`hold-btn ${holding ? 'is-holding' : ''}`}
      style={{ '--hold-ms': `${HOLD_MS}ms` }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onKeyUp={stop}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hold-btn__fill" aria-hidden="true" />
      <span className="hold-btn__label">{holding ? 'Keep holding…' : 'Press and hold for 3 seconds'}</span>
    </button>
  )
}
