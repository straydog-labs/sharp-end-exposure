-- Gym climb catalog (coach-owned). Any coach authors their own rows.
-- Do not seed gym-specific data. gym_climbs.id is the stable UUID FK target
-- for athlete-side consumption (log cursor5 Part 2).
-- Idempotent: safe to re-run.

create table if not exists public.gym_climbs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  name text not null,
  wall_lane text,
  angle text,
  steepness text,
  terrain_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.gym_climbs
  drop constraint if exists gym_climbs_terrain_type_check;

alter table public.gym_climbs
  add constraint gym_climbs_terrain_type_check
  check (
    terrain_type is null
    or terrain_type in ('Slab', 'Vertical', 'Overhang', 'Roof', 'Crack')
  );

alter table public.gym_climbs
  drop constraint if exists gym_climbs_name_present;

alter table public.gym_climbs
  add constraint gym_climbs_name_present
  check (char_length(btrim(name)) > 0);

create index if not exists gym_climbs_created_by_idx
  on public.gym_climbs (created_by, deleted_at, created_at desc);

comment on table public.gym_climbs is
  'Coach-authored gym climb catalog. created_by is the owning coach. id is the stable FK for session/log references.';
comment on column public.gym_climbs.id is
  'Stable UUID primary key. Athlete-side logs should store this value as gym_climbs.id.';
comment on column public.gym_climbs.created_by is
  'Owning coach (auth.users.id). Not a gym name — any coach can build their own catalog.';
comment on column public.gym_climbs.wall_lane is
  'Wall or lane identifier as the coach labels it at their gym.';
comment on column public.gym_climbs.angle is
  'Wall angle as the coach records it (degrees or short label).';
comment on column public.gym_climbs.steepness is
  'Steepness label as the coach records it.';
comment on column public.gym_climbs.terrain_type is
  'Locked 5-value terrain taxonomy: Slab / Vertical / Overhang / Roof / Crack.';

alter table public.gym_climbs enable row level security;

grant select, insert, update, delete on public.gym_climbs to authenticated;

drop policy if exists gym_climbs_owner_all on public.gym_climbs;
create policy gym_climbs_owner_all on public.gym_climbs
  for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Linked athletes can read a coach catalog (Part 2 consumption). No gym-wide public dump.
drop policy if exists gym_climbs_select_linked_athlete on public.gym_climbs;
create policy gym_climbs_select_linked_athlete on public.gym_climbs
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or exists (
        select 1
        from public.coach_athlete_links cal
        where cal.coach_id = gym_climbs.created_by
          and cal.athlete_id = auth.uid()
          and cal.status = 'active'
      )
    )
  );
