-- Allow a linked coach to INSERT a training_sessions row for their athlete.
-- Same coach_athlete_links gate as sessions_insert_linked_coach.
-- John has already applied this live (logged_by_coach, logged_by, and
-- policy training_sessions_insert_linked_coach). Idempotent: safe to re-run.
-- Own-row athlete INSERT policies stay in place.

alter table public.training_sessions
  add column if not exists logged_by_coach boolean not null default false;

alter table public.training_sessions
  add column if not exists logged_by uuid references auth.users(id);

comment on column public.training_sessions.logged_by_coach is
  'True when a linked coach logged this training session for the athlete. Default false for athlete self-logs.';
comment on column public.training_sessions.logged_by is
  'auth.users.id of the coach who logged the session. Null unless logged_by_coach is true.';

drop policy if exists training_sessions_insert_linked_coach on public.training_sessions;
create policy training_sessions_insert_linked_coach on public.training_sessions
  for insert
  to authenticated
  with check (
    logged_by_coach = true
    and logged_by = auth.uid()
    and exists (
      select 1
      from public.coach_athlete_links cal
      where cal.coach_id = auth.uid()
        and cal.athlete_id = training_sessions.user_id
        and cal.status = 'active'
    )
  );
