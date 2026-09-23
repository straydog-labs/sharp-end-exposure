-- Structured video-review / call notes on top of private coach_athlete_notes.
-- Additive only: existing rows keep note_type='general' via the column default.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run. Do not rewrite or backfill coach_athlete_notes.

-- Shared, growing tag list — not scoped to one coach, so tallies stay
-- comparable coach-to-coach.
create table if not exists public.coach_pattern_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists coach_pattern_tags_label_idx
  on public.coach_pattern_tags (label);

alter table public.coach_pattern_tags enable row level security;

grant select, insert on public.coach_pattern_tags to authenticated;
grant all on public.coach_pattern_tags to service_role;

drop policy if exists coach_pattern_tags_select_coach on public.coach_pattern_tags;
create policy coach_pattern_tags_select_coach on public.coach_pattern_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.coach_flags cf
      where cf.user_id = auth.uid() and cf.is_coach = true
    )
  );

drop policy if exists coach_pattern_tags_insert_coach on public.coach_pattern_tags;
create policy coach_pattern_tags_insert_coach on public.coach_pattern_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from public.coach_flags cf
      where cf.user_id = auth.uid() and cf.is_coach = true
    )
    and (created_by is null or created_by = auth.uid())
  );

create table if not exists public.coach_athlete_note_patterns (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.coach_athlete_notes(id) on delete cascade,
  tag_id uuid references public.coach_pattern_tags(id),
  kind text not null check (kind in ('dominant','secondary','breath','cue')),
  detail text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coach_athlete_note_patterns_note_idx
  on public.coach_athlete_note_patterns (note_id, sort_order);

alter table public.coach_athlete_note_patterns enable row level security;

grant select, insert, update, delete on public.coach_athlete_note_patterns to authenticated;
grant all on public.coach_athlete_note_patterns to service_role;

-- Same owner scope as coach_athlete_notes (coach_id = auth.uid()), via note_id.
drop policy if exists coach_athlete_note_patterns_via_note on public.coach_athlete_note_patterns;
create policy coach_athlete_note_patterns_via_note on public.coach_athlete_note_patterns
  for all to authenticated
  using (
    exists (
      select 1 from public.coach_athlete_notes n
      where n.id = coach_athlete_note_patterns.note_id
        and n.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coach_athlete_notes n
      where n.id = coach_athlete_note_patterns.note_id
        and n.coach_id = auth.uid()
    )
  );

alter table public.coach_athlete_notes
  add column if not exists note_type text not null default 'general';

alter table public.coach_athlete_notes
  drop constraint if exists coach_athlete_notes_note_type_check;
alter table public.coach_athlete_notes
  add constraint coach_athlete_notes_note_type_check
  check (note_type in ('general','call','video_review'));

comment on table public.coach_pattern_tags is
  'Shared pattern tags for coach video-review notes. Readable/insertable by any is_coach user.';
comment on table public.coach_athlete_note_patterns is
  'Tagged pattern rows on a private coach_athlete_notes note. RLS via parent note owner.';
comment on column public.coach_athlete_notes.note_type is
  'general (legacy free-text), call (Meet recap), or video_review (structured tags). Default general; no backfill.';
