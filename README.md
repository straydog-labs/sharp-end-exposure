# Sharp End Exposure

**Pre-climb psychological readiness for climbers. Built by [Straydog Labs](https://straydog-labs.github.io).**

> *Better risk decisions start with awareness of your experience.*

---

## What it is

Sharp End Exposure is a somatic readiness tool for climbers. It helps you notice what your body is already telling you — before you commit to a route, and after you climb it. Over time, sessions build a personal dataset: your activation patterns, breathing responses, and how your body changes on routes at your limit.

It is not a decision-maker. It is a noticing tool. The decision stays with the climber.

---

## Three ways in

**Prepare** — before you commit. A somatic check-in while you're still deciding whether to attempt a route. Breathing, gut sensation, route thinking. The shift between first and second check-in is the signal. Takes 60 seconds.

**Log a Climb** — after you climb. Grade, terrain, result. Then optionally Go Deeper: breathing, gut, crux response, body state. Add route details: discipline, environment, rock type, bolt count, height.

**Start a Project** — for routes you're working over multiple sessions. Name it, set it up with full route details. Every session links to it automatically. Watch your zone arc, breathing patterns, and session focus evolve across attempts.

---

## My Sessions

Logged sessions build a personal intelligence layer:

- **Zone arc** — activation pattern across all sessions over time
- **Terrain radar** — where you spend your volume and how activated you are
- **Grade range** — session frequency by grade, color-coded by zone
- **Zone × terrain heatmap** — which features spike your activation
- **Breathing pattern** — post-climb respiratory distribution
- **Completion by zone** — send rate mapped to activation state
- **Routes & Projects** — any named route becomes trackable automatically

**Project detail screen** — zone arc for that specific route, session focus distribution (what you worked on each attempt), comparison vs your overall patterns, trend card (first N vs last N sessions), breathing across attempts, full session log.

---

## Philosophy

Built on the Rock Warrior's Way methodology developed by Arno Ilgner. The conceptual spine is conscious risk-taking: awareness of your experience as a precondition for better decisions at the sharp end.

Somatic signals used:
- **Breathing** — primary anchor (rate, depth, restriction)
- **Gut sensation** — secondary signal (Damasio's somatic marker hypothesis)

All language is neurodivergence-inclusive. No assumption of uniform nervous system response. Framed as "research suggests," "some climbers notice," "your experience may differ."

Key research anchors: Damasio (1994), Kabat-Zinn (1990), Levine (1997), Price & Hooven (2018), Barrett (2017).

---

## Built with

- **GitHub Pages** — single `index.html`, zero build step
- **Supabase** — anonymous session tracking via device ID (`see_did`)
- **Vanilla JS** — no framework, no dependencies
- **Space Grotesk + Space Mono** — typography

**Supabase tables:** `sessions`, `projects`, `falls`, `post_climb`, `incidents`, `feedback`, `post_climb_incidents`

---

## GTM strategy

Public-first, industry-second. Three stages:

1. **Public release** → organic dataset from everyday climbers
2. **Sender One informal pilot** → proof of model with a real gym
3. **CWA conversation** → institutional adoption, safety standard potential

The dashboard (`dashboard.html`) is a vision document for stages 2–3 — not current state. The 78% incident/Panic correlation is an early signal, not yet statistically conclusive. Credibility via intellectual honesty, not inflated projections.

---

## Status

Beta. Active development. Public launch imminent.

**Straydog Labs** — [straydog-labs.github.io](https://straydog-labs.github.io)

---

*"Expose your edge. Own your decision."*
