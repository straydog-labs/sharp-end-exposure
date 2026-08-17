-- Build 212: coach_notes becomes a two-way per-session thread.
-- author_id is who wrote the row (coach or athlete). John has already
-- applied this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.

alter table public.coach_notes
  add column if not exists author_id uuid references auth.users(id);

update public.coach_notes
  set author_id = coach_id
  where author_id is null;

-- So coach-dashboard inserts that omit author_id still satisfy WITH CHECK.
alter table public.coach_notes
  alter column author_id set default auth.uid();

drop policy if exists coach_notes_participant_all on public.coach_notes;
create policy coach_notes_participant_all on public.coach_notes for all
using (auth.uid() = coach_id or auth.uid() = athlete_id)
with check ((auth.uid() = coach_id or auth.uid() = athlete_id) and author_id = auth.uid());
