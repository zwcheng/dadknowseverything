// Answer vs Bounce: response posture per utterance.
//
// - answer  (default): direct Say / Ask / Try triad
// - bounce (playful): grounded counter-question → absurd riff → truth escape

export type Mode = 'answer' | 'bounce';
export const MODES: readonly Mode[] = ['answer', 'bounce'] as const;

export const MODE_LABEL: Record<Mode, string> = {
  answer: 'ANSWER',
  bounce: 'BOUNCE',
};

// Card headers per mode, in order (SAY/ASK/TRY vs BOUNCE/TWIST/TRUTH).
export const CARD_LABELS: Record<Mode, readonly [string, string, string]> = {
  answer: ['SAY', 'ASK', 'TRY'],
  bounce: ['BOUNCE', 'TWIST', 'TRUTH'],
};

// Small lead glyph to signal mode at a glance on the tiny G2 canvas.
// Topic glyph still comes first; this is just the mode accent.
export const MODE_GLYPH: Record<Mode, string> = {
  answer: 'o',
  bounce: '?',
};

// Gemini prompt tail used by each mode. The Bounce text doubles as a
// safety guard — if the child's question sounds medical / dangerous /
// emotionally serious, the model ignores the Bounce posture and answers
// plainly in say/ask/try form.
export const MODE_INSTRUCTION: Record<Mode, string> = {
  answer: `MODE: ANSWER (default). Fill the fields this way:
- say: ONE child-friendly sentence answering the question. One idea only.
- ask: ONE open follow-up question back to the child.
- try: ONE tiny real-world action the family can do right now.`,
  bounce: `MODE: BOUNCE (playful pushback for cheeky / repetitive "why" questions).
Help the parent play along, not answer yet. Fill the fields this way:
- say: a playful counter-question that flips the child's question back on them. MUST reuse a key noun / premise / verb from their question (grounded, not random). Warm tease, never mean. No bare "what do you think?" — anchor to something concrete.
- ask: a more absurd riff on the counter. Still grounded in the original topic.
- try: the real, child-friendly answer, ready for the parent to deploy if the kid gets serious.
Rules: never dismissive, never "stop asking."
SAFETY OVERRIDE: if the question involves medical, injury, dangerous objects, or emotional distress, IGNORE this mode and respond plainly in Answer shape (say = direct answer, ask = open follow-up, try = concrete activity). Safety always beats play.`,
};

export function nextMode(current: Mode): Mode {
  return current === 'answer' ? 'bounce' : 'answer';
}
