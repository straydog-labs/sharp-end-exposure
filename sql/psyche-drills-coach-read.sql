-- Coach read of linked athletes' psyche_drills (breathing, PMR,
-- visualization, self-talk). Same active coach_athlete_links gate as
-- training_sessions_select_coach. Own-row athlete policies stay in place.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS psyche_drills_select_coach ON public.psyche_drills;
CREATE POLICY psyche_drills_select_coach ON public.psyche_drills
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_athlete_links cal
    WHERE cal.athlete_id = psyche_drills.user_id
      AND cal.coach_id = auth.uid()
      AND cal.status = 'active'
  )
);
