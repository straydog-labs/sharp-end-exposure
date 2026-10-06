-- Athlete-starred flag on a saved custom workout (Train pinned row).
-- Mirrors sql/climbs-is-project.sql: one boolean column, same-row PATCH.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.
--
-- Ownership/RLS stay on public.custom_workouts (this column is patched with
-- the same created_by = auth.uid() UPDATE the app already uses). No new policy.
--
-- Until this is applied, Train pinned falls back to the 3 most recent
-- custom_workouts and star toggles fail closed (toast, no local lie).

alter table public.custom_workouts
    add column if not exists is_starred boolean not null default false;

comment on column public.custom_workouts.is_starred is
  'Athlete-starred saved workout. Default false. Toggle is a single PATCH of this column.';
