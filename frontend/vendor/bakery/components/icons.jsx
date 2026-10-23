// Simple line icons. They take the color of the text around them.

function Icon({ children, size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const SpeakerIcon = (props) => (
  <Icon {...props}>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </Icon>
)

export const MicIcon = (props) => (
  <Icon {...props}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </Icon>
)

export const HomeIcon = (props) => (
  <Icon {...props}>
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
)

export const ArrowIcon = (props) => (
  <Icon {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Icon>
)

export const AgainIcon = (props) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 3 3 9 9 9" />
  </Icon>
)

export const CheckIcon = (props) => (
  <Icon {...props}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
)

export const TurtleIcon = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <ellipse cx="14" cy="18" rx="10" ry="7" fill="#7fb35a" />
    <path d="M6 18a8 6.5 0 0 1 16 0z" fill="#9fd48a" />
    <path d="M10 13.5l4 4.5 4-4.5M14 18v-6" stroke="#6a9a48" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <circle cx="26" cy="16" r="3.6" fill="#7fb35a" />
    <circle cx="27.2" cy="15.2" r="0.9" fill="#3d4828" />
    <rect x="7" y="22" width="3.4" height="4.5" rx="1.7" fill="#6a9a48" />
    <rect x="17.5" y="22" width="3.4" height="4.5" rx="1.7" fill="#6a9a48" />
    <path d="M4.5 19.5l-2.5 1.5" stroke="#6a9a48" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

// A hand mirror.
export const MirrorIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="9" r="6" />
    <path d="M12 15v7" />
    <path d="M9.5 7.5a3 3 0 0 1 2-1.5" />
  </Icon>
)

// A cupcake, for the treat shelf.
export const ShelfIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12h14l-2 9H7z" />
    <path d="M5 12a7 5 0 0 1 14 0" />
    <path d="M12 3v2" />
  </Icon>
)

// A small padlock, for the grown-ups-only button.
export const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)
