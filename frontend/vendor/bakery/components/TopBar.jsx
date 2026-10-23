// The strip across the top: home button and baking progress.
// The practice book and grown-up buttons go on the right once those screens exist.

import { HomeIcon } from './icons.jsx'
import { IconButton } from './ui.jsx'

export function TopBar({ onHome, totalSteps = 0, doneSteps = 0 }) {
  return (
    <header className="topbar">
      {onHome ? (
        <IconButton label="Back to the start" onClick={onHome}>
          <HomeIcon />
        </IconButton>
      ) : (
        <span />
      )}

      {totalSteps > 0 ? (
        <ol className="progress" aria-label={`Step ${Math.min(doneSteps + 1, totalSteps)} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <li
              key={i}
              className={i < doneSteps ? 'is-done' : i === doneSteps ? 'is-now' : ''}
            />
          ))}
        </ol>
      ) : (
        <span />
      )}

      <span />
    </header>
  )
}
