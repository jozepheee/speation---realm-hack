// Shared building blocks: buttons, headlines, art pictures, and the bakery scene.

import { useState } from 'react'
import { splitMarked } from '../data/sounds.js'
import { SLOW, speak } from '../speech/speak.js'
import { Dragon } from './Dragon.jsx'
import { SpeakerIcon, TurtleIcon } from './icons.jsx'

// A big soft game button. variant: "primary" (lavender), "strong" (purple), or "link".
export function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button type="button" className={`btn btn--${variant} ${className}`} {...props}>
      {children}
    </button>
  )
}

// A round button with only an icon, so it always needs a label for screen readers.
export function IconButton({ label, className = '', children, ...props }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

// Reads `text` out loud. Every prompt gets one of these.
export function SpeakButton({ text, label = 'Hear it', className = '' }) {
  return (
    <IconButton label={label} className={`icon-btn--speak ${className}`} onClick={() => speak(text)}>
      <SpeakerIcon />
    </IconButton>
  )
}

// The turtle button: says just the word, extra slowly, so every part is clear.
export function SlowSpeakButton({ word, className = '' }) {
  return (
    <IconButton
      label={`Hear “${word}” slowly`}
      className={`icon-btn--turtle ${className}`}
      onClick={() => speak(word, { speed: SLOW })}
    >
      <TurtleIcon />
    </IconButton>
  )
}

// A word with the target-sound letters highlighted, from a marked word like '{c}a{k}e'.
export function MarkedWord({ marked }) {
  return splitMarked(marked).map((part, i) =>
    part.target ? (
      <span key={i} className="target-letter">
        {part.text}
      </span>
    ) : (
      part.text
    ),
  )
}

// The big title at the top of a screen, with a read-aloud button.
// `actions` are extra buttons next to it (like the turtle).
export function Headline({ small, title, spoken, actions, children }) {
  return (
    <header className="headline">
      {small && <p className="headline__small">{small}</p>}
      <div className="headline__row">
        <h1 className="headline__title">{title}</h1>
        {spoken && <SpeakButton text={spoken} label="Hear it all" />}
        {actions}
      </div>
      {children}
    </header>
  )
}

// Shows an image from public/assets. If the file is missing, it shows a
// soft placeholder with the file name, so it's clear what art is needed.
export function Art({ src, alt, className = '', placeholderLabel }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const missing = !src || failedSrc === src

  if (missing) {
    const fileName = placeholderLabel ?? src?.split('/').pop() ?? 'image coming soon'
    return (
      <div className={`art-placeholder ${className}`} role="img" aria-label={alt}>
        <span>{fileName}</span>
      </div>
    )
  }

  return (
    <img className={`art ${className}`} src={src} alt={alt} draggable="false" onError={() => setFailedSrc(src)} />
  )
}

// The bakery, in layers: wall, dragon (behind the counter), counter, then the game UI.
// `says` puts a little speech bubble next to the dragon's head.
export function Scene({ mood = 'idle', says, calm = false, dragonPlace = 'left', children }) {
  return (
    <main className={`scene ${calm ? 'scene--calm' : ''} scene--dragon-${dragonPlace}`}>
      <div className="scene__wall" aria-hidden="true" />
      <div className="scene__dragon">
        <Dragon mood={mood} />
        {says && (
          <p className="dragon-says" role="status" key={says}>
            {says}
          </p>
        )}
      </div>
      <div className="scene__counter" aria-hidden="true" />
      <div className="scene__ui">{children}</div>
    </main>
  )
}
