# DadKnowsEVERYTHING — Business One-Pager

A category-defining app for Even G2, and a wedge for the rest of the
platform. Written for the Even team and for developers deciding where to
invest.

## The problem

Smart glasses have spent a decade hunting for a killer category. Meta
Ray-Bans won on camera + voice. Vision Pro stumbled on price and utility.
Google Glass crashed on surveillance ick. The remaining white space —
**glanceable, private, in-person assistance** — is exactly where G2 lives.

What it lacks so far is a defining app. Parent-child curiosity is it.

## Why this category belongs on G2

| G2 constraint | Why it's the product | Why phones lose |
|---|---|---|
| No camera | privacy is default; parents welcome it around kids | every camera product triggers parental refusal |
| No speaker | quiet, line-of-sight only; doesn't hijack the moment | phone notifications pull the parent out |
| Tiny 576×288 canvas | forces one-idea-per-card; structure = discipline | 6" screens drown the moment in content |
| Temple gestures | two presses, zero fumbling | tapping a phone while driving or walking is worse than useless |
| 4-mic 16 kHz PCM | matches Gemini inline-audio exactly | generic stacks need resampling |

A generic phone app would *fight* this hardware. A whisper-quiet nudge
fits it perfectly.

## Value for Even Realities (the device co)

### What this unlocks

1. **A daily-active use case.** Kids ask questions every day. AR/VR's
   dirty secret is weekly DAU. Parent-child curiosity is genuinely daily.
2. **The "invisible copilot" category.** Once this works, the same rails
   ship for tutors, language partners, clinical rounds, neurodiverse
   scaffolding, first-responder handoffs. G2 becomes the reference
   platform for a *class*, not one of many AR devices.
3. **A hardware narrative that sells itself.** "Glasses that help me be a
   better parent" beats "glasses that show notifications" with every
   demographic that matters — and it travels through earned media
   (parenting influencers, tech blogs, education press) without paid
   support.
4. **A moat.** Memory — the curiosity profile that builds over months —
   grows the switching cost. More use, more lock-in.
5. **Services-tier revenue.** Memory storage, family accounts,
   multi-device sync, insights dashboards. Even can run this directly or
   license to partner apps.

### What could go wrong (and how this hedges)

- *"AR adoption is slow."* This product needs one parent per household,
  not the whole household. Lower bar than most AR pitches.
- *"Parents won't pay for glasses."* Free tier is local-only; paid tier
  unlocks cloud memory, multi-parent sync, insights. Hardware pays for
  itself; software is upside.
- *"ChatGPT will eat this."* No camera, no speaker, and the memory moat
  mean a phone chatbot can't catch up without a different form factor —
  which is precisely what Even already sells.

### Distribution angles

- **Education partnerships**: children's museums, curricula publishers,
  early-ed foundations. "Wonder Moments" are a fit with reading logs.
- **Parent communities**: pediatricians, parenting-influencer networks,
  early-learning nonprofits.
- **Retail halo**: "the glasses that make you a better parent" sells
  itself at Best Buy and on YouTube better than any spec sheet.

## Value for developers

Why build this on G2 specifically rather than as a generic AI-for-kids
phone app:

- **Immune to ChatGPT-clone dismissal.** Form factor is the product.
  Can't be copied by a chatbot.
- **Narrower support surface.** One hardware, one OS path. No 15 Android
  screen-size matrix.
- **First-mover premium.** Hub banner, Even comms, partnership pipeline.
- **Memory is a moat.** The longer a family uses it, the more expensive
  the migration.
- **Clean monetization ladder.** Free tier (local) → paid (cloud sync +
  insights) → school licensing → partnership plays (museums, publishers,
  subscription boxes, bilingual add-ons).

## The product shape that delivers

### Two modes, one wiser parent

- **Answer mode** — direct Say / Ask / Try cards for genuine curiosity
- **Bounce mode** — grounded playful counter-question for the 20th "why,"
  with a safety override that forces Answer on medical / danger /
  emotional topics

Mode can be set by the parent (swipe-down on the temple) or suggested by
memory (repeated question → Bounce · first-time curiosity → Answer ·
safety topic → Answer, always).

### Memory that grows into a product

- Kid profile (name, age, interests, reading level, notable facts)
- Wonder Moments (every saved question with full context)
- Learned preferences (topic frequency, preferred tone, concepts
  introduced, repeated questions)
- Timeline view: the kid's curiosity map over months, shareable as a
  portfolio artifact

Local-first today; cloud sync and insights dashboards are the natural
paid tier. Data never used for ad targeting or model training — binding
commitment.

### Streaming + stage-mode safety net

- Gemini 2.5 Flash over SSE with ordered JSON response schema so the
  SAY card reveals incrementally — perceived latency drops below 1 s.
- A stage-mode toggle serves pre-written canned answers with zero
  network calls — demo-day insurance against hostile venue WiFi, and a
  genuine offline posture for parents who want it.

## Metrics that matter

Any version of this that ships should measure, not guess:

| Metric | Why it matters |
|---|---|
| Questions asked per active day | Stickiness. Target 3+ by week 4. |
| Save rate | Are the cards worth keeping? Target ≥ 25%. |
| Retone rate (tone) | Do parents care about voice? Low = kill the feature. |
| Retone rate (mode) | Is Bounce actually fun? Target ≥ 15% on "why" questions. |
| Days-to-return | Session stickiness. Target 4+ of 7 days. |
| Timeline views per parent | Memory is doing the work? Target ≥ weekly. |
| P50 perceived latency | Pipeline health. Target ≤ 1.5 s. |

## Open questions worth deciding

1. **Who owns the account** — individual parent, or family (multi-parent
   sync)? Family unlocks the Wonder Trail as a shared artifact.
2. **Cloud identity** — is Even's existing account system enough, or does
   this spin up a new "Family" identity that the dev layer sees?
3. **Revenue split** — if this is published by a partner dev, what
   percentage of the paid tier flows where?
4. **Data commitments** — a written, binding stance on ad-targeting and
   training-data use is worth ~$0 to write and protects the whole
   category's trust.

## What this document is asking for

Not dollars, not engineers. Two things:

1. **Recognition that this is the category.** Invisible copilots for
   in-person moments is the lane only G2 can own. Pick it; commit to
   building the rails (identity, cloud sync, partnership program) around
   it.
2. **An open door for the demo-day dev.** Hub banner, comms support,
   introductions to the three museums and two children's media partners
   most likely to move first. Low cost to Even; large leverage on
   category velocity.
