# Sharp End Exposure

**A climb log that tracks your body, not just your grades. Built by [Straydog Labs](https://straydog-labs.github.io).**

> *Sharpen your awareness. Expose your edge.*

---

## What it is

Sharp End Exposure is a climb-logging app that tracks your somatic response to routes, grades, and situations over time — building behavioral self-awareness until the pre-climb check-in becomes automatic. It's not a decision-maker. It's a noticing tool. The decision stays with the climber, and the data stays self-reported, not clinical.

*Our words, your body.*

---

## Four tabs

**Climb Log** — the core loop. Log a climb (grade, terrain, result), then Go Deeper: four questions on breathing, gut sensation, crux response, and body state confirm which activation zone you were actually in. Add an optional reflection (what went well, what to work on, what surprised you). Every logged session feeds your Climb Log home — Zone by Terrain radar across all seven terrain types, your activation arc over time, and a Climb History table you can drill into.

**Drill** — structured, deliberate practice. Predict your zone before you climb, check in, climb it, log post-climb, and see how prediction and reality compare.

**Research** — the science behind the questions: the somatic markers being tracked and why, in plain language.

**Profile** — baseline (with history — you can retake it and see how it's shifted), account settings, and data export (CSV/JSON/print).

---

## Activation, not just a label

Your body state doesn't sort cleanly into three boxes. Confirmed sessions resolve to a continuous 0–12 activation score, shown as a gauge — not a hard "Comfort / Learning / Panic" wall. The gauge marks a sweet-spot band for optimal learning, because performance and learning peak at moderate activation and decline past it (Yerkes-Dodson), not "the deeper in, the better." You can drag the gauge yourself if a reading doesn't feel right — a manual override that's tracked distinctly from a confirmed Go Deeper answer or a pre-confirmation estimate, so the data stays honest about where it came from.

---

## Route history

Any named climb becomes trackable automatically — no separate setup step. Tap a route's name anywhere it appears and you get that route's own history: attempt count and sends, a zone arc for that route specifically, an Insights card comparing your pattern on this route against your overall terrain average, the full attempt list with expandable reflection notes, and a place for persistent route beta.

---

## Philosophy

Built on the Rock Warrior's Way methodology developed by Arno Ilgner. The conceptual spine is conscious risk-taking: awareness of your experience as a precondition for better decisions at the sharp end.

Somatic signals tracked via Go Deeper:
- **Breathing** — primary anchor (held, restricted, easy and steady)
- **Gut sensation** — secondary signal (Damasio's somatic marker hypothesis)
- **Crux response** — how you handled the hardest moment (paused, backed off, pushed through, panicked)
- **Body state** — overall physical read (settled, activated but manageable, tight and reactive, hard to read)

All language is neurodivergence-inclusive. No assumption of uniform nervous system response. Framed as "research suggests," "some climbers notice," "your experience may differ."

Key research anchors: Damasio (1994), Kabat-Zinn (1990), Levine (1997), Price & Hooven (2018), Barrett (2017), Yerkes & Dodson (1908).

---

## Built with

- **GitHub Pages** — single `index.html`, zero build step
- **Supabase** — account-based auth with row-level security; `sessions` and `climbs` are the active tables behind everything described above
- **Vanilla JS** — no framework, no dependencies
- **Space Grotesk + Space Mono** — typography

---

## GTM strategy

Public-first, industry-second. Three stages:

1. **Public release** → organic dataset from everyday climbers
2. **Sender One informal pilot** → proof of model with a real gym
3. **CWA conversation** → institutional adoption, safety standard potential

The 78% incident/Panic correlation is an early signal, not yet statistically conclusive. Credibility via intellectual honesty, not inflated projections.

---

## Status

Beta. Active development, core mechanics still being hardened before feature expansion.

**Straydog Labs** — [straydog-labs.github.io](https://straydog-labs.github.io)

---

*Sharpen your awareness. Expose your edge.*
