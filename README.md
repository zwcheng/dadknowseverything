# DadKnowsEVERYTHING: Persona

A hands-free defense system for the omniscient-dad persona, running on
[Even Realities G2](https://www.evenrealities.com/) smart glasses.

This is the **persona-defense** build. A sibling to the original
`DadKnowsEVERYTHING` curiosity-copilot (which produced Say/Ask/Try cards),
this version instead presents *three simultaneous response options* whenever
a child asks a question — giving the father a silent, hands-free menu of
ways to hold the line.

Built for Even Realities Build Day @ Thinkspace Seattle.

## Purpose

Make it seem like dad knows EVERYTHING.

Dad has two postures for achieving this, plus one release valve:

- **Defensive** — submit to the question and answer accurately. Academic,
  highfalutin, faintly groan-worthy tone. Never invents, never hedges,
  never says "I don't know."
- **Offensive** — refuse to submit; fire a related question back at the
  child so the burden of thought returns to the asker. Same academic tone.
  Reuses a noun or verb from the child's question so the volley lands
  grounded, not evasive.
- **Escape** — if the conversation has become a boundary-pushing trap, the
  father reads the Escape card and derails the whole topic into laughter.
  Goofy, giddy, obviously-invented. The only field allowed to confabulate
  — precisely because its absurdity makes it unmistakeable as fact.

All three options render on the glasses at once. The father reads them
silently and speaks whichever he wants. No swipes, no cycling, no buttons
to pick a card — the glasses don't know which option he used, and they
don't need to.

## How it works

```
 child speaks
     │
 G2 mic ── BT ──▶ phone (WebView) ── HTTPS SSE ──▶ Gemini 2.5 Flash
                     │                                    │
                     │◀── partial JSON (defensive streams) ─┘
                     │
                     └── textContainerUpgrade ──▶ G2 display (D / O / E)
```

- Phone-side React app talks to the glasses via `@evenrealities/even_hub_sdk`.
- 16 kHz PCM16 audio frames wrap into WAV, ship to Gemini with a JSON
  response schema of `{questionText, topic, defensive, offensive, escape}`.
- Field order is load-bearing: `defensive` streams first so it can paint
  under the spinner while the rest tokenizes.
- A **stage mode** toggle bypasses Gemini and serves pre-written canned
  triads — demo-day safety net for venue WiFi.

## Hard rules (enforced in the system prompt)

1. **Never invent facts** in Defensive or Offensive. Every claim must be
   established, mainstream science or widely-known human knowledge.
2. **Never say "I don't know"** — no uncertainty words anywhere. If no
   reliable defensive answer exists, the Defensive slot is rewritten as
   a grounded counter-question (same shape as Offensive).
3. **Never attack the child.** No mocking, no condescension, no "stop
   asking." Dry wit is fine; cruelty is not.
4. **Only Escape may invent** — and it must be so obviously absurd that
   no child would mistake it for fact. Plausible-sounding falsehoods are
   forbidden everywhere.
5. **Safety override:** medical / danger / distress questions bypass the
   academic voice and the goofy Escape entirely — all three fields become
   warm, honest, direct responses.

## Interaction model

| Gesture / event     | State     | Effect                                   |
| ------------------- | --------- | ---------------------------------------- |
| Double-press        | idle      | Start listening                          |
| Double-press / click | listening | Stop listening and think                |
| 8 s timeout         | listening | Auto-stop (max utterance)                |
| **Glasses off**     | any mic   | Auto-stop, return to idle (Quiet Tech)   |
| Double-press        | showing   | Start a new question                     |

No swipes, no tones, no mode toggles, no card cycling, no save gesture.
The Wonder Trail auto-records every presented triad; dad's job is to
read and speak.

Dev panel (preview in a browser) exposes the same surface as buttons
plus keyboard shortcuts: `D` double, `Space` click, `R` auto-drive.

## Quick start

```bash
git clone https://github.com/zwcheng/dadknowseverything
cd dadknowseverything
git checkout persona-defense
npm install
npm install -g @evenrealities/evenhub-simulator   # optional but recommended
cp .env.example .env                                # then paste your Gemini key
npm run dev                                         # http://localhost:5173
```

Get a Gemini key at <https://aistudio.google.com/app/apikey>. Without one,
the app auto-forces stage mode.

## Running the demo

**Simulator** (no hardware):

```bash
evenhub-simulator --glow --automation-port 9898 http://localhost:5173
```

Drive the core flow over HTTP:

```bash
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"double_click"}' http://127.0.0.1:9898/api/input
# speak your question into the Mac mic, then:
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"click"}' http://127.0.0.1:9898/api/input   # stop listening
```

Supported actions: `click`, `double_click`. Swipe actions are no-ops in
this build.

**On-device** (G2 glasses):

```bash
npx evenhub qr --url "http://<your-lan-ip>:5173"
```

Scan the QR code with the Even Realities app. Hot reload works.

Because this build uses a distinct `package_id` (`com.dadknowseverything.persona`),
it coexists on the device alongside the original curiosity-copilot build —
the father can switch between "Dads" in the launcher.

**Package for distribution**:

```bash
npm run build && npm run pack   # produces dadknowseverything-persona.ehpk
```

## Display contract

One full-canvas text container, ~9 stackable rows on G2's 576×288
green-on-black display. Layout:

```
<topic-glyph> "<child's question>"
<blank>
D: <defensive answer>
O: <offensive counter-question>
E: <escape, goofy and obviously absurd>
```

Character budget per row: ~48 chars (proportional LVGL font; enforced in
the prompt and post-clamped in [gemini.ts](src/gemini.ts)).

## Project layout

```
src/
├── App.tsx              bootstrap, event wiring, dev panel, auto-save on showing
├── bridge.ts            SDK wrapper + mock fallback (Chrome dev)
├── state.ts             reducer + FSM (idle → listening → thinking → showing)
├── display.ts           single-screen triad renderer
├── cards.ts             Question type + canned triads for stage mode
├── gemini.ts            audio → Gemini Flash → D/O/E (streaming)
├── pcm.ts               audioEvent → WAV utilities
├── stageMode.ts         localStorage toggle
└── memory/
    ├── profile.ts       KidProfile, MemoryStore, CRUD
    ├── history.ts       WonderMoment append + read (stores full triad)
    ├── insights.ts      derived topic freq / concepts
    └── context.ts       prompt block + child-text sanitization

app.json                 Even Hub manifest (package_id, permissions)
```

## Built with

- [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk),
  simulator, and CLI
- [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs) with inline audio
  and structured JSON output
- Vite + React + TypeScript
