// Listens for one word using the browser's built-in speech recognition.
// Works in Chrome and Edge. Safari works only if Dictation is turned on in
// macOS settings. Firefox, Brave, and Arc don't support it.
//
// Privacy: nothing is saved, uploaded by us, or logged. We only compare what
// was heard to the target word and then throw it away.
// Note: in Chrome, the browser itself sends audio to Google's speech service.
//
// Limitation: this checks WHICH word was heard, not how precisely the sound
// was made. It's a practice game, not a speech assessment.

const BrowserRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined

export const canRecognizeSpeech = Boolean(BrowserRecognition)

// Possible results (status):
//   'correct'      heard the target word
//   'missed'       heard speech, but not the target word
//   'no-speech'    heard nothing before the timeout
//   'mic-blocked'  the microphone permission is off
//   'no-mic'       the browser couldn't find a working microphone
//   'network'      the browser couldn't reach its speech service
//   'error'        something else went wrong
//   'cancelled'    we stopped listening on purpose
//
// isCorrect(options) decides if the browser's guesses count as the word
// (see src/game/wordCheck.js). options: [{ text, confidence }], best first.
//
// The promise resolves to { status, heard, confidence, heardOptions, code }.
// `heard` and `confidence` are the best guess (shown only in the ?debug panel).
// `heardOptions` is all of the browser's guesses, used to pick a coaching tip
// (src/game/coach.js). None of it is ever stored.
export function listenForWord(isCorrect, { timeoutMs = 8000 } = {}) {
  const recognition = new BrowserRecognition()
  recognition.lang = 'en-US'
  recognition.continuous = false
  // Interim results tell us the child is talking. We only judge the browser's
  // final answer, because early guesses are often "fixed" versions of the word.
  recognition.interimResults = true
  recognition.maxAlternatives = 5

  let finished = false
  let lastHeard = ''
  let lastOptions = []
  let lastGuesses = []
  let resolvePromise
  let timer

  const promise = new Promise((resolve) => {
    resolvePromise = resolve
  })

  function finish(status, code = '') {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try {
      recognition.abort()
    } catch {
      // Already stopped.
    }
    const confidence = lastGuesses[0]?.confidence ?? 0
    resolvePromise({ status, heard: lastHeard, confidence, heardOptions: lastOptions, code })
  }

  // Judge the latest guesses (or report that nothing was heard).
  function judge(code) {
    if (!lastGuesses.length) finish('no-speech', code)
    else finish(isCorrect(lastGuesses) ? 'correct' : 'missed', code)
  }

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const guesses = Array.from(result).map((alt) => ({ text: alt.transcript, confidence: alt.confidence }))
      if (guesses[0]?.text) {
        lastHeard = guesses[0].text
        lastGuesses = guesses
        lastOptions = guesses.map((guess) => guess.text)
      }
      if (result.isFinal) {
        judge('final')
        return
      }
    }
  }

  recognition.onerror = (event) => {
    const code = event.error
    if (code === 'not-allowed' || code === 'service-not-allowed') finish('mic-blocked', code)
    else if (code === 'no-speech') finish('no-speech', code)
    else if (code === 'audio-capture') finish('no-mic', code)
    else if (code === 'network') finish('network', code)
    else if (code === 'aborted') finish('cancelled', code)
    else finish('error', code)
  }

  // Ended or timed out without a final answer: judge the last early guess.
  recognition.onend = () => judge('ended')

  timer = setTimeout(() => judge('timeout'), timeoutMs)

  try {
    recognition.start()
  } catch (error) {
    finish('error', error?.name ?? 'start-failed')
  }

  return { promise, cancel: () => finish('cancelled') }
}
