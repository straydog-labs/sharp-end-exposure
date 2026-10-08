-- Intentional practice falls are not failed attempts.
-- baseline_zone = 'fall_practice'; fall_count is how many practice falls.
-- John applies this; do not run from the app. Idempotent: safe to re-run.

alter table public.sessions
  add column if not exists fall_count integer;

comment on column public.sessions.fall_count is
  'Practice-fall count when baseline_zone is fall_practice. Null for other results.';
