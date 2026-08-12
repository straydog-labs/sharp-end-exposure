-- Training / custom workouts schema (build 198)
-- John runs this in Supabase; member app builds against this shape.
-- Confirm live column names if anything drifts.

-- 1) Expand workout_library.type and category for foundational catalog
-- type values: strength | power | endurance | capacity | skill_development | mobility
-- (enforce via app + optional check constraint)

ALTER TABLE public.workout_library
  DROP CONSTRAINT IF EXISTS workout_library_type_check;

ALTER TABLE public.workout_library
  ADD CONSTRAINT workout_library_type_check
  CHECK (type IS NULL OR type IN (
    'strength','power','endurance','capacity','skill_development','mobility'
  ));

-- 2) custom_workouts — coach/athlete customs, separate from foundational catalog
CREATE TABLE IF NOT EXISTS public.custom_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  description text,
  type text CHECK (type IS NULL OR type IN (
    'strength','power','endurance','capacity','skill_development','mobility'
  )),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('shared','private')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_workouts ENABLE ROW LEVEL SECURITY;

-- Mirror workout_library visibility intent:
-- select own private + all shared; insert own; update/delete own
DROP POLICY IF EXISTS custom_workouts_select ON public.custom_workouts;
CREATE POLICY custom_workouts_select ON public.custom_workouts
  FOR SELECT TO authenticated
  USING (
    visibility = 'shared'
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS custom_workouts_insert ON public.custom_workouts;
CREATE POLICY custom_workouts_insert ON public.custom_workouts
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS custom_workouts_update ON public.custom_workouts;
CREATE POLICY custom_workouts_update ON public.custom_workouts
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS custom_workouts_delete ON public.custom_workouts;
CREATE POLICY custom_workouts_delete ON public.custom_workouts
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Optional: same coach→shared / athlete→private trigger as workout_library
-- (skip if trigger already applied app-wide via a shared function)

-- 3) training_sessions — logged Train sessions with JSON blocks
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  device_id text,
  energy_type text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  warm_up text,
  cool_down text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS training_sessions_user_created_idx
  ON public.training_sessions (user_id, created_at DESC);

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_sessions_select_own ON public.training_sessions;
CREATE POLICY training_sessions_select_own ON public.training_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS training_sessions_insert_own ON public.training_sessions;
CREATE POLICY training_sessions_insert_own ON public.training_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS training_sessions_update_own ON public.training_sessions;
CREATE POLICY training_sessions_update_own ON public.training_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Anon/device path (parity with climb sessions): allow device_id inserts when no user
DROP POLICY IF EXISTS training_sessions_select_device ON public.training_sessions;
CREATE POLICY training_sessions_select_device ON public.training_sessions
  FOR SELECT TO anon, authenticated
  USING (device_id IS NOT NULL);

DROP POLICY IF EXISTS training_sessions_insert_device ON public.training_sessions;
CREATE POLICY training_sessions_insert_device ON public.training_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (device_id IS NOT NULL OR user_id = auth.uid());
