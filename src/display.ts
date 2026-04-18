// Render the glasses display for the persona-defense build.
//
// On G2's 576x288 canvas with the default LVGL font and padding=6, the
// text container gives us ~9 stackable rows. The showing layout uses:
//
//   line 1-2: topic glyph + question echo (wraps if long)
//   line 3:   blank spacer
//   line 4-5: D: defensive (wraps to 2 rows at full budget)
//   line 6-7: O: offensive
//   line 8-9: E: escape
//
// All three options are visible simultaneously. The father reads and picks
// one silently — no cycling, no swipes.

import type { EvenBridgeLike } from './bridge';
import type { Question, Topic } from './cards';

export const PAGE_ID = 1;
export const CARD_CONTAINER_ID = 1;
export const CARD_CONTAINER_NAME = 'card';

// ASCII glyphs chosen to render reliably on G2's default font.
const TOPIC_GLYPH: Record<Topic, string> = {
  nature:  '*',
  space:   'o',
  body:    '+',
  animals: '#',
  everyday:'~',
};

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

export function spinnerFrame(tick: number): string {
  return SPINNER_FRAMES[Math.max(0, tick) % SPINNER_FRAMES.length];
}

// Clamp the question echo so it doesn't push the D/O/E rows off-screen.
// ~80 chars wraps to at most 2 rows at G2's proportional font width.
const QUESTION_ECHO_MAX = 80;

function echoQuestion(q: Question): string {
  const glyph = TOPIC_GLYPH[q.topic] ?? '\u2022';
  const t = q.text.length > QUESTION_ECHO_MAX
    ? q.text.slice(0, QUESTION_ECHO_MAX - 1) + '\u2026'
    : q.text;
  return `${glyph} "${t}"`;
}

// The key view: all three options, stacked, simultaneously visible.
export function renderShowing(q: Question): string {
  return [
    echoQuestion(q),
    '',
    `D: ${q.defensive}`,
    `O: ${q.offensive}`,
    `E: ${q.escape}`,
  ].join('\n');
}

export function renderIdle(): string {
  return `DadKnowsEVERYTHING\ndouble-press to listen`;
}

export function renderListening(): string {
  return `* Listening...\npress once to stop`;
}

// Thinking doubles as the streaming surface: once "defensive" starts
// arriving, paint it below the spinner so the answer feels immediate.
export function renderThinking(tick: number, partialDefensive?: string): string {
  if (partialDefensive && partialDefensive.trim().length > 0) {
    return `${spinnerFrame(tick)} D:\n${partialDefensive}`;
  }
  return `${spinnerFrame(tick)} thinking...`;
}

export async function upgradeCard(bridge: EvenBridgeLike, content: string): Promise<void> {
  try {
    await bridge.textContainerUpgrade({
      containerID: CARD_CONTAINER_ID,
      containerName: CARD_CONTAINER_NAME,
      content,
    });
  } catch (err) {
    console.warn('[dk-persona] textContainerUpgrade threw', err);
  }
}
