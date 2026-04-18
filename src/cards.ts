export type Topic = 'nature' | 'space' | 'body' | 'animals' | 'everyday';

export interface Question {
  text: string;
  topic: Topic;
  // Character budgets tuned for a 576x288 glasses canvas without the footer
  // decoration. Keep bodies short so 1–2 wrapped lines always fit.
  say: string; // <= 60 chars
  ask: string; // <= 50 chars
  try: string; // <= 55 chars
}

export const DEMO_QUESTIONS: Question[] = [
  {
    text: 'Why is the moon out in the daytime?',
    topic: 'space',
    say: 'The moon is always up there; sunlight just hides it.',
    ask: 'Where does the moon go when we lose sight of it?',
    try: 'Look for the moon three times today.',
  },
  {
    text: 'Why are some leaves still on the tree?',
    topic: 'nature',
    say: 'Sheltered leaves get less cold wind, so they hang on.',
    ask: 'Which tree near us holds the most leaves?',
    try: 'Compare a leaf up there to one on the ground.',
  },
  {
    text: 'Why do bananas turn brown?',
    topic: 'everyday',
    say: 'Air turns their sugars into brown spots over time.',
    ask: 'What other fruit changes color on the counter?',
    try: 'Set a banana near an apple and check tomorrow.',
  },
];
