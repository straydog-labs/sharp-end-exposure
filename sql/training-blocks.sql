-- Athlete-owned training blocks (multi-week season) + placed session rows.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.
--
-- Placing a session still writes a normal assignments row (coach_id null)
-- via the athlete self-assign pipeline. training_block_sessions.assignment_id
-- marks those rows so Train can live-read title/description from the linked
-- workout_library / custom_workouts item. Non-block assignments stay snapshots.

CREATE TABLE IF NOT EXISTS public.training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  start_date date NOT NULL,
  weeks integer NOT NULL CHECK (weeks >= 1 AND weeks <= 52),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_blocks_athlete_created_idx
  ON public.training_blocks (athlete_id, created_at DESC);

ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_blocks_select_own ON public.training_blocks;
CREATE POLICY training_blocks_select_own ON public.training_blocks
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS training_blocks_insert_own ON public.training_blocks;
CREATE POLICY training_blocks_insert_own ON public.training_blocks
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS training_blocks_update_own ON public.training_blocks;
CREATE POLICY training_blocks_update_own ON public.training_blocks
  FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS training_blocks_delete_own ON public.training_blocks;
CREATE POLICY training_blocks_delete_own ON public.training_blocks
  FOR DELETE TO authenticated
  USING (athlete_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.training_block_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.training_blocks(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  item_source text NOT NULL CHECK (item_source IN ('foundational', 'custom')),
  week_number integer NOT NULL CHECK (week_number >= 1),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  scheduled_date date NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_block_sessions_block_week_idx
  ON public.training_block_sessions (block_id, week_number, day_of_week);

CREATE INDEX IF NOT EXISTS training_block_sessions_assignment_idx
  ON public.training_block_sessions (assignment_id);

ALTER TABLE public.training_block_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_block_sessions_select_own ON public.training_block_sessions;
CREATE POLICY training_block_sessions_select_own ON public.training_block_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_blocks b
      WHERE b.id = training_block_sessions.block_id
        AND b.athlete_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS training_block_sessions_insert_own ON public.training_block_sessions;
CREATE POLICY training_block_sessions_insert_own ON public.training_block_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_blocks b
      WHERE b.id = training_block_sessions.block_id
        AND b.athlete_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS training_block_sessions_update_own ON public.training_block_sessions;
CREATE POLICY training_block_sessions_update_own ON public.training_block_sessions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_blocks b
      WHERE b.id = training_block_sessions.block_id
        AND b.athlete_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_blocks b
      WHERE b.id = training_block_sessions.block_id
        AND b.athlete_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS training_block_sessions_delete_own ON public.training_block_sessions;
CREATE POLICY training_block_sessions_delete_own ON public.training_block_sessions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_blocks b
      WHERE b.id = training_block_sessions.block_id
        AND b.athlete_id = auth.uid()
    )
  );

COMMENT ON TABLE public.training_blocks IS
  'Athlete-private multi-week training block (a season span). RLS: auth.uid() = athlete_id.';

COMMENT ON TABLE public.training_block_sessions IS
  'One placed template on a block day. item_source foundational|custom XOR. assignment_id is the self-assigned Train row.';
