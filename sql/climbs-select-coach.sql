-- Linked coach can SELECT a linked athlete's climbs (read-only).
-- Coach-reads-athlete direction — same active coach_athlete_links gate as
-- gym_climbs_select_linked_athlete and profiles_select_linked_partner,
-- matching training_sessions_select_coach's coach→athlete orientation.
-- Does NOT add athlete-side project flags or beta-note tables
-- (those belong to the athlete Projects/beta-notes thread). Idempotent: safe to re-run.

drop policy if exists climbs_select_coach on public.climbs;
create policy climbs_select_coach on public.climbs
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.coach_athlete_links cal
      where cal.coach_id = auth.uid()
        and cal.athlete_id = climbs.user_id
        and cal.status = 'active'
    )
  );
