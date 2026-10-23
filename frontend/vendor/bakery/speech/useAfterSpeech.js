// Runs something after the dragon finishes talking (and at least `minMs` has
// passed), so moving to the next step never cuts the voice off mid-sentence.
//
//   const afterSpeech = useAfterSpeech()
//   afterSpeech(speak(LINES.stepCheer), 1500, onCorrect)
//
// If the screen closes first, or afterSpeech is called again, the earlier
// callback is skipped.

import { useCallback, useEffect, useRef } from 'react'

export function useAfterSpeech() {
  const latest = useRef(0)

  // Screen closed: skip anything still waiting.
  useEffect(() => () => void latest.current++, [])

  return useCallback((speech, minMs, callback) => {
    const mine = ++latest.current
    const wait = new Promise((resolve) => setTimeout(resolve, minMs))
    Promise.all([speech, wait]).then(() => {
      if (latest.current === mine) callback()
    })
  }, [])
}
