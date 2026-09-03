-- Optional high-point note when Result = Took ("Where'd you take?").
-- Same relationship as fall-detail: not Go Deeper, not required.
-- John applies this; do not run from the app. Idempotent: safe to re-run.

alter table public.sessions
  add column if not exists take_high_point text;
