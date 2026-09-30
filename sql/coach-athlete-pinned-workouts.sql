-- Per-athlete pinned workouts for the assign wizard, plus an optional
-- coach-private "skills to focus on" note on each pin.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.
--
-- Scoped as one note per pinned workout. A standalone per-athlete
-- "skills to focus on" field (independent of any workout) is a separate
-- addition later — not a rework of this table.

create table if not exists public.coach_athlete_pinned_workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id),
  athlete_id uuid not null,
  item_id uuid not null,
  item_source text not null check (item_source in ('custom', 'foundational')),
  focus_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, athlete_id, item_id, item_source)
);

create index if not exists coach_athlete_pinned_workouts_athlete_idx
  on public.coach_athlete_pinned_workouts (coach_id, athlete_id, updated_at desc);

alter table public.coach_athlete_pinned_workouts enable row level security;

grant select, insert, update, delete on public.coach_athlete_pinned_workouts to authenticated;
grant all on public.coach_athlete_pinned_workouts to service_role;

drop policy if exists coach_athlete_pinned_workouts_owner_all
  on public.coach_athlete_pinned_workouts;
create policy coach_athlete_pinned_workouts_owner_all
  on public.coach_athlete_pinned_workouts
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

comment on table public.coach_athlete_pinned_workouts is
  'Coach-private per-athlete pinned catalog items for the assign wizard. item_source matches applyWizardLibraryPick _source (custom | foundational).';
comment on column public.coach_athlete_pinned_workouts.focus_note is
  'Optional coach-private "skills to focus on" for this pin. Not athlete-visible.';
