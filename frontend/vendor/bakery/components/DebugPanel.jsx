// Shows the last speech try when the address has ?debug. For testing only.

import { useEffect, useState } from 'react'
import { emptyShelf, setShelf } from '../game/shelf.js'
import { DEBUG_ON } from '../speech/debug.js'
import { R_MIN, W_MAX } from '../speech/rSoundCheck.js'
import { canRecognizeSpeech } from '../speech/recognition.js'

// onSetShelf: lets testers fill or clear the treat shelf for a quick demo.
export function DebugPanel({ onSetShelf }) {
  const [last, setLast] = useState(null)

  useEffect(() => {
    if (!DEBUG_ON) return
    const onDebug = (event) => setLast(event.detail)
    window.addEventListener('speakery-debug', onDebug)
    return () => window.removeEventListener('speakery-debug', onDebug)
  }, [])

  if (!DEBUG_ON) return null

  return (
    <aside className="debug" aria-label="Speech test info">
      <strong>Speech test</strong>
      <span>Browser can listen: {canRecognizeSpeech ? 'yes' : 'no'}</span>
      {last ? (
        <>
          <span>Wanted: {last.target}</span>
          <span>Heard: {last.heard || '(nothing)'}</span>
          <span>Sure: {last.confidence ? `${Math.round(last.confidence * 100)}%` : 'unknown'}</span>
          {last.rCheck && (
            <span>
              R check: {last.rCheck.verdict} (score {last.rCheck.score ?? '?'}; W ≤ {W_MAX}, R ≥ {R_MIN})
            </span>
          )}
          <span>
            Result: {last.status}
            {last.code ? ` (${last.code})` : ''}
          </span>
        </>
      ) : (
        <span>Tap the mic to test.</span>
      )}
      <span>
        Shelf:{' '}
        <button type="button" onClick={() => onSetShelf(setShelf({ ...emptyShelf(), R: 1, S: 1 }))}>
          R + S baked
        </button>{' '}
        <button type="button" onClick={() => onSetShelf(setShelf(emptyShelf()))}>
          Clear
        </button>
      </span>
    </aside>
  )
}
