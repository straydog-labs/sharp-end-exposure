-- Coach-logged activation on sessions. Idempotent: safe to re-run.
-- John applies this; do not run from the app.

alter table public.sessions
  add column if not exists coach_activation_score numeric;

comment on column public.sessions.coach_activation_score is
  'Coach 0-10 activation score (step 0.5) from Log a climb. Null for athlete-logged rows.';
