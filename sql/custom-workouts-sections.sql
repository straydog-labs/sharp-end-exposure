-- Optional ordered session sections on coach/athlete custom workouts.
-- Empty/null means athlete Train falls back to a single free-text description.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.

alter table public.custom_workouts
  add column if not exists sections jsonb;

comment on column public.custom_workouts.sections is
  'JSON array of {label, order} checklist blocks the athlete sees during a session. Null/empty = free-text description only.';
