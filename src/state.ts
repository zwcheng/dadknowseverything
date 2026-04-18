// Finite state machine for DadKnowsEVERYTHING.
//
// IDLE ─double─▶ LISTENING ─(click|max-timer)─▶ THINKING ─(AI or canned)─▶ SHOWING(0)
//                                                                            ├─click──▶ SHOWING(next)
//                                                                            └─double─▶ SAVED ─(timer)─▶ IDLE
//
// In LISTENING: single-press stops early, or LISTEN_MAX_MS caps the window.
// In THINKING: either await Gemini on collected audio, or (stage mode / error)
// pick a round-robin canned question.

import type { CardIndex } from './display';
import type { Question } from './cards';

export type State =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | { kind: 'showing'; q: Question; card: CardIndex }
  | { kind: 'saved'; q: Question };

export type Action =
  | { type: 'double' }
  | { type: 'click' }
  | { type: 'stop-listen' }
  | { type: 'thinking-done'; q: Question }
  | { type: 'saved-done' }
  | { type: 'reset' };

export const initialState: State = { kind: 'idle' };

export function reduce(state: State, action: Action): State {
  switch (state.kind) {
    case 'idle':
      if (action.type === 'double') return { kind: 'listening' };
      return state;

    case 'listening':
      if (action.type === 'stop-listen') return { kind: 'thinking' };
      if (action.type === 'click' || action.type === 'double') return { kind: 'thinking' };
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'thinking':
      if (action.type === 'thinking-done') return { kind: 'showing', q: action.q, card: 0 };
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'showing':
      if (action.type === 'click') {
        const next = ((state.card + 1) % 3) as CardIndex;
        return { ...state, card: next };
      }
      if (action.type === 'double') return { kind: 'saved', q: state.q };
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'saved':
      if (action.type === 'saved-done') return { kind: 'idle' };
      if (action.type === 'double') return { kind: 'listening' };
      return state;
  }
}
