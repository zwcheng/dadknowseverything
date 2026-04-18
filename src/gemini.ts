// Gemini Flash call: audio in → structured JSON response (question transcript +
// Say / Ask / Try content + topic). Single REST call with inline WAV payload
// and a JSON response schema — simpler and more demo-reliable than the Live
// streaming API for this use case.

import type { Question, Topic } from './cards';
import { bytesToBase64 } from './pcm';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You are DadKnowsEVERYTHING, a real-time curiosity copilot for a parent wearing Even G2 smart glasses. A child has just asked the parent a question, and you have the audio.

Listen to the audio, then respond with a strict JSON object matching the provided schema. The parent will see three short cards on a TINY (576x288) green-on-black display. HARD character limits — cards are cut off above these budgets:

- questionText: the child's question as a clean sentence. If unclear, set to "(unclear)" and still give a light generic response.
- topic: one of nature | space | body | animals | everyday.
- say: ONE child-friendly sentence that answers the question. MAX 60 CHARACTERS (count every character including spaces and punctuation). One idea only. Plain language.
- ask: ONE open follow-up question back to the child. MAX 50 CHARACTERS. Must end with "?".
- try: ONE tiny real-world action the family can do right now. MAX 55 CHARACTERS. Start with an imperative verb.

Before emitting, COUNT the characters of say/ask/try and rewrite shorter if any field exceeds its limit. Be warm, concrete, age 5–8. No stage directions, no markdown, no emojis.`;

export interface AIResponse extends Question {
  /* questionText is in `Question.text`. */
}

export function geminiConfigured(): boolean {
  return !!import.meta.env.VITE_GEMINI_API_KEY;
}

export async function askGemini(wavBytes: Uint8Array): Promise<AIResponse> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set');

  const model = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
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
      responseSchema: {
        type: 'object',
        properties: {
          questionText: { type: 'string' },
          topic: { type: 'string', enum: ['nature', 'space', 'body', 'animals', 'everyday'] },
          say: { type: 'string' },
          ask: { type: 'string' },
          try_: { type: 'string' },
        },
        required: ['questionText', 'topic', 'say', 'ask', 'try_'],
      },
      temperature: 0.8,
    },
  };

  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
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

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini: JSON parse failed (${(err as Error).message})`);
  }

  const q: Question = {
    text: String(parsed.questionText ?? '').trim() || '(unclear)',
    topic: normalizeTopic(parsed.topic),
    say: clampStr(parsed.say, 60),
    ask: clampStr(parsed.ask, 50),
    try: clampStr(parsed.try_, 55),
  };
  return q;
}

function normalizeTopic(t: unknown): Topic {
  const allowed: Topic[] = ['nature', 'space', 'body', 'animals', 'everyday'];
  return allowed.includes(t as Topic) ? (t as Topic) : 'everyday';
}

function clampStr(s: unknown, max: number): string {
  const str = String(s ?? '').trim();
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
