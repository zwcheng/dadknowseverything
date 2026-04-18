// The core response shape. Every utterance produces all three options
// simultaneously so the parent can choose mid-glance, hands-free.
//
// - defensive: direct, factually-grounded answer. Academic / highfalutin / groan-worthy tone.
// - offensive: grounded counter-question that flips the onus back on the child. Same tone.
// - escape:    goofy, obviously-invented exit line that derails into laughter. Giddy tone.

export type Topic = 'nature' | 'space' | 'body' | 'animals' | 'everyday';

export interface Question {
  text: string;
  topic: Topic;
  defensive: string;  // <= 48 chars
  offensive: string;  // <= 48 chars
  escape: string;     // <= 48 chars
}

// Canned triads used in stage mode (no network) and as the offline
// fallback when audio is too short or Gemini fails. Keep them short and
// on-brand for each lane.
export const DEMO_QUESTIONS: Question[] = [
  {
    text: 'Why is the moon out in the daytime?',
    topic: 'space',
    defensive: 'The moon\u2019s orbit places it above us by day too.',
    offensive: 'And by what metric does day exclude the moon?',
    escape: 'The moon moonlights as a giant sleeping pigeon.',
  },
  {
    text: 'Why are some leaves still on the tree?',
    topic: 'nature',
    defensive: 'Sheltered limbs retain foliage; wind misses them.',
    offensive: 'And which of us, exactly, issued the falling order?',
    escape: 'Those leaves signed a multi-year contract with the bark.',
  },
  {
    text: 'Why do bananas turn brown?',
    topic: 'everyday',
    defensive: 'Enzymes oxidize their sugars when exposed to air.',
    offensive: 'Define "brown." Be specific. The banana is listening.',
    escape: 'Bananas are simply pre-rehearsing their retirement color.',
  },
];
