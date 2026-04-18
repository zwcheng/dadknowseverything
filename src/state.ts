// Finite state machine for DadKnowsEVERYTHING.
//
// IDLE ─double─▶ LISTENING ─click|double|max─▶ THINKING ─heard─▶ TRANSCRIPT
//                                                                     │
//                                                               (timer) ▼
//    SAVED ◀─double─ SHOWING(card, tone, mode) ◀──── stream-say / done
//      │                │        │
//      │          swipe-up   swipe-down
//      │                │        │
//      │                ▼        ▼
//      │           THINKING (retone:tone)   THINKING (retone:mode)
//      │                │        │
//      └─(timer)─▶ IDLE ▼        ▼
//                  (back through the same cycle)
//
// tone: simple / playful / science (swipe-up cycles)
// mode: answer / bounce             (swipe-down toggles)

import type { CardIndex } from './display';
import type { Question } from './cards';
import type { Tone } from './tones';
import type { Mode } from './modes';

export type RetoneKind = 'tone' | 'mode';

export type State =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking'; tick: number; retone?: { q: Question; kind: RetoneKind } }
  | { kind: 'transcript'; q: Question; tone: Tone; mode: Mode }
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
  | { type: 'show-cards' }
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
      if (action.type === 'heard') {
        return { kind: 'transcript', q: action.q, tone: action.tone, mode: action.mode };
      }
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'transcript':
      if (action.type === 'show-cards') {
        return { kind: 'showing', q: state.q, card: 0, tone: state.tone, mode: state.mode, streaming: true };
      }
      if (action.type === 'stream-say') return { ...state, q: { ...state.q, say: action.partial } };
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
