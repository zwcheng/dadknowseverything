# Rehearsal Script — Build Day @ Thinkspace Seattle

5-minute demo slot. 7 slides. Opinionated timing, fallbacks pre-loaded,
nothing left to chance.

Deck lives at `docs/slides.html`. Press `P` during presentation to hide
the speaker-note footers on each slide.

## Pre-show checklist (10 min before)

- [ ] Laptop on venue WiFi. Open `npm run dev` and confirm `http://localhost:5173` loads
- [ ] Open simulator: `evenhub-simulator --glow --automation-port 9898 http://localhost:5173`
- [ ] Confirm `Live Gemini` button is green (not forced to stage). Verify `.env` key loaded
- [ ] Open deck in a second browser tab: `http://localhost:5173/docs/slides.html`, press `F` for fullscreen, `P` to hide the footer speaker notes during presentation
- [ ] Open a terminal with the fallback curl commands ready (see §Fallbacks)
- [ ] Edit the kid profile to a demo-ready name (default is Even, age 7, `space, dinosaurs, her dog Pepper`)
- [ ] Clear Wonder Trail (Reset button in profile card) so the demo starts clean
- [ ] Stage-mode dry run: toggle Stage on, drive auto-rehearsal with `R`, verify cards render, toggle back to Live
- [ ] Speak one real question through the sim mic to confirm `resolve: live (X.Xs)` shows in the diag chip

Keep a terminal open to `tail -f /tmp/evensim.log` during the demo.

## Slide flow (5:00 total · ~45s per slide)

### Slide 1 — Title · 0:00–0:25

> "Even built glasses that refused the AR playbook. No camera. No speaker. One tiny display per lens — they call it **Quiet Tech**.
>
> DadKnowsEVERYTHING is a real-time **curiosity copilot** for parent-child moments. It's built for a device nobody else could have shipped."

Hit the three prize chips with your eyes briefly before advancing.

### Slide 2 — The whole picture · 0:25–1:25

This is the one-pager. If the clock runs out anywhere after this slide, you've already landed the whole story.

> "Four things sitting next to each other on this slide.
>
> **The moment** — kids ask a hundred whys a day. Parents want to stay present. Phones pull you out. Camera-AR glasses are worse — nobody wants a lens pointed at their kid.
>
> **The product** — double-press, kid asks, three cards on the glasses. Answer mode for the what. Bounce mode for the play. Nod to save.
>
> **The category** — invisible copilots for in-person moments. Tutor, clinical, neurodiverse, field work — same rails, different conversations. G2 is the only device this class runs on.
>
> **The moat** — memory grows. Local-first profile that learns what the kid asked, how they think, what they're into. Next answer is personalized. Harder to replicate elsewhere."

### Slide 3 — Demo · Answer mode · 1:25–2:40

Switch focus to the simulator window. Slide stays up as reference.

> "Let me show you. Double-press..."  `curl -X POST ... double_click`
>
> *Speak clearly:* "why is the moon out in the daytime?"
>
> "Click to stop..."  `curl -X POST ... click`
>
> *SAY appears word-by-word as Gemini streams. ~500 ms to first text.*
>
> "SAY. ASK. TRY."  *click through with each*
>
> "And I nod to save."  *nod head — IMU catches it*
>
> *Card flips to `Saved.` Wonder Trail count ticks.*

Timing target: from stop-click to first word on glasses under one second.

### Slide 4 — Demo · Bounce mode · 2:40–3:20

> "But kids aren't always looking for answers. Sometimes they're looking to play."
>
> *Swipe-down to flip mode while the card is still up.*
>
> *BOUNCE card: "Where do you think the moon goes during the day?"*
>
> *Pause for laughter.*
>
> *Click to reveal TWIST: "Does the moon take a nap?"*
>
> *Pause — hold the beat.*
>
> "Same question. Two postures. The parent picks the moment — the glasses help them match it.
>
> Safety override in the prompt forces Answer for anything medical or serious. Bounce never dodges a real question."

### Slide 5 — Blueprint · 3:20–3:55

Advance to the blueprint one-pager.

> "Everything you just saw fits on this slide.
>
> Left side: the feature checklist. Audio capture, streaming into the thinking view, card cycle, tone and mode retone, IMU nod, auto-pause when the glasses come off, memory profile, stage-mode offline fallback — all built, all on stage today.
>
> Right side: the loop. G2 mic to phone WebView to Gemini to glasses display. One phone, one model, one HTTPS stream, flicker-free `textContainerUpgrade` on the way back.
>
> Vite + React + TypeScript. Gemini 2.5 Flash inline audio. No backend — memory is localStorage. The whole thing is ~1500 lines."

### Slide 6 — Memory + platform · 3:55–4:30

> "Memory is the moat. Platform is the lane.
>
> Left: Even's profile builds over use. 'Why is the moon out in the daytime' gets answered differently once memory knows she asked about it last week. Local-first, parent-editable, never trained on, never ad-targeted.
>
> Right: five more lanes that share the same G2 rails. Tutor. Language partner. Clinical care. Neurodiverse scaffolding. Field work. We built one today — the other five are easier because of it."

### Slide 7 — Close · 4:30–5:00

> "Not school on glasses. A real-time curiosity copilot for family life.
>
> Everyday use case. Brand fit. People's choice.
>
> *(pause · hold eye contact · 2 seconds)*
>
> Thanks. Questions?"

## Anticipated questions + pre-loaded answers

**Q1: How does it handle safety topics? Medical stuff?**
> "Bounce mode has an explicit safety override in the system prompt — medical, injury, or emotional-distress topics force Answer shape regardless of mode. The model classifies first. We'd combine with a safer model or an audit pipeline for production."

**Q2: What about voices that aren't your kid's?**
> "Today, any voice works. Speaker enrollment is a V2 feature — on-device embedding per kid. The memory moat ships first because it's the product; speaker ID is the polish."

**Q3: Is this on-device or cloud?**
> "Hybrid. Memory is local — end-to-end encrypted when synced across parents. Model is Gemini cloud today. On-device (Gemini Nano) is on the roadmap once audio inline support lands."

**Q4: Why Gemini over OpenAI / Claude / others?**
> "16 kHz PCM audio in, structured JSON out, native streaming, `propertyOrdering` to land SAY first. Flash gets us sub-second first-token. Claude Haiku 4.5 would be the swap-in if we ever needed it — same latency profile."

**Q5: Will this get kids talking to glasses instead of their parents?**
> "Opposite. The cards go to the *parent*, not the kid. The kid never sees them. It's scaffolding for the adult, not a replacement. That's why I call it a copilot — it helps you fly, not flies for you."

**Q6: What's the business model?**
> "Free tier is local memory. Paid is cloud sync, multi-parent accounts, insights dashboard, curriculum exports. Zero ad tier on principle."

**Q7: What if it gets the answer wrong?**
> "Three cards per utterance. Swipe-up to retone (simple / playful / science). Swipe-down for Bounce. If all three fail — single-press to dismiss, nothing saved. Retone is half a second because we don't re-upload audio."

**Q8: Latency feels instant — how?**
> "Streaming JSON response with `propertyOrdering` so SAY's tokens arrive first. We paint them directly into the thinking view as they stream in. First visible text lands under 500 ms from stop-click. No transcript-echo beat — the streaming IS the feedback."

## Fallback plans

| If… | Do… |
|---|---|
| Gemini timing out / WiFi blocked | Phone UI → toggle **Stage mode** (canned Q/A). Flow identical. Say "here's the offline path — same flow, zero network." |
| Sim mic can't hear you in a loud room | Paraphrase live. Or pre-record the canned question WAV to `/tmp` and pipe via sox into the sim mic. |
| Sim hangs mid-demo | `pkill -f evenhub-simulator; evenhub-simulator --glow --automation-port 9898 http://localhost:5173 &` |
| Profile corrupted | Reset button in phone UI seeds default Even profile. |
| IMU nod doesn't fire | Click the `nod (N)` dev button. Say "you get the idea — on the real hardware this is a literal head nod." |
| Slide tab lost | `http://localhost:5173/docs/slides.html#N` jumps to slide N. |
| Laptop crashes mid-pitch | Repo URL on close slide. Walk the rest verbally. |

## Rehearsal targets

- Run the full 5:00 three times before the event. Time each run
- Target 4:30–5:00 — leave room for laughter on Bounce
- Record one dry run to phone; review for pace and energy
- Rehearse the Bounce laugh **hold** — don't rush past the punchline
- Memorize the Quiet Tech opener and the close tagline word-for-word

## Speaker-notes toggle

Each slide has a small muted footer with a timing and framing hint for
the presenter. Press `P` to hide them during the live presentation — the
audience shouldn't see your cheat sheet.
