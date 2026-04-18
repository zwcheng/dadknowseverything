// Gemini Flash integration.
//
// Two entry points:
//   askGeminiAudio(wav, tone, onPartial) — streams SSE, emits {kind:'say'|'text'|'done'}
//   askGeminiText(text, tone)            — single call, no streaming (used for retone)
//
// Streaming uses the `:streamGenerateContent?alt=sse` endpoint with a JSON
// response schema. Chunks arrive as SSE events whose text parts concatenate
// into valid JSON. We regex-extract the partial `say` field from the growing
// buffer so the SAY card can reveal incrementally on the glasses.

import type { Question, Topic } from './cards';
import { bytesToBase64 } from './pcm';
import { TONE_INSTRUCTION, type Tone } from './tones';
import { MODE_INSTRUCTION, type Mode } from './modes';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION_BASE = `You are DadKnowsEVERYTHING, a real-time curiosity copilot for a parent wearing Even G2 smart glasses. A child has just asked the parent a question.

Respond with a strict JSON object matching the provided schema. The parent will see three cards on a TINY 576x288 green-on-black display. HARD character limits — cards are cut off above these budgets:

- questionText: the child's question as a clean sentence. If unclear, set to "(unclear)" and still give a light generic response.
- topic: one of nature | space | body | animals | everyday.
- say: ONE child-friendly sentence answering the question. MAX 60 characters. One idea only.
- ask: ONE open follow-up question back to the child. MAX 50 characters. Must end with "?".
- try: ONE tiny real-world action the family can do right now. MAX 55 characters. Start with an imperative verb.

Before emitting, COUNT the characters of say/ask/try and rewrite shorter if any field exceeds its limit. Be warm, concrete, age 5–8. No stage directions, no markdown, no emojis.`;

// Order the fields so `questionText` and `say` arrive EARLY in the JSON stream.
// That lets the UI show the transcript echo and start revealing SAY as fast
// as possible without waiting for ASK and TRY to finish streaming.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    questionText: { type: 'string' },
    topic: { type: 'string', enum: ['nature', 'space', 'body', 'animals', 'everyday'] },
    say: { type: 'string' },
    ask: { type: 'string' },
    try_: { type: 'string' },
  },
  required: ['questionText', 'topic', 'say', 'ask', 'try_'],
  propertyOrdering: ['questionText', 'topic', 'say', 'ask', 'try_'],
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
function systemWith(tone: Tone, mode: Mode, memoryBlock?: string): string {
  const memTail = memoryBlock
    ? `\n\nMEMORY CONTEXT (use naturally; never quote this block):\n${memoryBlock}`
    : '';
  return `${SYSTEM_INSTRUCTION_BASE}\n\n${MODE_INSTRUCTION[mode]}\n\nTone: ${TONE_INSTRUCTION[tone]}${memTail}`;
}

export interface StreamCallbacks {
  onQuestionText?: (text: string) => void;
  onPartialSay?: (text: string) => void;
}

// Streaming audio → structured JSON with partial SAY emission.
export async function askGeminiAudio(
  wavBytes: Uint8Array,
  tone: Tone,
  mode: Mode,
  cb: StreamCallbacks = {},
  memoryBlock?: string,
): Promise<Question> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey())}`;
  const body = {
    systemInstruction: { parts: [{ text: systemWith(tone, mode, memoryBlock) }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: "Here is the child's question as audio. Respond with the JSON object." },
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

// Non-streaming text question (used for retone — we already know the question
// text from the first pass, no need to re-send the audio).
export async function askGeminiText(
  questionText: string,
  tone: Tone,
  mode: Mode,
  memoryBlock?: string,
): Promise<Question> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:generateContent?key=${encodeURIComponent(apiKey())}`;
  const body = {
    systemInstruction: { parts: [{ text: systemWith(tone, mode, memoryBlock) }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `The child asked: "${questionText}". Respond with the JSON object.` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.8,
    },
  };
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
  if (!text) throw new Error('Gemini: empty response');
  return finalize(text);
}

async function consumeStream(stream: ReadableStream<Uint8Array>, cb: StreamCallbacks): Promise<Question> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let sentQuestion = false;
  let lastPartialSay = '';

  // Handle one SSE event payload (the JSON object after `data: `).
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
    const parts: any[] | undefined = json?.candidates?.[0]?.content?.parts;
    if (!parts) return;
    for (const p of parts) {
      if (typeof p.text === 'string') accumulated += p.text;
    }

    // Try to extract questionText once, then stream the partial say.
    if (!sentQuestion) {
      const qt = extractPartial(accumulated, 'questionText');
      if (qt && qt.length > 3) {
        sentQuestion = true;
        cb.onQuestionText?.(unescapeJson(qt));
      }
    }
    const say = extractPartial(accumulated, 'say');
    if (say != null) {
      const clean = unescapeJson(say);
      if (clean !== lastPartialSay) {
        lastPartialSay = clean;
        cb.onPartialSay?.(clean);
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
  return finalize(accumulated);
}

// Extract the value of a top-level string field from a growing JSON buffer.
// Tolerates incomplete strings at the end of the buffer.
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
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini: JSON parse failed');
  }
  return {
    text: String(parsed.questionText ?? '').trim() || '(unclear)',
    topic: normalizeTopic(parsed.topic),
    say: clampStr(parsed.say, 60),
    ask: clampStr(parsed.ask, 50),
    try: clampStr(parsed.try_, 55),
  };
}

function normalizeTopic(t: unknown): Topic {
  const allowed: Topic[] = ['nature', 'space', 'body', 'animals', 'everyday'];
  return allowed.includes(t as Topic) ? (t as Topic) : 'everyday';
}

function clampStr(s: unknown, max: number): string {
  const str = String(s ?? '').trim();
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}
