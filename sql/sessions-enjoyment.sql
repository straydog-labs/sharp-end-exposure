-- Optional post-climb enjoyment rating from Go Deeper (1-5).
-- Null is allowed. Never required. John applies this; do not run from the app.
-- Idempotent: safe to re-run. Already applied live 2026-11.

alter table public.sessions
  add column if not exists enjoyment smallint;

comment on column public.sessions.enjoyment is
  'Optional Go Deeper rating 1-5 (How did you like it?). Null when unanswered.';

alter table public.sessions
  drop constraint if exists sessions_enjoyment_check;

alter table public.sessions
  add constraint sessions_enjoyment_check
  check (enjoyment is null or enjoyment between 1 and 5);
