// Render card text to the single event-capture text container on the glasses.
//
// Layout budget at 576x288 with padding=6:
//   line 1: header (SAY / ASK / TRY / status)
//   blank
//   body wrapped across 2–4 lines
//   blank
//   footer: "1/3  > press to continue"
//
// All updates go through textContainerUpgrade for flicker-free cycling.

import type { EvenBridgeLike } from './bridge';
import type { Question } from './cards';

export const PAGE_ID = 1;
export const CARD_CONTAINER_ID = 1;
export const CARD_CONTAINER_NAME = 'card';

const CARD_LABELS = ['SAY', 'ASK', 'TRY'] as const;
export type CardIndex = 0 | 1 | 2;

// Tight layout: one header line with the card index baked in, then the body
// directly underneath. Drops the blank-line separators and the verbose footer
// so the 576x288 canvas has more room for the answer itself.
export function renderCard(q: Question, idx: CardIndex): string {
  const header = `${CARD_LABELS[idx]} (${idx + 1}/3)`;
  const body = idx === 0 ? q.say : idx === 1 ? q.ask : q.try;
  return `${header}\n${body}`;
}

export function renderIdle(): string {
  return `DadKnowsEVERYTHING\ndouble-press to listen`;
}

export function renderListening(): string {
  return `* Listening...\npress once to stop`;
}

export function renderThinking(): string {
  return `...thinking...`;
}

export function renderError(msg: string): string {
  const preview = msg.length > 50 ? msg.slice(0, 47) + '...' : msg;
  return `Oops\n${preview}`;
}

export function renderSaved(q: Question): string {
  const preview = q.text.length > 40 ? q.text.slice(0, 37) + '...' : q.text;
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
