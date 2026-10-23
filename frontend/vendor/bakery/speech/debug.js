// Testing helper. Add ?debug to the address (http://localhost:5173/?debug)
// to see what the speech recognizer heard on each try.
// Nothing is saved or logged. It only shows the latest try on screen.

export const DEBUG_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

export function showDebug(info) {
  if (!DEBUG_ON) return
  window.dispatchEvent(new CustomEvent('speakery-debug', { detail: info }))
}
