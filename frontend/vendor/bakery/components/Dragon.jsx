// The dragon mascot. mood: idle | listening | cheer | confused | encourage | yum
//
// The body is our teammate's drawing with the painted face removed
// (assets/dragon/body/dragon-body-faceless.png). The face is drawn on top in
// the same style, so it can change with each mood and blink.
// If the team draws their own face pieces or finishes the Rive animation,
// swap them in HERE. Screens only pass a mood, so they won't need to change.

const INK = '#3d4828'
const MOUTH_INSIDE = '#7a3a3f'
const TONGUE = '#f07a8a'

// Each mood picks eyes, brows, and a mouth.
const FACES = {
  idle: { eyes: 'open', brows: 'relaxed', mouth: 'smile' },
  listening: { eyes: 'up', brows: 'raised', mouth: 'ooh' },
  cheer: { eyes: 'happy', brows: 'raised', mouth: 'open' },
  confused: { eyes: 'puzzled', brows: 'puzzled', mouth: 'wavy' },
  encourage: { eyes: 'open', brows: 'raised', mouth: 'smile' },
  yum: { eyes: 'happy', brows: 'raised', mouth: 'open' },
}

export function Dragon({ mood = 'idle', className = '' }) {
  const face = FACES[mood] ?? FACES.idle

  return (
    <div className={`dragon dragon--${mood} ${className}`}>
      <div className="dragon__body">
        <img className="dragon__img" src="/bakery/assets/dragon/body/dragon-body-faceless.png" alt="" draggable="false" />
        <svg className="dragon__face" viewBox="0 0 806 1015" aria-hidden="true">
          {/* The head is tilted slightly, so the face is drawn level and rotated to match. */}
          <g transform="rotate(-9.3 532 345)">
            <Eyes kind={face.eyes} />
            <Brows kind={face.brows} />
            <Mouth kind={face.mouth} />
          </g>
        </svg>
      </div>
      {mood === 'yum' && (
        <div className="hearts" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {mood === 'confused' && (
        <span className="dragon__thought" aria-hidden="true">
          ?
        </span>
      )}
    </div>
  )
}

function Eyes({ kind }) {
  if (kind === 'happy') {
    return (
      <g fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round">
        <path d="M402 352 Q430 312 458 352" />
        <path d="M607 352 Q635 312 663 352" />
      </g>
    )
  }
  if (kind === 'puzzled') {
    return (
      <g fill={INK} className="dragon__blink">
        <ellipse cx="430" cy="336" rx="24" ry="43" />
        <ellipse cx="635" cy="346" rx="22" ry="32" />
      </g>
    )
  }
  const lift = kind === 'up' ? -10 : 0
  return (
    <g fill={INK} className="dragon__blink">
      <ellipse cx="430" cy={340 + lift} rx="24" ry="43" />
      <ellipse cx="635" cy={340 + lift} rx="24" ry="43" />
    </g>
  )
}

function Brows({ kind }) {
  const common = { fill: 'none', stroke: INK, strokeWidth: 7, strokeLinecap: 'round' }
  if (kind === 'puzzled') {
    return (
      <g {...common}>
        <path d="M398 236 Q422 214 448 230" />
        <path d="M620 270 Q646 264 672 258" />
      </g>
    )
  }
  const up = kind === 'raised' ? -14 : 0
  return (
    <g {...common} transform={`translate(0 ${up})`}>
      <path d="M400 258 Q423 240 447 254" />
      <path d="M623 254 Q647 240 670 258" />
    </g>
  )
}

function Mouth({ kind }) {
  if (kind === 'open') {
    return (
      <g>
        <path d="M498 386 Q540 380 582 386 Q578 446 540 448 Q502 446 498 386 Z" fill={MOUTH_INSIDE} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        <ellipse cx="540" cy="432" rx="24" ry="12" fill={TONGUE} />
      </g>
    )
  }
  if (kind === 'ooh') {
    return <ellipse cx="540" cy="402" rx="14" ry="17" fill={MOUTH_INSIDE} stroke={INK} strokeWidth="6" />
  }
  if (kind === 'wavy') {
    return (
      <path d="M510 404 Q520 394 530 404 T550 404 T570 404" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    )
  }
  return <path d="M510 392 Q541 420 572 392" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
}
