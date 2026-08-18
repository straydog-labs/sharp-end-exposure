-- Private coach-only notes per athlete. Separate from coach_notes, which
-- backs the athlete-visible session comment thread.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.

create table if not exists public.coach_athlete_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id),
  athlete_id uuid not null,
  title text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.coach_athlete_notes enable row level security;

drop policy if exists coach_athlete_notes_owner_all on public.coach_athlete_notes;
create policy coach_athlete_notes_owner_all on public.coach_athlete_notes
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
