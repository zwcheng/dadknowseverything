// Append / read WonderMoments for a given kid. Lives inside the same JSON
// blob as profiles so one bridge.setLocalStorage round-trip covers all
// memory writes.
//
// In persona-defense we auto-save every showing — which option dad actually
// said is not recorded (and not load-bearing for future prompting, since
// the kid's next question drives the next triad anyway).

import type { EvenBridgeLike } from '../bridge';
import type { Question } from '../cards';
import {
  type MemoryStore,
  type WonderMoment,
  loadStore,
  saveStore,
  genId,
} from './profile';

export const HISTORY_LIMIT = 200;   // cap to keep the blob small

export function momentFromQuestion(kidId: string, q: Question): WonderMoment {
  return {
    id: genId(),
    kidId,
    at: Date.now(),
    question: q.text,
    topic: q.topic,
    defensive: q.defensive,
    offensive: q.offensive,
    escape: q.escape,
  };
}

export async function appendMoment(
  bridge: EvenBridgeLike,
  moment: WonderMoment,
): Promise<MemoryStore> {
  const store = await loadStore(bridge);
  const list = store.history[moment.kidId] ?? [];
  const next: WonderMoment[] = [...list, moment].slice(-HISTORY_LIMIT);
  const nextStore: MemoryStore = {
    ...store,
    history: { ...store.history, [moment.kidId]: next },
  };
  await saveStore(bridge, nextStore);
  return nextStore;
}

export function historyFor(store: MemoryStore, kidId: string | null | undefined): WonderMoment[] {
  if (!kidId) return [];
  return store.history[kidId] ?? [];
}

export function recent(history: WonderMoment[], n: number): WonderMoment[] {
  return history.slice(-n);
}
