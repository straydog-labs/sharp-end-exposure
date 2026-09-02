-- Athlete-side gym climb catalog (Part 2).
-- gym_climbs already exists from coach PR #97 (sql/gym-climbs.sql).
-- This file only adds the nullable FK on sessions. John applies this;
-- do not run from the app. Idempotent: safe to re-run.
--
-- sessions.gym_climb_id is nullable. Freeform logging (no pick) stays valid
-- for athletes whose coach has no catalog yet.

alter table public.sessions
  add column if not exists gym_climb_id uuid references public.gym_climbs(id);
