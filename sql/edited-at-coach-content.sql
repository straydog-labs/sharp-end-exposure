-- edited_at for coach-authored chat, session notes, and private notes.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.

alter table public.coach_messages
  add column if not exists edited_at timestamptz;

alter table public.coach_notes
  add column if not exists edited_at timestamptz;

alter table public.coach_athlete_notes
  add column if not exists edited_at timestamptz;
