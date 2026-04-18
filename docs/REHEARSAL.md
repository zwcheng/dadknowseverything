# Rehearsal Script — Build Day @ Thinkspace Seattle

5-minute demo slot. Opinionated timing, fallbacks pre-loaded, nothing left to chance.

## Pre-show checklist (10 min before)

- [ ] Laptop on venue WiFi. Open `npm run dev` and confirm `http://localhost:5173` loads
- [ ] Open simulator: `evenhub-simulator --glow --automation-port 9898 http://localhost:5173`
- [ ] Confirm `Live Gemini` button is green (not forced to stage). Verify `.env` key loaded
- [ ] Open slide deck in second browser tab: `http://localhost:5173/docs/slides.html`, press `F` for fullscreen
- [ ] Open terminal with pre-typed curl commands ready for automation fallback (see §Fallbacks)
- [ ] Edit the kid profile to a demo-ready name (Mia, 7, `space, dinosaurs, her dog Pepper`)
- [ ] Clear Wonder Trail (Reset button in profile card) so the demo starts clean
- [ ] Quick canned-stage run: toggle Stage on, drive auto-rehearsal with `R`, verify cards render, toggle back to Live

Keep a terminal open to `tail -f /tmp/evensim.log` during the demo — the only way to tell if the sim hit an error live.

## The 5-minute arc

### 0:00 — 0:20 · Opening (Slide 1)

> "Even built glasses that refused the AR playbook. No camera. No speaker. One tiny display per lens. They called it Quiet Tech.
>
> What I built is a product that wouldn't make sense on any other device."

*Leave on title slide. Don't skip ahead.*

### 0:20 — 0:50 · The moment (Slide 2)

> "Kids ask a hundred whys a day. Car rides. Grocery stores. Bedtime. Parents want to stay present — not pull out a phone every time. The other AR answer is a camera pointed at your kid, which nobody asked for."

*Arrow-right to slide 2.*

### 0:50 — 1:15 · The insight (Slide 3)

> "Research on early learning is clear: back-and-forth conversation — what Harvard calls serve-and-return — is what shapes language and reasoning. Small prompts meaningfully change how a family talks. The goal isn't to answer. It's to help the adult extend the moment."

*Arrow-right to slide 3.*

### 1:15 — 2:45 · LIVE DEMO — Answer mode (Slide 4)

Switch to sim window. Slide can stay as reference.

> "Double-press the temple..." `click double-press (D)` or speak into the mic
>
> *Transcript echoes: "Heard you: why is the moon out in the daytime?"*
>
> "SAY streams in from Gemini in under a second..."
>
> "ASK. TRY."  *click through with Space*
>
> "And to save it — I nod."  `click nod (N)`
>
> *Card switches to `Saved.` — Wonder Trail count increments*

**Fallback:** if Gemini silent or slow after 4s → switch to Stage mode in the phone UI, re-run.
**Fallback 2:** if the sim mic doesn't hear you → say "let me read this one out" and paste the canned moon question into the `.env`'s `VITE_STAGE_QUESTION` (not real — just describe the recovery).

### 2:45 — 3:30 · LIVE DEMO — Bounce mode (Slide 5)

> "Kids aren't always looking for answers. Sometimes they're looking to play."
>
> *`click swipe-down (B)` to flip mode while card is showing*
>
> *BOUNCE card: "Where do you think the moon goes during the day?"*
>
> *pause for laughter*
>
> *`click click (Space)` to reveal TWIST: "Does the moon take a nap?"*
>
> *more laughter — try to hold it*
>
> *`click click (Space)` → TRUTH: the real answer, ready for when the kid actually wants to know.*

**Key line to land right after:** "Same question. Two postures. The parent picks the moment — the glasses help them match it."

### 3:30 — 4:00 · Memory (Slide 6)

> "Every saved moment feeds a local profile. Next time Mia asks about the moon, Gemini knows her name, her reading level, and everything she's already asked. That's the with-memory column — her name, a callback to last week's question."
>
> "Local-first. Parent-editable. Never trained on. Never ad-targeted."

### 4:00 — 4:30 · Why Even G2 (Slide 7)

> "None of this works on anything else.
>
> No camera — privacy is default.
> No speaker — line-of-sight only.
> Tiny canvas — one idea per card. Discipline.
> 4-mic 16 kHz PCM — feeds Gemini with no resampling.
> Temple + IMU — two presses and a nod."
>
> "Plus: when you take the glasses off, the mic auto-stops. The product steps back when attention leaves. The hardware stance is the product posture."

### 4:30 — 4:55 · Platform (Slide 8)

> "Same hardware, same memory rails, different conversations. Tutor. Language partner. Clinical handoff. Neurodiverse scaffolding. Field inspection. Once the first lane ships, every other one gets easier.
>
> G2 becomes the reference platform for invisible copilots."

### 4:55 — 5:00 · Close (Slide 9)

> "Not school on glasses. A real-time curiosity copilot for family life.
>
> Everyday. Brand-fit. And — I hope — the crowd laugh."

*Leave on close slide for Q&A.*

## Anticipated questions + pre-loaded answers

**Q1: How does it handle safety topics? Medical stuff?**
> "Bounce mode has an explicit safety override in the system prompt — medical, injury, or emotional-distress topics force Answer shape regardless of the user's toggle. The model classifies first."

**Q2: What about voices that aren't your kid's?**
> "Today, any voice works. Speaker enrollment is a V2 feature — on-device embedding per kid. The memory moat ships first because it's the product; speaker ID is the polish."

**Q3: Is this on-device or cloud?**
> "Hybrid. Memory stays local — end-to-end encrypted when synced across parent devices. The model lives in Gemini's cloud today. On-device Gemini Nano is on the roadmap once audio inline support lands."

**Q4: Why Gemini over OpenAI / Claude / others?**
> "16 kHz PCM audio in, structured JSON out, native streaming, no resampling, `propertyOrdering` in the schema to stream SAY first. Flash is fast enough for sub-second first-token. Could swap — Claude Haiku 4.5 would be next pick."

**Q5: Will this get kids to talk to glasses instead of their parents?**
> "Opposite. The cards go to the *parent*, not the kid. The kid never sees them. It's scaffolding for the adult, not a replacement for them. That's why I call it a copilot — it helps you fly."

**Q6: What's the parent paying for?**
> "Free tier is local memory. Paid is cloud sync, multi-parent accounts, insights dashboard, curriculum-aligned exports. Zero ad tier on principle."

**Q7: What if it gets it wrong?**
> "Three cards per utterance. Swipe-up to retone (simple / playful / science). Swipe-down for Bounce. If all three fail — single-press to dismiss, no harm done. Latency on retone is half a second because we don't re-upload audio."

## Fallback plans

| If… | Do… |
|---|---|
| Gemini WSS blocked by venue WiFi | Toggle Stage mode. Flow is identical, canned content. |
| Sim mic can't hear in loud room | Paraphrase live: `curl -X POST ... double_click` then speak close to the laptop. |
| Sim hangs mid-demo | Kill + restart: `pkill -f evenhub-simulator; evenhub-simulator --glow --automation-port 9898 http://localhost:5173 &` |
| Profile got mangled | Reset button in phone UI resets to default Mia profile. |
| IMU nod doesn't trigger (sim mic missing) | Use `click nod (N)` dev button, say "you get the idea — on hardware this is a literal head nod." |
| Slide tab lost | It's at `/docs/slides.html`. Hash `#N` jumps to slide N. |
| Laptop crashes | GitHub URL on close slide; backup video on phone if possible. |

## Rehearsal targets

- Run through the full 5:00 arc **three times** end-to-end before the event
- Time each run. Target 4:30–5:00 (aim for 4:45 so there's room for laughter holds)
- Record one dry run to phone, review for pace and energy
- Rehearse the Bounce laugh hold — don't rush past the punchline
- Memorize the Why-Even line (0:20 opening) word-for-word
