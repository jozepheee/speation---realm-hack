// Counts how long the child spends practicing, for the grown-up corner.
// bucket: a sound id ('R', 'S', 'K'), 'feed', or null (not practicing).
// Only counts while the game is on screen (not when the tab is hidden).

import { useEffect } from 'react'
import { addTime } from './progress.js'
import {currentLearnerScope} from './storage'

export function usePracticeTimer(bucket) {
  useEffect(() => {
    if (!bucket) return
    const scope=currentLearnerScope()
    let startedAt = document.hidden ? null : Date.now()

    function stop() {
      if (startedAt === null) return
      addTime(bucket, (Date.now() - startedAt) / 1000,scope)
      startedAt = null
    }
    function onVisibility() {
      if (document.hidden) stop()
      else startedAt = Date.now()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', stop)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', stop)
    }
  }, [bucket])
}
