// Finite state machine for DadKnowsEVERYTHING.
//
// IDLE ─double─▶ LISTENING ─click|double|max─▶ THINKING ─heard─▶ SHOWING
//                                                 │               │
//                                                 │ partial SAY   │
//                                                 │ streams in    │
//                                                 ▼               ▼
//                                        (renders live)      cycle/save/retone
//
// tone: simple / playful / science (swipe-up cycles)
// mode: answer / bounce             (swipe-down toggles)
//
// The transcript-echo state that used to sit between THINKING and SHOWING
// was removed for demo latency. Partial SAY tokens now stream directly
// into THINKING's render so the answer appears as it arrives, eliminating
// the 700ms dead-time gap.

import type { CardIndex } from './display';
import type { Question } from './cards';
import type { Tone } from './tones';
import type { Mode } from './modes';

export type RetoneKind = 'tone' | 'mode';

export type State =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking'; tick: number; partialSay?: string; retone?: { q: Question; kind: RetoneKind } }
  | { kind: 'showing'; q: Question; card: CardIndex; tone: Tone; mode: Mode; streaming: boolean }
  | { kind: 'saved'; q: Question; tone: Tone; mode: Mode };

export type Action =
  | { type: 'double' }
  | { type: 'click' }
  | { type: 'scroll-top' }
  | { type: 'scroll-bottom' }
  | { type: 'stop-listen' }
  | { type: 'spinner-tick' }
  | { type: 'heard'; q: Question; tone: Tone; mode: Mode }
  | { type: 'stream-say'; partial: string }
  | { type: 'stream-done'; q: Question }
  | { type: 'saved-done' }
  | { type: 'reset' };

export const initialState: State = { kind: 'idle' };

export function reduce(state: State, action: Action): State {
  switch (state.kind) {
    case 'idle':
      if (action.type === 'double') return { kind: 'listening' };
      return state;

    case 'listening':
      if (action.type === 'stop-listen' || action.type === 'click' || action.type === 'double') {
        return { kind: 'thinking', tick: 0 };
      }
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'thinking':
      if (action.type === 'spinner-tick') return { ...state, tick: state.tick + 1 };
      if (action.type === 'stream-say') return { ...state, partialSay: action.partial };
      if (action.type === 'heard') {
        // Go straight to SHOWING — no transcript-echo beat. The partial
        // SAY has already been rendering into this same card, so the
        // transition feels like the spinner resolving into the full text.
        return { kind: 'showing', q: action.q, card: 0, tone: action.tone, mode: action.mode, streaming: false };
      }
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'showing':
      if (action.type === 'stream-say') {
        return { ...state, q: { ...state.q, say: action.partial } };
      }
      if (action.type === 'stream-done') {
        return { ...state, q: action.q, streaming: false };
      }
      if (action.type === 'click') {
        const next = ((state.card + 1) % 3) as CardIndex;
        return { ...state, card: next };
      }
      if (action.type === 'double') {
        return { kind: 'saved', q: state.q, tone: state.tone, mode: state.mode };
      }
      if (action.type === 'scroll-top') {
        return { kind: 'thinking', tick: 0, retone: { q: state.q, kind: 'tone' } };
      }
      if (action.type === 'scroll-bottom') {
        return { kind: 'thinking', tick: 0, retone: { q: state.q, kind: 'mode' } };
      }
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'saved':
      if (action.type === 'saved-done') return { kind: 'idle' };
      if (action.type === 'double') return { kind: 'listening' };
      return state;
  }
}
