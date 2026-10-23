// Little sparkles that pop around the finished treat.

const SPOTS = [
  { x: '8%', y: '18%', size: 34, delay: 0 },
  { x: '86%', y: '10%', size: 42, delay: 0.15 },
  { x: '92%', y: '58%', size: 28, delay: 0.3 },
  { x: '2%', y: '62%', size: 26, delay: 0.45 },
  { x: '50%', y: '-4%', size: 30, delay: 0.6 },
]

export function Sparkles() {
  return (
    <div className="sparkles" aria-hidden="true">
      {SPOTS.map((spot, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={spot.size}
          height={spot.size}
          style={{ left: spot.x, top: spot.y, animationDelay: `${spot.delay}s` }}
        >
          <path d="M12 0C13 8 16 11 24 12 16 13 13 16 12 24 11 16 8 13 0 12 8 11 11 8 12 0Z" />
        </svg>
      ))}
    </div>
  )
}
