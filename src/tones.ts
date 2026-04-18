// Adaptive response tones. Same question, different voice.
// Parent cycles through tones with a swipe-up on the glasses temple.

export type Tone = 'simple' | 'playful' | 'science';
export const TONES: readonly Tone[] = ['simple', 'playful', 'science'] as const;

export const TONE_LABEL: Record<Tone, string> = {
  simple: 'SIMPLE',
  playful: 'PLAYFUL',
  science: 'SCIENCE',
};

// Appended to the Gemini system prompt to colour the response.
export const TONE_INSTRUCTION: Record<Tone, string> = {
  simple:
    'Use the simplest possible language: short words, short sentences, very direct. Avoid figurative language.',
  playful:
    'Make it feel warm and playful. A gentle simile or tiny wonder-cue is welcome; stay kind, never silly.',
  science:
    'Lean slightly more factual and specific. A real science word is OK if you explain it in the same sentence.',
};

export function nextTone(current: Tone): Tone {
  const i = TONES.indexOf(current);
  return TONES[(i + 1) % TONES.length];
}
