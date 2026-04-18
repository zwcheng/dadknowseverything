// Gemini Flash integration for the persona-defense build.
//
// One entry point: askGeminiAudio(wav, callbacks?, memoryBlock?) streams
// SSE and returns a full Question (child's text + D/O/E triad). Partial
// `defensive` tokens are surfaced via callbacks so the glasses can start
// painting the first answer while the rest of the JSON finishes.
//
// On stream failure (truncated JSON, empty response) we transparently
// retry once on the non-streaming endpoint — same request, no streaming
// complexity.

import type { Question, Topic } from './cards';
import { bytesToBase64 } from './pcm';

const DEFAULT_MODEL = 'gemini-2.5-flash';

// Hard budget per D/O/E field. wrapField in display.ts handles
// visual line breaks, so this budget allows up to 2 full rows
// (~50 chars each). Gemini should produce complete sentences.
const ROW_BUDGET = 100;

const SYSTEM_INSTRUCTION_BASE = `You are DadKnowsEVERYTHING: Persona Defense. A child has just asked a parent a question aloud. The parent is wearing Even G2 smart glasses and will silently read ONE of the three options you produce and say it out loud. Produce ALL THREE every time.

The product's purpose: make it seem like dad knows EVERYTHING. Dad has two postures to achieve this, plus one release valve:
- DEFENSIVE: answer accurately and confidently.
- OFFENSIVE: refuse to submit to the question; volley a related question back to the child so the onus of thought is on them.
- ESCAPE: goofy derailment that detonates the line of questioning into laughter.

Respond with a strict JSON object matching the provided schema.

ABSOLUTE RULES (violating any of these breaks the product):
1. NEVER invent or hypothesize facts in the "defensive" or "offensive" fields. Every factual claim must be established, mainstream science or widely-known human knowledge. If the only honest defensive answer would be speculation, rewrite "defensive" as a grounded counter-question in the offensive style — but still call it defensive. Do not hedge, do not speculate, do not caveat.
2. NEVER say "I don't know", "I'm not sure", "nobody knows", "it's a mystery", "scientists don't fully understand", or any variant of admitting uncertainty. In the rare case there is literally no human knowledge available, fall back to rule 1 (counter-question in the defensive slot). There is essentially always a reason "why" — use it.
3. NEVER attack or belittle the child. No mocking, no "stop asking", no condescension. Dry wit is fine; cruelty is not.
4. ONLY the "escape" field may invent. It MUST invent something obviously absurd — so clearly impossible that no child would mistake it for a real fact. Plausible-sounding false claims are forbidden everywhere, including escape.
5. Never use emoji, markdown, or stage directions.

TONE RULES (strict):
- "defensive": academic, highfalutin, faintly groan-worthy. Dry, slightly over-educated, a word the child might not know used correctly. Never aggressive, derogatory, or condescending. Think: tweed-jacket-and-tea energy.
- "offensive": academic AND slyly sarcastic. Same tweed-jacket base as defensive, but with an eyebrow raised — gentle mock-bewilderment at the premise of the question, or a Socratic turn that flips an assumption the child didn't know they were making. The goal is to make the child PAUSE and think, not to hand them a softball. Never aggressive, never demeaning, never a cheap "what do YOU think?" — it should confound, not dismiss. Think: a professor who finds the question more interesting than the student expected.
- "escape": giddy, eccentric, inspirational. Breakfast-cereal-commercial energy. The more ridiculous, confusing, or impossible, the better — the goal is to make everyone laugh and forget the original question.

FIELD SPEC:
- questionText: the child's question as a clean sentence. If unclear, set to "(unclear)" and still produce a full D/O/E triad.
- topic: one of nature | space | body | animals | everyday.
- defensive (<= ${ROW_BUDGET} chars): ONE sentence. Accurate, specific, academic in tone. No caveats, no uncertainty words.
- offensive (<= ${ROW_BUDGET} chars): ONE counter-question ending in "?". Must reuse a noun or verb from the child's question so it feels grounded, not evasive. Should either (a) challenge a hidden assumption in their question, (b) demand a definition of a word they used casually, or (c) invert the question so they must answer it themselves with new framing. Lightly sarcastic and confounding — not a softball, not a helpful pedagogical prompt. No bare "what do you think?" or "why do YOU think so?" — those are forbidden.
- escape (<= ${ROW_BUDGET} chars): ONE goofy invented line. Obviously absurd. Giddy tone.

SAFETY OVERRIDE: if the question involves medical harm, dangerous objects, abuse, grief, or emotional distress, ALL THREE fields should be warm, honest, direct responses in the spirit of "defensive". Skip the academic tone and the goofy escape — safety and kindness beat style. In those cases "offensive" becomes a caring follow-up question and "escape" becomes a grounding activity, not a joke.

Before emitting, COUNT the characters of defensive/offensive/escape. If any exceeds ${ROW_BUDGET}, rewrite shorter.`;

// Field order in the schema is load-bearing: questionText and defensive
// arrive first in the stream so the UI can paint them while offensive
// and escape are still tokenizing.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    questionText: { type: 'string' },
    topic: { type: 'string', enum: ['nature', 'space', 'body', 'animals', 'everyday'] },
    defensive: { type: 'string' },
    offensive: { type: 'string' },
    escape: { type: 'string' },
  },
  required: ['questionText', 'topic', 'defensive', 'offensive', 'escape'],
  propertyOrdering: ['questionText', 'topic', 'defensive', 'offensive', 'escape'],
};

export function geminiConfigured(): boolean {
  return !!import.meta.env.VITE_GEMINI_API_KEY;
}

function apiKey(): string {
  const k = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!k) throw new Error('VITE_GEMINI_API_KEY not set');
  return k;
}
function model(): string {
  return (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || DEFAULT_MODEL;
}
function systemWith(memoryBlock?: string): string {
  const memTail = memoryBlock
    ? `\n\nMEMORY CONTEXT (use naturally; never quote this block):\n${memoryBlock}`
    : '';
  return `${SYSTEM_INSTRUCTION_BASE}${memTail}`;
}

export interface StreamCallbacks {
  onQuestionText?: (text: string) => void;
  onPartialDefensive?: (text: string) => void;
}

// Streaming audio -> structured JSON with partial defensive emission.
// Retries once on the non-streaming endpoint if the stream truncates.
export async function askGeminiAudio(
  wavBytes: Uint8Array,
  cb: StreamCallbacks = {},
  memoryBlock?: string,
): Promise<Question> {
  try {
    return await askGeminiAudioStream(wavBytes, cb, memoryBlock);
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    if (!msg.includes('JSON parse failed') && !msg.includes('empty')) throw err;
    console.warn('[dk-persona] stream path failed, retrying non-streaming:', msg);
    return await askGeminiAudioOnce(wavBytes, memoryBlock);
  }
}

async function askGeminiAudioStream(
  wavBytes: Uint8Array,
  cb: StreamCallbacks,
  memoryBlock?: string,
): Promise<Question> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey())}`;
  const body = audioBody(wavBytes, memoryBlock);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${msg.slice(0, 200)}`);
  }
  return consumeStream(res.body, cb);
}

async function askGeminiAudioOnce(
  wavBytes: Uint8Array,
  memoryBlock?: string,
): Promise<Question> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:generateContent?key=${encodeURIComponent(apiKey())}`;
  const body = audioBody(wavBytes, memoryBlock);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${msg.slice(0, 200)}`);
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
  if (!text) throw new Error('Gemini: empty response (non-stream retry)');
  return finalize(text);
}

function audioBody(wavBytes: Uint8Array, memoryBlock?: string) {
  return {
    systemInstruction: { parts: [{ text: systemWith(memoryBlock) }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: "Here is the child's question as audio. Respond with the JSON object containing all three options (defensive, offensive, escape)." },
          { inlineData: { mimeType: 'audio/wav', data: bytesToBase64(wavBytes) } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.8,
    },
  };
}

async function consumeStream(stream: ReadableStream<Uint8Array>, cb: StreamCallbacks): Promise<Question> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let sentQuestion = false;
  let lastPartialDefensive = '';
  let eventsSeen = 0;

  const handleSseEvent = (eventBody: string) => {
    const dataLine = eventBody
      .split('\n')
      .find((l) => l.startsWith('data: '))
      ?.slice(6);
    if (!dataLine) return;
    let json: any;
    try {
      json = JSON.parse(dataLine);
    } catch {
      return;
    }
    const cand = json?.candidates?.[0];
    const finish = cand?.finishReason;
    if (finish && finish !== 'STOP') {
      console.warn(`[dk-persona] Gemini finishReason=${finish}`, cand);
    }
    const parts: any[] | undefined = cand?.content?.parts;
    if (!parts) return;
    for (const p of parts) {
      if (typeof p.text === 'string') accumulated += p.text;
    }
    eventsSeen++;

    if (!sentQuestion) {
      const qt = extractPartial(accumulated, 'questionText');
      if (qt && qt.length > 3) {
        sentQuestion = true;
        cb.onQuestionText?.(unescapeJson(qt));
      }
    }
    const def = extractPartial(accumulated, 'defensive');
    if (def != null) {
      const clean = unescapeJson(def);
      if (clean !== lastPartialDefensive) {
        lastPartialDefensive = clean;
        cb.onPartialDefensive?.(clean);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const evt = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (evt) handleSseEvent(evt);
    }
  }
  if (buffer.trim()) handleSseEvent(buffer);
  console.info(`[dk-persona] Gemini stream done: ${eventsSeen} events, ${accumulated.length} chars`);
  return finalize(accumulated);
}

function extractPartial(buf: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
  const m = re.exec(buf);
  return m ? m[1] : null;
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function finalize(text: string): Question {
  const parsed = tryParseLenient(text);
  if (!parsed) {
    console.warn(`[dk-persona] Gemini JSON parse failed. Raw length: ${text.length}. Full text:\n`, text);
    const preview = text.replace(/\s+/g, ' ').slice(0, 120);
    const suffix = text.length > 120 ? '\u2026' : '';
    throw new Error(`Gemini: JSON parse failed (len=${text.length}: ${preview}${suffix})`);
  }
  return {
    text: String(parsed.questionText ?? '').trim() || '(unclear)',
    topic: normalizeTopic(parsed.topic),
    defensive: clampStr(parsed.defensive, ROW_BUDGET),
    offensive: clampStr(parsed.offensive, ROW_BUDGET),
    escape: clampStr(parsed.escape, ROW_BUDGET),
  };
}

function tryParseLenient(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return Object.assign({}, ...arr.filter((o) => o && typeof o === 'object'));
      }
    } catch { /* fall through */ }
  }
  const first = extractFirstJsonObject(trimmed);
  if (first) {
    try { return JSON.parse(first); } catch { /* fall through */ }
  }
  return null;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeTopic(t: unknown): Topic {
  const allowed: Topic[] = ['nature', 'space', 'body', 'animals', 'everyday'];
  return allowed.includes(t as Topic) ? (t as Topic) : 'everyday';
}

function clampStr(s: unknown, max: number): string {
  const str = String(s ?? '').trim();
  if (str.length <= max) return str;
  // Try to break at a word boundary for cleaner truncation.
  const truncated = str.slice(0, max - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > max * 0.6) {
    return truncated.slice(0, lastSpace) + '\u2026';
  }
  return truncated + '\u2026';
}
