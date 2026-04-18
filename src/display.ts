// Render card text to the single event-capture text container on the glasses.
//
// Layout budget at 576x288 with padding=6:
//   line 1: header with topic glyph + card label + index + tone
//   line 2: body (1–2 wrapped lines)
//
// All updates go through textContainerUpgrade for flicker-free cycling. A
// handful of Unicode glyphs render fine in G2's 4-bit green font.

import type { EvenBridgeLike } from './bridge';
import type { Question, Topic } from './cards';
import { TONE_LABEL, type Tone } from './tones';

export const PAGE_ID = 1;
export const CARD_CONTAINER_ID = 1;
export const CARD_CONTAINER_NAME = 'card';

const CARD_LABELS = ['SAY', 'ASK', 'TRY'] as const;
export type CardIndex = 0 | 1 | 2;

// ASCII-only glyphs chosen so they render on G2's LVGL default font, which
// doesn't carry braille or most extended Unicode blocks. Each is a single
// printable char per topic for a compact header.
const TOPIC_GLYPH: Record<Topic, string> = {
  nature:  '*',
  space:   'o',
  body:    '+',
  animals: '#',
  everyday:'~',
};

// Classic 4-frame ASCII rotator. Monospace-friendly, always renders.
const SPINNER_FRAMES = ['|', '/', '-', '\\'];

export function spinnerFrame(tick: number): string {
  return SPINNER_FRAMES[Math.max(0, tick) % SPINNER_FRAMES.length];
}

// Card render: glyph + label + index, then the body directly below.
// Only non-default tones get a tone label to keep the header compact.
export function renderCard(q: Question, idx: CardIndex, tone: Tone): string {
  const glyph = TOPIC_GLYPH[q.topic] ?? '\u2022';
  const header = `${glyph} ${CARD_LABELS[idx]} (${idx + 1}/3)`;
  const body = idx === 0 ? q.say : idx === 1 ? q.ask : q.try;
  const toneSuffix = tone === 'simple' ? '' : `  ${TONE_LABEL[tone]}`;
  return `${header}${toneSuffix}\n${body}`;
}

export function renderIdle(): string {
  return `DadKnowsEVERYTHING\ndouble-press to listen`;
}

export function renderListening(): string {
  return `* Listening...\npress once to stop`;
}

export function renderThinking(tick: number): string {
  return `${spinnerFrame(tick)} thinking...`;
}

export function renderTranscript(q: Question): string {
  const qt = q.text.length > 70 ? q.text.slice(0, 67) + '\u2026' : q.text;
  return `Heard you:\n"${qt}"`;
}

export function renderSaved(q: Question): string {
  const preview = q.text.length > 40 ? q.text.slice(0, 37) + '\u2026' : q.text;
  return `Saved.\n"${preview}"`;
}

export async function upgradeCard(bridge: EvenBridgeLike, content: string): Promise<void> {
  try {
    await bridge.textContainerUpgrade({
      containerID: CARD_CONTAINER_ID,
      containerName: CARD_CONTAINER_NAME,
      content,
    });
  } catch (err) {
    console.warn('[wondercue] textContainerUpgrade threw', err);
  }
}
