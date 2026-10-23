// A simple "grown-ups only" check before the grown-up corner: an addition
// problem a young child can't easily answer. It only stops accidental taps.
// It isn't a password, and nothing is saved.

import { useEffect, useRef, useState } from 'react'
import { Button } from './ui.jsx'

function newQuestion() {
  const a = 11 + Math.floor(Math.random() * 9)
  const b = 3 + Math.floor(Math.random() * 7)
  return { a, b }
}

export function GrownUpGate({ open, onPass, onCancel }) {
  const dialogRef = useRef(null)
  const [question, setQuestion] = useState(newQuestion)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function reset() {
    setQuestion(newQuestion())
    setAnswer('')
    setWrong(false)
  }

  function submit(event) {
    event.preventDefault()
    if (Number(answer) === question.a + question.b) {
      reset()
      onPass()
    } else {
      setWrong(true)
      setQuestion(newQuestion())
      setAnswer('')
    }
  }

  function cancel() {
    reset()
    onCancel()
  }

  return (
    <dialog ref={dialogRef} className="grownup-dialog" aria-labelledby="gate-title" onCancel={cancel}>
      <h2 id="gate-title">Grown-ups only</h2>
      <form className="gate-form" onSubmit={submit}>
        <label htmlFor="gate-answer">
          What is {question.a} + {question.b}?
        </label>
        <input
          id="gate-answer"
          className="gate-input"
          inputMode="numeric"
          autoComplete="off"
          value={answer}
          onChange={(event) => setAnswer(event.target.value.replace(/\D/g, '').slice(0, 3))}
        />
        {wrong && (
          <p className="gate-wrong" role="alert">
            That’s not it. Here’s a new one.
          </p>
        )}
        <Button variant="strong" type="submit" disabled={!answer}>
          Open
        </Button>
      </form>
      <Button variant="link" onClick={cancel}>
        Back to the game
      </Button>
    </dialog>
  )
}
