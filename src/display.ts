// Render the glasses display for the persona-defense build.
//
// G2 display: 576×288 px, padding=6 → ~564 px usable width.
// LVGL proportional font averages ~14 px/char → ~40 chars/row, ~9 rows.
//
// Single-page SHOWING layout with manual word-wrap + visual separators:
//   row  1:   question echo (clamped to 1 row, ~54 chars)
//   row  2:   separator line (dashes)
//   rows 3-4: D: defensive  (up to 2 wrapped rows)
//   row  5:   separator
//   rows 6-7: O: offensive  (up to 2 wrapped rows)
//   row  8:   separator
//   rows 9-10: E: escape    (up to 2 wrapped rows — may clip on very long)
//   total: ~8-9 rows typical ✓
//
// Manual word-wrap ensures clean breaks at word boundaries rather than
// relying on LVGL's character-level auto-wrap which can split mid-word.

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

// Approximate characters per row on G2's proportional LVGL font.
// Measured empirically: ~51 chars + "D: " prefix fills ~95% of width.
export const CHARS_PER_ROW = 54;

// Visual separator — thin dashed line that reads as structure, not noise.
const SEP = '-'.repeat(CHARS_PER_ROW);

// Clamp the question echo to 1 row so D/O/E have maximum room.
// Glyph + space + quotes = 4 chars overhead → 50 chars of question text.
const QUESTION_ECHO_MAX = 50;

function echoQuestion(q: Question): string {
  const t = q.text.length > QUESTION_ECHO_MAX
    ? q.text.slice(0, QUESTION_ECHO_MAX - 1) + '\u2026'
    : q.text;
  return `>> "${t}"`;
}

// Word-wrap a field with a labelled prefix (e.g. "D: ") so it fills
// the available rows with clean word-boundary breaks.
// Continuation lines are indented to align with the first word.
function wrapField(prefix: string, text: string, rowWidth: number): string {
  const indent = ' '.repeat(prefix.length);
  const firstWidth = rowWidth - prefix.length;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const limit = lines.length === 0 ? firstWidth : rowWidth - prefix.length;
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.map((l, i) => i === 0 ? `${prefix}${l}` : `${indent}${l}`).join('\n');
}

// All three options on one screen, separated by dashed lines.
export function renderShowing(q: Question): string {
  return [
    echoQuestion(q),
    SEP,
    wrapField('D: ', q.defensive, CHARS_PER_ROW),
    SEP,
    wrapField('O: ', q.offensive, CHARS_PER_ROW),
    SEP,
    wrapField('E: ', q.escape, CHARS_PER_ROW),
  ].join('\n');
}

export function renderIdle(): string {
  return [
    '',
    '    DadKnowsEVERYTHING',
    SEP,
    '    double-press to listen',
  ].join('\n');
}

export function renderListening(): string {
  return [
    '',
    '    * Listening...',
    SEP,
    '    press once to stop',
  ].join('\n');
}

// Thinking doubles as the streaming surface: once "defensive" starts
// arriving, paint it below the spinner so the answer feels immediate.
export function renderThinking(tick: number, partialDefensive?: string): string {
  if (partialDefensive && partialDefensive.trim().length > 0) {
    return [
      `${spinnerFrame(tick)} thinking...`,
      SEP,
      `D: ${partialDefensive}`,
    ].join('\n');
  }
  return [
    '',
    `    ${spinnerFrame(tick)} thinking...`,
  ].join('\n');
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
