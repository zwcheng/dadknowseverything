# DadKnowsEVERYTHING — Build Documentation

Technical journal for the Even Realities Builders' Day demo.

## What it is

A real-time curiosity copilot for parents. A child asks a question out loud;
the parent double-presses the glasses temple; within ~2 seconds the G2 display
shows three short cards — **Say**, **Ask**, **Try** — designed to help the
parent respond without pulling out a phone.

The product is intentionally *not* "school on glasses." It's a line-of-sight
assistant that extends parent-child conversation instead of replacing it.

## Hardware context

Even G2 smart glasses, in one paragraph:

- **Display**: dual 576×288 px micro-LED, one per lens. 4-bit greyscale
  (rendered as shades of green). Origin top-left. No camera, no speaker.
- **Input**: 4-mic array streaming 16 kHz PCM16 mono, temple touchpads
  (press, double-press, swipe-up, swipe-down), optional R1 ring, IMU.
- **Topology**: app logic runs on the phone in a WebView; the phone talks
  BT 5.2 to the glasses, and the glasses render containers and send back
  input events.
- **SDK**: `@evenrealities/even_hub_sdk` exposes an `EvenAppBridge` with
  methods like `createStartUpPageContainer`, `textContainerUpgrade`,
  `audioControl`, `imuControl`, `setLocalStorage`.

Key constraint consequences the product leans into: no camera keeps it
private; no speaker forces text-only output; tiny canvas forces the Say/Ask/
Try triad to be tight; 16 kHz mono PCM matches Gemini's inline-audio
expectations one-to-one — no resampling.

## Architecture

```
 child speaks
     │
 G2 mic ── BT ──▶ phone (Even app WebView) ── HTTPS SSE ──▶ Gemini 2.5 Flash
                     │                                            │
                     │◀─── partial JSON (questionText + say) ──────│
                     │
                     └── textContainerUpgrade ──▶ G2 display
```

Nothing novel here: the phone is the whole brain. Audio gets WAV-wrapped and
sent to Gemini's streaming `generateContent` endpoint; as the JSON response
streams back, the app extracts `questionText` first (for a quick transcript
echo), then reveals `say` on the card character-by-character, and finally
parses the complete JSON for `ask` / `try` / `topic` when the stream ends.

## Files

```
src/
├── App.tsx        bootstrap, bridge subscription, dev panel, orchestration
├── bridge.ts      SDK wrapper + browser mock (graceful Chrome-only dev)
├── state.ts       reducer-based FSM (idle / listening / thinking / transcript / showing / saved)
├── display.ts     card rendering, glyph + spinner constants, upgradeCard helper
├── gemini.ts      streaming `askGeminiAudio` + non-streaming `askGeminiText`
├── cards.ts       canned Q/A pool for stage mode
├── pcm.ts         audioPcm normalization + WAV encoding
├── stageMode.ts   localStorage toggle; auto-forces stage if no API key
├── tones.ts       simple / playful / science tone definitions and rotation
├── trail.ts       Wonder Trail persistence via bridge.setLocalStorage
└── styles.css     phone-side dev UI

app.json           Even Hub manifest (permissions, package_id, min_sdk_version)
```

## State machine

```
           ┌──────────┐
           │   IDLE   │◀──────┐
           └─────┬────┘       │
            double-press      │
                 ▼            │
        ┌───────────────┐     │
        │   LISTENING   │     │
        └───────┬───────┘     │
      click | double | 8 s    │
                 ▼            │
        ┌───────────────┐     │
        │   THINKING    │     │
        │  (spinner +   │     │
        │   streaming)  │     │
        └───────┬───────┘     │
                │             │
            heard(q)          │
                ▼             │
        ┌───────────────┐     │
        │  TRANSCRIPT   │     │
        │  (700 ms)     │     │
        └───────┬───────┘     │
                ▼             │
  ┌─────────────────────────┐ │
  │        SHOWING          │ │
  │    card 0 → 1 → 2       │ │
  │  (stream-say updates)   │ │
  └──┬────────┬──────────┬──┘ │
  click   swipe-up    double  │
     │       │           │    │
     │       ▼           ▼    │
     │  THINKING      SAVED   │
     │  (retone)        │     │
     │  (text-only      │     │
     │   Gemini)        │ 1.4s│
     └──────┬──         │     │
            ▼           ▼     │
         SHOWING   ─────┘     │
                             ─┘
```

Reducer logic lives in `src/state.ts`. Side effects (timers, spinner
ticks, Gemini calls, audio control) live in App.tsx's state-entry effect.

## Display contract

One full-canvas text container, single event-capture (`isEventCapture: 1`).
Updates go through `textContainerUpgrade` for flicker-free cycling; the only
`rebuildPageContainer` would be on structural layout changes we don't make.

Layout per card:

```
<glyph> <LABEL> (<idx>/3)  [<tone>]
<body (single short line)>
```

### Character budgets

Tight enough to fit on 1–2 wrapped lines at G2's default font. Enforced in
the Gemini prompt *and* post-clamped in `gemini.ts`.

| Field | Max |
|---|---|
| SAY | 60 |
| ASK | 50 |
| TRY | 55 |

### Glyphs

G2's LVGL font is ASCII-mostly. Braille and many extended-block codepoints
render blank. The demo uses:

| Purpose | Glyph |
|---|---|
| Topic: space | `o` |
| Topic: nature | `*` |
| Topic: body | `+` |
| Topic: animals | `#` |
| Topic: everyday | `~` |
| Spinner frames | `\|` `/` `-` `\` (100 ms tick) |

Tested empirically via the simulator's LVGL warning channel; initial
braille-spinner attempt produced `glyph dsc. not found for U+280B …` for
every frame and rendered blank on the display.

## Audio pipeline

1. User double-presses → state → `listening` → App.tsx calls
   `bridge.audioControl(true)`.
2. The Even phone app opens the mic and begins pushing `audioEvent` payloads
   with `audioPcm` — 16 kHz PCM16 mono bytes. Payload may arrive as
   `Uint8Array`, `number[]`, or base64-string; `pcm.ts::toUint8Array`
   normalizes.
3. Frames accumulate into `audioBuffer.current` while the state is
   `listening`.
4. User single- or double-presses, or the 8-second cap fires, →
   `stop-listen` → state → `thinking` → `audioControl(false)`.
5. Buffer is concatenated, wrapped in a 44-byte RIFF/WAVE header
   (`pcm.ts::pcmToWav`), and base64-encoded for Gemini inline data.

Minimum audio length threshold is 300 ms of PCM (= 9600 bytes). Shorter
utterances fall back to a canned response rather than wasting a round-trip.

## Gemini integration

### Streaming (primary path)

`askGeminiAudio(wav, tone, callbacks)` — calls
`models/<model>:streamGenerateContent?alt=sse`. Request carries:

- System instruction with hard character limits + tone flavour
- `inlineData` WAV audio part
- `generationConfig` with `responseMimeType: application/json` and a
  `responseSchema` that orders fields as `questionText → topic → say → ask →
  try_` via `propertyOrdering`. Ordering is the whole trick for streaming —
  it guarantees the early tokens carry the transcript and the start of SAY.

As SSE events arrive, we accumulate text, regex-extract the growing
`"questionText": "…"` and `"say": "…"` substrings (tolerating mid-string
truncation), and fire `onQuestionText` / `onPartialSay` callbacks.
App.tsx dispatches `heard(q)` the moment questionText is stable and
`stream-say(partial)` for each partial SAY update. When the stream ends,
we do one full `JSON.parse` and clamp to char budgets.

### Non-streaming retone

`askGeminiText(questionText, tone)` — when the parent swipes up on a
showing card, we don't re-upload the audio. We reuse the already-known
`questionText` and call the non-streaming endpoint with the next tone's
system instruction. Roughly half the latency and a fraction of the tokens
of the audio path.

### Tones

`simple` (default) · `playful` (warm similes) · `science` (slightly more
technical). Cycled on swipe-up. Stage mode cycles the tone label only.

## Stage mode

`src/stageMode.ts` reads/writes a localStorage flag. Two paths:

- If `VITE_GEMINI_API_KEY` is empty, stage mode is *forced* regardless of
  the toggle. App badge shows "No API key — forced to stage mode".
- If the key is present, the toggle is user-settable. On, the app serves
  round-robin canned answers from `src/cards.ts` with zero network calls.

Retone in stage mode cycles the tone chip but keeps the canned body — we
don't carry tone-flavoured canned content, and demo reliability trumps
cosmetic variation.

Use: demo-day insurance. Venue WiFi is hostile; flipping to stage mode
guarantees the flow works.

## Gesture map

| Gesture       | State            | Effect                         |
|---------------|------------------|--------------------------------|
| Double-press  | idle             | Enter listening                |
| Double-press  | listening        | Stop listening → thinking      |
| Single-press  | listening        | Stop listening → thinking      |
| 8 s timeout   | listening        | Auto-stop → thinking           |
| Single-press  | showing          | Cycle SAY → ASK → TRY          |
| Swipe-up      | showing          | Re-tone → thinking → showing   |
| Double-press  | showing          | Save to Wonder Trail           |
| Foreground exit / abnormal | any  | Reset to idle; close mic      |

Dev-panel keyboard equivalents (preview only): `D` · `Space` · `T` · `R`
(auto-drive rehearsal).

## Build history

| Phase | What landed |
|---|---|
| **1. Research** | Fetched every Even Hub doc page, cross-checked against SDK TypeScript types. Discovered the docs site lists positional-arg signatures while the real SDK takes object args. |
| **2. Baseline** | Vite + React + TS scaffold. Bridge wrapper with Chrome-only mock. Reducer FSM. Single text container, idle → listening → thinking → 3-card showing → saved. Canned Q/A. |
| **3. SDK shape** | Rewrote API calls to use object args (`createStartUpPageContainer({textObject:[...]})`), added `getEventType` that unions `textEvent.eventType ?? listEvent.eventType ?? sysEvent.eventType`. Simulator stopped warning. |
| **4. Live AI** | Gemini 2.5 Flash with inline WAV audio, `responseSchema` for structured output, stage-mode toggle, `.env` key loading. Validated with a text-only ping. |
| **5. Budget fit** | Tightened layout: single-line header `LABEL (idx/3)` + body, no footer text. Budgets dropped from 80/60/70 to 60/50/55. Prompt now demands "HARD character limits" + "COUNT before emitting." |
| **6. Polish** | Streaming SAY via SSE, transcript echo state, animated thinking spinner, topic glyphs, adaptive tones with swipe-up, stage auto-drive (`R`). |
| **7. Font fix** | Braille spinner rendered blank on G2's LVGL font. Swapped to ASCII `\| / - \` rotator. Kept topic glyphs ASCII as well. |
| **8. Repo** | Git init, personal author scoped to repo, `.env` ignored, README, pushed to `github.com/zwcheng/dadknowseverything`. |

## Simulator automation

The desktop simulator exposes an undocumented HTTP API when launched with
`--automation-port 9898`:

```bash
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"<action>"}' http://127.0.0.1:9898/api/input
```

Valid `action` values: `click`, `double_click`, `up`, `down`. Used in
development for end-to-end regression drives without leaving the terminal,
and can feed a pre-rehearsed script during the pitch if gesture hardware
misbehaves.

## Outstanding work

Kept out of the current build intentionally:

- **Speaker enrollment** — voice-ID to restrict responses to specific
  children. Needs an embedding model and an enrollment UI. Deferred as V2.
- **Image containers** — could render a tiny pixel-art moon / tree / animal
  glyph per topic. G2 supports image containers but not at page creation;
  `updateImageRawData` is serial-only.
- **IMU nod-to-save** — `imuControl(true, P200)` exposes x/y/z deltas; a
  0.4 g z-axis spike over 250 ms would map to save. Demo-day reliability
  concerns kept it in reserve.
- **Bilingual support** — Gemini handles it naturally; gated only by
  `supported_languages` in the manifest.

## References

- Even Hub docs: <https://hub.evenrealities.com/docs/>
- SDK source (installed locally, mirrors the docs but is authoritative):
  `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
- Gemini inline-audio + streaming: <https://ai.google.dev/gemini-api/docs>
- Harvard Center on the Developing Child, serve-and-return: <https://developingchild.harvard.edu/>
