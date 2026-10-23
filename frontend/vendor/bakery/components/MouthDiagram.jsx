// A side view of a mouth showing where the tongue goes for each sound.
// Facing right: the lips are on the right, the throat is on the left.
// The purple dot marks the spot to aim for. Blue lines show the air or voice.
//
// DRAFT teaching picture. Please have an SLP look it over.

const SKIN = '#ffd9bf'
const INSIDE = '#f9cdd4'
const GUM = '#f1a9b6'
const LIP = '#f28c9e'
const TONGUE = '#ef7d8f'
const TONGUE_TOP = '#f598a7'
const AIR = '#5fa8dc'

const SHAPES = {
  S: {
    label: 'Mouth picture for S: lips smiling, teeth close, tongue tip lifted just behind the top teeth, air blowing out.',
    jaw: 0,
    upperLip: { cx: 252, cy: 114, rx: 13, ry: 12 },
    lowerLip: { cx: 251, cy: 168, rx: 13, ry: 12 },
    tongue:
      'M44 205 Q58 150 120 140 Q178 132 204 108 Q213 99 220 107 Q216 124 202 150 Q192 170 198 192 Q140 206 44 205 Z',
    tongueTop: 'M80 160 Q130 140 190 122',
    dot: { x: 214, y: 94 },
  },
  R: {
    label: 'Mouth picture for R: lips a little round, tongue pulled back and bunched up, tip not touching, voice on.',
    jaw: 4,
    upperLip: { cx: 262, cy: 112, rx: 16, ry: 16 },
    lowerLip: { cx: 260, cy: 176, rx: 16, ry: 16 },
    tongue:
      'M44 205 Q56 140 110 112 Q150 94 178 110 Q191 118 185 129 Q176 136 182 150 Q196 172 200 194 Q140 207 44 205 Z',
    tongueTop: 'M78 150 Q120 110 170 108',
    dot: { x: 166, y: 104 },
  },
  K: {
    label: 'Mouth picture for K: mouth a little open, tongue tip down behind the bottom teeth, back of the tongue lifted to the back of the roof of the mouth.',
    jaw: 12,
    upperLip: { cx: 256, cy: 112, rx: 14, ry: 14 },
    lowerLip: { cx: 254, cy: 184, rx: 14, ry: 14 },
    tongue:
      'M44 205 Q46 118 78 76 Q100 58 122 74 Q160 110 200 150 Q215 158 222 166 Q220 182 200 194 Q140 207 44 205 Z',
    tongueTop: 'M70 120 Q92 76 116 80',
    dot: { x: 100, y: 64 },
  },
}

export function MouthDiagram({ soundId }) {
  const shape = SHAPES[soundId] ?? SHAPES.S
  const jaw = shape.jaw

  return (
    <svg className="mouth-diagram" viewBox="0 0 320 260" role="img" aria-label={shape.label}>
      <rect x="0" y="0" width="320" height="260" rx="28" fill="#fff4e8" />

      {/* nose and chin */}
      <path d="M232 36 Q262 36 274 80 Q278 94 262 96 L236 94 Z" fill={SKIN} />
      <g transform={`translate(0 ${jaw})`}>
        <path d="M238 192 Q270 198 268 234 Q252 252 236 244 Z" fill={SKIN} />
      </g>

      {/* inside of the mouth */}
      <path d="M20 68 Q60 58 110 60 Q170 56 210 86 L234 100 L234 196 Q170 210 20 212 Z" fill={INSIDE} />

      {/* roof of the mouth (with the bumpy ridge behind the top teeth) */}
      <path
        d="M20 40 Q70 30 115 36 Q178 32 216 74 L238 92 L238 102 L232 100 L210 88 Q170 58 110 62 Q60 60 20 70 Z"
        fill={GUM}
      />

      {/* bottom of the mouth, teeth, and lips move with the jaw */}
      <g transform={`translate(0 ${jaw})`}>
        <path d="M20 210 Q170 210 234 194 L242 198 L242 222 Q170 234 20 232 Z" fill={GUM} />
        <rect x="222" y="150" width="18" height="32" rx="7" fill="#ffffff" stroke="#eadfd5" strokeWidth="2" />
        <ellipse {...shape.lowerLip} fill={LIP} />
      </g>
      <rect x="225" y="96" width="18" height="34" rx="7" fill="#ffffff" stroke="#eadfd5" strokeWidth="2" />
      <ellipse {...shape.upperLip} fill={LIP} />

      {/* tongue */}
      <path d={shape.tongue} fill={TONGUE} transform={`translate(0 ${soundId === 'K' ? 0 : jaw / 2})`} />
      <path d={shape.tongueTop} fill="none" stroke={TONGUE_TOP} strokeWidth="8" strokeLinecap="round" />

      {/* where to aim */}
      <circle className="mouth-diagram__ring" cx={shape.dot.x} cy={shape.dot.y} r="13" fill="none" stroke="#7c4ddb" strokeWidth="4" />
      <circle cx={shape.dot.x} cy={shape.dot.y} r="6" fill="#7c4ddb" />

      {/* air and voice */}
      {soundId === 'S' && (
        <g fill="none" stroke={AIR} strokeWidth="5" strokeLinecap="round">
          <path className="mouth-diagram__air" d="M236 140 Q256 132 274 140 T308 138" />
          <path d="M298 128 L310 138 L298 148" />
        </g>
      )}
      {soundId === 'K' && (
        <g stroke={AIR} strokeWidth="5" strokeLinecap="round" className="mouth-diagram__pop">
          <path d="M282 150 L304 140" />
          <path d="M284 160 L308 160" />
          <path d="M282 170 L304 180" />
        </g>
      )}
      {soundId === 'R' && (
        <g fill="none" stroke={AIR} strokeWidth="5" strokeLinecap="round" className="mouth-diagram__hum">
          <path d="M286 128 Q298 144 286 160" />
          <path d="M298 120 Q314 144 298 168" />
          <path d="M30 120 L40 130 L30 140 L40 150 L30 160" />
        </g>
      )}
    </svg>
  )
}
