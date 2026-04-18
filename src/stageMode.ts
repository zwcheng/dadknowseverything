// Stage mode forces the canned-question path, bypassing Gemini.
// Persisted in localStorage so the preference survives reloads.

import { geminiConfigured } from './gemini';

const KEY = 'dk:stage';

// A key takes priority: if it's missing, stage mode is always on.
export function getStage(): boolean {
  if (!geminiConfigured()) return true;
  return localStorage.getItem(KEY) === '1';
}

export function setStage(on: boolean): void {
  localStorage.setItem(KEY, on ? '1' : '0');
}

export function stageReason(): 'no-key' | 'user-toggle' | 'off' {
  if (!geminiConfigured()) return 'no-key';
  return localStorage.getItem(KEY) === '1' ? 'user-toggle' : 'off';
}
