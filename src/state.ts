// Finite state machine for DadKnowsEVERYTHING: Persona Defense.
//
// IDLE ─double─▶ LISTENING ─click|double|max─▶ THINKING ─heard─▶ SHOWING
//    ▲                                            │                 │
//    │                                            │ partial         │
//    │                                            │ defensive       │
//    │                                            │ streams         │
//    └────────────────── reset / glasses-off ─────┴──── double ──────┘
//                                                       (start a new question)
//
// No card cycling, no tone toggles, no mode swaps. One screen, three options,
// read-and-speak.

import type { Question } from './cards';

export type State =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking'; tick: number; partialDefensive?: string }
  | { kind: 'showing'; q: Question };

export type Action =
  | { type: 'double' }
  | { type: 'click' }
  | { type: 'stop-listen' }
  | { type: 'spinner-tick' }
  | { type: 'stream-partial'; partial: string }
  | { type: 'heard'; q: Question }
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
      if (action.type === 'stream-partial') return { ...state, partialDefensive: action.partial };
      if (action.type === 'heard') return { kind: 'showing', q: action.q };
      if (action.type === 'reset') return { kind: 'idle' };
      return state;

    case 'showing':
      if (action.type === 'double') return { kind: 'listening' };
      if (action.type === 'reset') return { kind: 'idle' };
      return state;
  }
}
