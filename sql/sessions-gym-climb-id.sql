-- Athlete-side gym climb catalog (Part 2).
-- Compatible with coach Part 1: CREATE IF NOT EXISTS plus additive columns
-- so any coach catalog shape still works. John applies this; do not run from the app.
-- Idempotent: safe to re-run.
--
-- sessions.gym_climb_id is nullable. Freeform logging (no pick) stays valid
-- for athletes whose coach has no catalog yet.

create table if not exists public.gym_climbs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text,
  wall text,
  lane text,
  terrain text,
  climbing_type text,
  grade_value text,
  discipline text,
  gym_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.gym_climbs add column if not exists name text;
alter table public.gym_climbs add column if not exists wall text;
alter table public.gym_climbs add column if not exists lane text;
alter table public.gym_climbs add column if not exists terrain text;
alter table public.gym_climbs add column if not exists climbing_type text;
alter table public.gym_climbs add column if not exists grade_value text;
alter table public.gym_climbs add column if not exists discipline text;
alter table public.gym_climbs add column if not exists gym_name text;
alter table public.gym_climbs add column if not exists deleted_at timestamptz;

alter table public.gym_climbs enable row level security;

-- Linked athletes can read their coach's catalog. Coach can read own rows.
drop policy if exists gym_climbs_select_linked on public.gym_climbs;
create policy gym_climbs_select_linked on public.gym_climbs
  for select to authenticated
  using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.coach_athlete_links l
      where l.coach_id = gym_climbs.coach_id
        and l.athlete_id = auth.uid()
        and l.status = 'active'
    )
  );

-- Coach writes stay coach-owned (Part 1). Harmless if coach SQL adds the same.
drop policy if exists gym_climbs_write_own on public.gym_climbs;
create policy gym_climbs_write_own on public.gym_climbs
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

grant select, insert, update, delete on public.gym_climbs to authenticated;
grant all on public.gym_climbs to service_role;

alter table public.sessions
  add column if not exists gym_climb_id uuid references public.gym_climbs(id);
