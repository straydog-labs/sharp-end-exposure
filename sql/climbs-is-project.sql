-- Athlete-owned project flag on a named climb.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.
--
-- Ownership/RLS stay on public.climbs (this column is patched with the
-- same id=eq.<id> UPDATE the app already uses for name / beta_notes /
-- deleted_at). No new policy.

alter table public.climbs
  add column if not exists is_project boolean not null default false;

comment on column public.climbs.is_project is
  'Athlete-starred project. Default false. Toggle is a single PATCH of this column.';
