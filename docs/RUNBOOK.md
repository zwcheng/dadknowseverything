# Runbook — Local Dev + On-Device Testing

Operational cheatsheet. Keep this open while iterating.

## Local dev (keep running)

### One-time setup (already done)

```bash
cd /Users/zcheng/Documents/evenG2
npm install
npm install -g @evenrealities/evenhub-simulator
# .env must exist at repo root with VITE_GEMINI_API_KEY=<your-key>
```

### Every session

**Terminal 1 — Vite dev server (leave running):**

```bash
cd /Users/zcheng/Documents/evenG2
npm run dev
```

→ App at <http://localhost:5173>. HMR pushes every edit within ~200ms to
every open client (browser, simulator, phone WebView).

**Terminal 2 — Simulator (optional, recommended):**

```bash
evenhub-simulator --glow --automation-port 9898 http://localhost:5173 > /tmp/evensim.log 2>&1 &
```

→ Desktop window renders the actual 576×288 G2 canvas. Automation API
listens on port 9898. Logs at `/tmp/evensim.log`.

**Terminal 3 — ad-hoc curl + log tailing:**

```bash
# Watch the sim log in real time
tail -f /tmp/evensim.log

# Drive gestures from the CLI when you don't want to touch the sim window
curl -sX POST -H 'Content-Type: application/json' \
  -d '{"action":"double_click"}' http://127.0.0.1:9898/api/input
# Valid actions: click · double_click · up · down
```

### Browser preview

Open <http://localhost:5173>. The phone-side UI + G2 canvas preview + dev
panel all live here. HMR reloads everything on file save.

| Key | Action |
|---|---|
| `D` | double-press |
| `Space` / `Enter` | single-press |
| `T` | swipe-up (retone) |
| `B` | swipe-down (flip Answer ↔ Bounce) |
| `N` | nod (IMU save) |
| `S` | shake (IMU retone) |
| `R` | auto-drive full rehearsal cycle |

### Slide deck

<http://localhost:5173/docs/slides.html> — arrow keys / `Space`, `F` for
fullscreen, `#N` in URL jumps to slide N.

### Clean restart

```bash
lsof -iTCP:5173 -sTCP:LISTEN -t | xargs -r kill   # kill vite
pkill -f evenhub-simulator                        # kill sim
# … then re-run the Terminal 1 / Terminal 2 commands above
```

## On-device (real G2)

### Prerequisites

- G2 paired with your phone over BT 5.2
- Even Realities app installed + signed in on the phone
- Mac and phone on the **same WiFi network** (the phone WebView will fetch
  from your Mac's LAN IP, so client-isolation WiFi won't work)
- `.env` key still set

### Deploy dev build to the glasses (hot-reload flow)

```bash
# 1. Find your Mac's LAN IP (usually en0 for WiFi)
ipconfig getifaddr en0
# → e.g. 192.168.1.47

# 2. Vite must be listening on 0.0.0.0, not just localhost.
#    (Our package.json already passes --host, so `npm run dev` binds all.)

# 3. Generate a QR pointing at your LAN IP
npx evenhub qr --url "http://<your-ip>:5173"
# → prints an ASCII QR + a tiny PNG in /tmp
```

Scan the QR with the Even Realities phone app:

- Open the phone app → Dev / Sideload menu → Scan
- App loads the URL in its embedded WebView
- G2 wakes up, renders the idle screen ("DadKnowsEVERYTHING /
  double-press to listen")

**Hot reload works over LAN** — save a file, G2 re-renders within ~200ms.

### Drive the flow on real G2

- **Double-press the right temple** → LISTENING
- **Speak your question** into the glasses mic (4-mic array on the frames)
- **Single-press** to stop listening early → THINKING → card
- **Single-press** to cycle SAY → ASK → TRY
- **Double-press** OR **nod your head** to save to Wonder Trail
- **Swipe-up** (forward along temple) OR **shake** to retone
- **Swipe-down** (backward along temple) to flip Answer ↔ Bounce
- **Take the glasses off** mid-listen → mic auto-stops (Quiet Tech guard)

### Package for submission (.ehpk)

```bash
npm run build        # vite build → dist/
npm run pack         # evenhub pack app.json dist -o dadknowseverything.ehpk
```

Upload the `.ehpk` via the Even Hub developer portal.

## Common gotchas

| Symptom | Fix |
|---|---|
| `VITE_GEMINI_API_KEY` appears empty in the app | You have an empty `.env.local` overriding `.env`. Comment out or delete the blank line. Vite's `.local` wins. |
| Port 5173 busy | `lsof -iTCP:5173 -sTCP:LISTEN -t \| xargs -r kill` |
| Sim window won't open | `pkill -f evenhub-simulator; evenhub-simulator --glow --automation-port 9898 http://localhost:5173 &` |
| Phone can't reach the dev server | You're on venue WiFi with client isolation. Hotspot from your phone, or connect both to the same non-guest network. |
| Gemini timing out / rate-limited | Toggle Stage mode in the phone UI. Flow is identical, canned content, zero network. |
| Sim log full of `glyph dsc. not found for U+…` warnings | Extended Unicode missing from the LVGL font. Switch to ASCII (we've already done this for spinner + topic glyphs). |
| Audio not reaching Gemini | Check the sim log for `using: MacBook Pro Microphone` at the moment you fire `double_click`. No line = mic wasn't grabbed. Grant mic permission to Terminal / evenhub-simulator in System Settings → Privacy & Security → Microphone. |
| `textContainerUpgrade failed: container 1 not found` | The startup page creation failed. Watch vite logs during mount; usually a JSON shape issue. |
| Memory stuck on wrong profile | Reset button in the phone UI's Kid Profile card wipes and reseeds. |

## Logs + state inspection

```bash
# Simulator (mic events, LVGL warnings)
tail -f /tmp/evensim.log

# Vite dev server (terminal 1, stays in foreground)

# Browser console — open devtools on http://localhost:5173
# Look for [wondercue] and [dk] prefixes.

# LocalStorage (from browser devtools Console)
JSON.parse(localStorage.getItem('wc:memory'))   // full memory blob
localStorage.getItem('dk:stage')                // '1' = stage on
localStorage.getItem('dk:images')               // '1' = image container on
```

## Quick automation sequences

```bash
# Full 5-step flow: listen → stop → cycle ASK → cycle TRY → save
curl -sX POST -d '{"action":"double_click"}' -H 'Content-Type: application/json' http://127.0.0.1:9898/api/input && sleep 3 && \
curl -sX POST -d '{"action":"click"}' -H 'Content-Type: application/json' http://127.0.0.1:9898/api/input && sleep 2 && \
curl -sX POST -d '{"action":"click"}' -H 'Content-Type: application/json' http://127.0.0.1:9898/api/input && sleep 1 && \
curl -sX POST -d '{"action":"click"}' -H 'Content-Type: application/json' http://127.0.0.1:9898/api/input && sleep 1 && \
curl -sX POST -d '{"action":"double_click"}' -H 'Content-Type: application/json' http://127.0.0.1:9898/api/input
```

## While iterating

Leave the three terminals open. When you change code, HMR handles the
reload. When you change `.env`, you must restart Vite. When you change
`app.json`, you must re-pack.
