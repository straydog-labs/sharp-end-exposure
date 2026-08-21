-- Coach read of linked athletes' training_sessions.
-- Parity with live sessions_select_coach (coach-layer-additions.sql, applied
-- on Supabase but not committed). Own-row policies in
-- sql/training-sessions-custom-workouts.sql stay in place.
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS training_sessions_select_coach ON public.training_sessions;
CREATE POLICY training_sessions_select_coach ON public.training_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_athlete_links cal
    WHERE cal.athlete_id = training_sessions.user_id
      AND cal.coach_id = auth.uid()
      AND cal.status = 'active'
  )
);
