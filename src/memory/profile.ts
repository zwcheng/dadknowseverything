// Kid profiles + memory root. Stored as a single JSON blob under one
// localStorage key so the preview and simulator stay consistent.
//
// Schema is intentionally flat. Cloud sync can wrap this later without
// invalidating the local format.

import type { EvenBridgeLike } from '../bridge';
import type { Topic } from '../cards';

export type LanguageLevel = 'preschool' | 'early-elementary' | 'late-elementary';

export interface KidProfile {
  id: string;
  name: string;
  age: number;
  interests: string[];
  languageLevel: LanguageLevel;
  notableFacts: Record<string, string>;
  createdAt: number;
}

export interface WonderMoment {
  id: string;
  kidId: string;
  at: number;
  question: string;
  topic: Topic;
  defensive: string;
  offensive: string;
  escape: string;
}

export interface MemoryStore {
  activeKidId: string | null;
  kids: Record<string, KidProfile>;
  history: Record<string, WonderMoment[]>; // keyed by kidId
}

const KEY = 'memory';

export function emptyStore(): MemoryStore {
  return { activeKidId: null, kids: {}, history: {} };
}

// First-run default so the demo is drivable out of the box. Parents can
// edit or add more kids from the phone UI.
export function defaultKid(): KidProfile {
  return {
    id: genId(),
    name: 'Even',
    age: 7,
    interests: ['space', 'dinosaurs', 'her dog Pepper'],
    languageLevel: 'early-elementary',
    notableFacts: { pet: 'dog named Pepper' },
    createdAt: Date.now(),
  };
}

export async function loadStore(bridge: EvenBridgeLike): Promise<MemoryStore> {
  try {
    const raw = (await bridge.getLocalStorage?.(KEY)) ?? '';
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return emptyStore();
    return {
      activeKidId: parsed.activeKidId ?? null,
      kids: parsed.kids ?? {},
      history: parsed.history ?? {},
    };
  } catch {
    return emptyStore();
  }
}

export async function saveStore(bridge: EvenBridgeLike, store: MemoryStore): Promise<void> {
  try {
    await bridge.setLocalStorage?.(KEY, JSON.stringify(store));
  } catch {
    /* best effort */
  }
}

export async function ensureActiveKid(bridge: EvenBridgeLike): Promise<MemoryStore> {
  const store = await loadStore(bridge);
  if (store.activeKidId && store.kids[store.activeKidId]) return store;
  const kid = defaultKid();
  const next: MemoryStore = {
    activeKidId: kid.id,
    kids: { ...store.kids, [kid.id]: kid },
    history: { ...store.history, [kid.id]: store.history[kid.id] ?? [] },
  };
  await saveStore(bridge, next);
  return next;
}

export function getActive(store: MemoryStore): KidProfile | null {
  if (!store.activeKidId) return null;
  return store.kids[store.activeKidId] ?? null;
}

export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
