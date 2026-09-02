-- Allow a linked coach to INSERT a session for their athlete.
-- Same coach_athlete_links gate as gym_climbs_select_linked_athlete
-- and profiles_select_linked_partner. Idempotent: safe to re-run.
-- Own-row athlete INSERT policies stay in place.

drop policy if exists sessions_insert_linked_coach on public.sessions;
create policy sessions_insert_linked_coach on public.sessions
  for insert
  to authenticated
  with check (
    logged_by_coach = true
    and logged_by = auth.uid()
    and exists (
      select 1
      from public.coach_athlete_links cal
      where cal.coach_id = auth.uid()
        and cal.athlete_id = sessions.user_id
        and cal.status = 'active'
    )
  );
