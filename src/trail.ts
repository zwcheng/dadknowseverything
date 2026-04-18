import type { EvenBridgeLike } from './bridge';
import type { Question } from './cards';

const KEY = 'trail';

export interface TrailItem {
  at: number;
  topic: string;
  text: string;
}

export async function appendTrail(bridge: EvenBridgeLike, q: Question): Promise<TrailItem[]> {
  const current = await loadTrail(bridge);
  const next: TrailItem[] = [...current, { at: Date.now(), topic: q.topic, text: q.text }];
  await bridge.setLocalStorage?.(KEY, JSON.stringify(next));
  return next;
}

export async function loadTrail(bridge: EvenBridgeLike): Promise<TrailItem[]> {
  try {
    const raw = (await bridge.getLocalStorage?.(KEY)) ?? null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrailItem[]) : [];
  } catch {
    return [];
  }
}
