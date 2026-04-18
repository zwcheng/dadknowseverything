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
import { CARD_LABELS as MODE_CARD_LABELS, MODE_GLYPH, type Mode } from './modes';

export const PAGE_ID = 1;
export const CARD_CONTAINER_ID = 1;
export const CARD_CONTAINER_NAME = 'card';

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
// The glyph leads with mode (o for Answer, ? for Bounce) so the parent
// sees the posture at a glance without a second line.
export function renderCard(q: Question, idx: CardIndex, tone: Tone, mode: Mode): string {
  const glyph = MODE_GLYPH[mode];
  const label = MODE_CARD_LABELS[mode][idx];
  const topicGlyph = TOPIC_GLYPH[q.topic] ?? '\u2022';
  const header = `${glyph}${topicGlyph} ${label} (${idx + 1}/3)`;
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
