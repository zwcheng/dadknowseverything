# DadKnowsEVERYTHING

A real-time curiosity copilot for parent-child moments, running on [Even
Realities G2](https://www.evenrealities.com/) smart glasses.

Built for Even Realities Builders' Day.

## What it does

A child asks a question — "why is the moon out in the daytime?" — and the
parent double-presses the glasses temple. Within a couple of seconds, three
short cards appear on the G2 display:

- **SAY** — one child-friendly sentence answering the question
- **ASK** — one open follow-up to keep the child thinking
- **TRY** — one tiny real-world activity for right now

Single-press cycles the cards. Double-press saves the moment to the Wonder
Trail. The goal isn't to replace the parent — it's to help them respond
better without pulling out a phone.

## How it works

```
 child speaks
     │
 G2 mic ── BT ──▶ phone (WebView) ── HTTPS ──▶ Gemini Flash
                      │
                      └── textContainerUpgrade ──▶ G2 display
```

- Phone-side React app talks to the glasses via `@evenrealities/even_hub_sdk`.
- Audio frames arrive as 16 kHz PCM16 on `audioEvent`, get wrapped in WAV, and
  sent in a single `generateContent` call to Gemini with a JSON response
  schema.
- Gemini returns `{questionText, topic, say, ask, try_}`; we render it into a
  single text container with flicker-free `textContainerUpgrade`.
- A **stage-mode** toggle bypasses Gemini and serves pre-written canned
  answers — demo-day safety net for venue WiFi.

## Quick start

```bash
git clone https://github.com/zwcheng/dadknowseverything
cd dadknowseverything
npm install
npm install -g @evenrealities/evenhub-simulator   # optional but recommended
cp .env.example .env                                # then paste your Gemini key
npm run dev                                         # http://localhost:5173
```

Get a Gemini key at <https://aistudio.google.com/app/apikey>. Without one, the
app auto-forces stage mode.

## Running the demo

**Simulator** (no hardware):

```bash
evenhub-simulator --glow --automation-port 9898 http://localhost:5173
```

Drive gestures over HTTP:

```bash
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"double_click"}' http://127.0.0.1:9898/api/input
# speak your question into the Mac mic, then:
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"click"}' http://127.0.0.1:9898/api/input   # stop listening
```

Actions: `click` · `double_click` · `up` · `down`.

**On-device** (G2 glasses):

```bash
npx evenhub qr --url "http://<your-lan-ip>:5173"
```

Scan the QR code with the Even Realities app. Hot reload works.

**Package for distribution**:

```bash
npm run build && npm run pack   # produces dadknowseverything.ehpk
```

## Interaction model

| Gesture        | State     | Effect                         |
| -------------- | --------- | ------------------------------ |
| Double-press   | idle      | Start listening                |
| Double-press   | listening | Stop listening and think       |
| Single-press   | listening | Stop listening and think       |
| Single-press   | showing   | Cycle SAY → ASK → TRY          |
| Double-press   | showing   | Save to Wonder Trail, go idle  |
| 8 s timeout    | listening | Auto-stop (max utterance)      |

## Project layout

```
src/
├── App.tsx        bootstrap, event wiring, dev panel
├── bridge.ts      SDK wrapper + mock fallback (Chrome dev)
├── state.ts       reducer + state machine
├── display.ts     card rendering + textContainerUpgrade
├── cards.ts       canned questions for stage mode
├── gemini.ts      audio → Gemini Flash → structured JSON
├── pcm.ts         audioEvent → WAV utilities
├── stageMode.ts   localStorage toggle
└── trail.ts       Wonder Trail persistence

app.json           Even Hub manifest (permissions, package_id, etc.)
```

## Character budgets

The G2 canvas is 576×288 px, 4-bit green. Budgets (enforced in the prompt and
post-clamped):

| Field | Max chars |
| ----- | --------- |
| SAY   | 60        |
| ASK   | 50        |
| TRY   | 55        |

## Built with

- [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk),
  simulator, and CLI
- [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs) with inline audio
  and structured JSON output
- Vite + React + TypeScript
