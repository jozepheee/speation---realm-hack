// The grown-up corner: how practice is going, which sounds to practice,
// and trusted resources. Only reachable through the grown-ups-only check.
// Kid screens never show any of this.

import { useState } from 'react'
import { Art, Button } from '../components/ui.jsx'
import { GROWN_UP_NOTE, PRIVACY_NOTE, RESOURCES, SWAP_LABELS } from '../data/grownUps.js'
import { SOUND_ORDER, SOUNDS } from '../data/sounds.js'
import { clearProgress, loadProgress, summarize } from '../game/progress.js'

function formatTime(seconds) {
  if (seconds < 60) return seconds > 0 ? 'Under a minute' : 'None yet'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

function formatDay(day) {
  if (!day) return 'Not yet'
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const daysAgo = Math.round((new Date().setHours(0, 0, 0, 0) - date) / 86400000)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function GrownUpScreen({ settings, onToggleSound, onClose }) {
  const [summary, setSummary] = useState(() => summarize(loadProgress()))
  const [confirmingClear, setConfirmingClear] = useState(false)
  const anyPractice = summary.perSound.some((s) => s.tries > 0)
  const focus = summary.mostPractice ? SOUNDS[summary.mostPractice] : null
  const focusStats = summary.perSound.find((s) => s.id === summary.mostPractice)

  function clear() {
    if (!confirmingClear) return setConfirmingClear(true)
    clearProgress()
    setConfirmingClear(false)
    setSummary(summarize(loadProgress()))
  }

  return (
    <main className="grownups">
      <div className="grownups__page">
        <header className="grownups__header">
          <div>
            <p className="grownups__kicker">For parents and caregivers</p>
            <h1>Grown-up corner</h1>
          </div>
          <Button variant="strong" onClick={onClose}>
            Back to the game
          </Button>
        </header>

        <p className="grownups__note">{GROWN_UP_NOTE}</p>

        {/* At a glance */}
        <section className="gu-card gu-glance" aria-label="At a glance">
          <div>
            <span className="gu-glance__label">Total practice time</span>
            <strong className="gu-glance__value">{formatTime(summary.totalSeconds)}</strong>
          </div>
          <div>
            <span className="gu-glance__label">Needed the most practice</span>
            <strong className="gu-glance__value">
              {focus ? `${focus.letter} (${focus.guide.nickname})` : anyPractice ? 'Not enough tries yet' : 'No practice yet'}
            </strong>
          </div>
        </section>

        {focus && (
          <p className="gu-tip">
            <strong>{focus.letter}</strong> took the most extra tries per word
            {focusStats.topSwap && (
              <>
                , and the most common mix-up was <strong>{SWAP_LABELS[focus.id][focusStats.topSwap.swap]}</strong>
              </>
            )}
            . A few minutes of {focus.letter} practice could help, and it’s worth mentioning to your child’s SLP.
          </p>
        )}

        {/* One card per sound */}
        <h2 className="grownups__h2">By sound</h2>
        <div className="gu-sounds">
          {summary.perSound.map((stats) => {
            const sound = SOUNDS[stats.id]
            const isFocus = stats.id === summary.mostPractice
            const swapLabel = stats.topSwap ? SWAP_LABELS[stats.id][stats.topSwap.swap] : null
            return (
              <article key={stats.id} className={`gu-card gu-sound ${isFocus ? 'gu-sound--focus' : ''}`}>
                <header className="gu-sound__head">
                  <Art src={sound.icon} alt="" className="gu-sound__icon" />
                  <div>
                    <h3>
                      {sound.letter} <span>{sound.guide.nickname}</span>
                    </h3>
                    {isFocus && <span className="gu-badge">Most practice needed</span>}
                  </div>
                </header>
                {stats.tries === 0 ? (
                  <p className="gu-sound__empty">Not practiced yet.</p>
                ) : (
                  <dl className="gu-stats">
                    <dt>Time practiced</dt>
                    <dd>{formatTime(stats.seconds)}</dd>
                    <dt>Words said right</dt>
                    <dd>{stats.correct}</dd>
                    <dt>Extra tries</dt>
                    <dd>{stats.extraTries}</dd>
                    <dt>Trickiest word</dt>
                    <dd>{stats.trickiestWord ? `“${stats.trickiestWord}”` : 'None so far'}</dd>
                    <dt>Most common mix-up</dt>
                    <dd>{swapLabel ? `${swapLabel} (${stats.topSwap.count}×)` : 'None heard'}</dd>
                    <dt>Last practiced</dt>
                    <dd>{formatDay(stats.lastPlayed)}</dd>
                  </dl>
                )}
              </article>
            )
          })}
        </div>
        {summary.feedSeconds > 0 && (
          <p className="gu-small">Bonus game (Feed the dragon): {formatTime(summary.feedSeconds)}</p>
        )}

        {/* Settings */}
        <h2 className="grownups__h2">Sounds to practice</h2>
        <section className="gu-card">
          <p className="gu-small">Choose which sounds your child sees. At least one stays on.</p>
          <div className="gu-toggles">
            {SOUND_ORDER.map((id) => {
              const sound = SOUNDS[id]
              const on = settings.sounds.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className={`gu-toggle ${on ? 'gu-toggle--on' : ''}`}
                  onClick={() => onToggleSound(id)}
                >
                  <span className="gu-toggle__dot" aria-hidden="true" />
                  {sound.letter}: {sound.treat}
                </button>
              )
            })}
          </div>
        </section>

        {/* Resources */}
        <h2 className="grownups__h2">Helpful resources</h2>
        <ul className="gu-resources">
          {RESOURCES.map((r) => (
            <li key={r.url} className="gu-card">
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.title}
              </a>
              <span className="gu-resources__source">{r.source}</span>
              <span>{r.about}</span>
            </li>
          ))}
        </ul>

        {/* Privacy */}
        <section className="gu-card gu-privacy">
          <p>{PRIVACY_NOTE}</p>
          <Button variant="link" onClick={clear}>
            {confirmingClear ? 'Tap again to clear all progress' : 'Clear progress'}
          </Button>
        </section>
      </div>
    </main>
  )
}
