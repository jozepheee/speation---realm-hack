// Text for the grown-up corner only. Kid screens never show this.
// Keep it friendly and plain, encourage working with an SLP, and make no
// medical claims. Every link here was checked and works.

// What each kind of near miss means, in plain words.
export const SWAP_LABELS = {
  R: { w: 'R sounded like W (like “way” for “ray”)', l: 'R sounded like L (like “lay” for “ray”)' },
  S: {
    th: 'S sounded like TH (like “thee” for “see”)',
    sh: 'S sounded like SH (like “she” for “see”)',
    t: 'S sounded like T (like “tea” for “see”)',
    missing: 'The S was left off (like “nap” for “snap”)',
  },
  K: {
    t: 'K sounded like T (like “tea” for “key”)',
    missing: 'The K was left off (like “up” for “cup”)',
  },
}

export const GROWN_UP_NOTE =
  'This shows how practice went in the game. It isn’t a speech test, and the game can mishear children. ' +
  'If you have questions about your child’s speech, a speech-language pathologist (SLP) is the best person to ask.'

export const PRIVACY_NOTE =
  'Everything here is saved only on this device. The game never records or saves your child’s voice.'

export const RESOURCES = [
  {
    title: 'Speech sound disorders',
    source: 'ASHA (American Speech-Language-Hearing Association)',
    url: 'https://www.asha.org/public/speech/disorders/speech-sound-disorders/',
    about: 'What they are, signs to look for, and how SLPs help.',
  },
  {
    title: 'Communication milestones',
    source: 'ASHA',
    url: 'https://www.asha.org/public/developmental-milestones/communication-milestones/',
    about: 'What to expect at each age, from birth to 5.',
  },
  {
    title: 'Find a speech-language pathologist',
    source: 'ASHA ProFind',
    url: 'https://find.asha.org/pro/',
    about: 'Search for certified SLPs near you.',
  },
  {
    title: 'Speech and language developmental milestones',
    source: 'NIDCD (National Institutes of Health)',
    url: 'https://www.nidcd.nih.gov/health/speech-and-language',
    about: 'How speech and language develop, and who to contact with concerns.',
  },
]
