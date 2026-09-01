-- Linked coach/athlete can read the other side's first_name/last_name.
-- Own-row profiles RLS stays in place. This only adds SELECT for an active
-- coach_athlete_links partner -- same link gate the rest of the app uses.
-- John applies this; do not run from the app.
-- Idempotent: safe to re-run.
--
-- Why RLS (not a new RPC): the athlete client already does
-- sbS('profiles', 'user_id=eq.' + coachId). Coach roster names already
-- come from the existing SECURITY DEFINER RPC coach_list_roster, so the
-- coach dashboard does not have this gap.

drop policy if exists profiles_select_linked_partner on public.profiles;
create policy profiles_select_linked_partner on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.coach_athlete_links l
      where l.status = 'active'
        and (
          (l.coach_id = auth.uid() and l.athlete_id = profiles.user_id)
          or (l.athlete_id = auth.uid() and l.coach_id = profiles.user_id)
        )
    )
  );
