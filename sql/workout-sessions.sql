-- Workout session templates + runs (STEP 0 schema proposal)
-- John applies this in the Supabase SQL editor. Do NOT apply from the app.
-- Idempotent: safe to re-run. Does not drop or rewrite existing tables.
--
-- REUSE (do not create parallel template/run tables)
--   Template  = public.custom_workouts
--   Run       = public.training_sessions
--
-- Why reuse
--   Train already stores reusable workouts in custom_workouts.sections (jsonb)
--   and logged sessions in training_sessions.blocks (jsonb). Coach Training
--   volume and the coach journal already read training_sessions. A new table
--   would split those charts and the Train hub.
--   training_blocks / training_block_sessions are a multi-week calendar, not
--   a session recipe. coach_athlete_pinned_workouts is a coach-private pin
--   for the assign wizard, not an athlete template. workout_library is the
--   foundational catalog (read-mostly). assignments is the due-work pointer
--   (library_item_id XOR custom_workout_item_id), not the recipe or the run.
--
-- Column mapping vs the data contract
--   owner_id              -> custom_workouts.created_by   (existing)
--   name                  -> custom_workouts.name         (existing)
--   blocks[]              -> custom_workouts.sections     (existing jsonb)
--   is_pinned             -> custom_workouts.is_starred   (existing)
--   created_by_role       -> NEW text coach|athlete
--   source_template_id    -> NEW uuid (set on an athlete-owned copy)
--   assigned_by           -> NEW uuid (coach who created the copy)
--   deleted_at/updated_at -> NEW on custom_workouts (runs already have deleted_at)
--   Run.template_id       -> NEW on training_sessions
--   Run.template_snapshot -> NEW jsonb (blocks as they were at start)
--   Run.completion        -> NEW jsonb map item_id -> bool
--   Run.blocks            -> existing jsonb (mutated during the session)
--   Run.energy_type       -> KEEP (NOT NULL in repo SQL; charts/journal use it)
--
-- Coach assign today LINKS the athlete at the coach-owned custom_workouts
-- row (no copy). Athlete SELECT of custom_workouts is created_by=self OR
-- visibility=shared, so a private coach workout is not readable by the
-- athlete. The INSERT policy below is what makes "copy owned by the athlete"
-- legal. App copy-on-assign is a later UI step; this file only unlocks it.
--
-- Hangboard suggestion (app, not SQL): when seeding a hangboard block from
-- a template, query the athlete's last 2 training_sessions for that
-- template_id (deleted_at is null, order started_at desc). If the same grip
-- had every set completed in both runs, suggest assistance_lb - step_lb.
-- Suggest only — never write the new assistance onto the template.
-- Function home: seedTrainSessionFromItem (index.html).
--
-- Block JSON (stored in custom_workouts.sections and training_sessions.blocks).
-- Live Train already uses `shape` not `type`, and `complete` not `completed`.
-- Keep those live keys. v1 types:
--   checklist     -> shape:'section' + child shape:'check' items
--   rest          -> shape:'check' (or later shape:'rest') + duration minutes
--   emom_boulders -> shape:'emom'  (live: completion per ROUND; v1 wants
--                    per boulder per round — additive on boulder objects)
--   circuit       -> shape:'circuit'
--   hangboard     -> shape:'rep_pass_fail' today (one grip); v1 grips[] is
--                    additive JSON, not a new table
--   notes         -> shape:'check' with notes
-- Every block/item keeps `id` (live already) and `complete` bool (live).
-- EMOM checkbox copy (UI later): "Checked = sent / completed successfully.
-- Unchecked = not sent." No result chips. No push to climb log.
--
-- Out of v1: timers (live already has them — leave them), climb-log push,
-- Mixed terrain.

-- ---------------------------------------------------------------------------
-- 1) custom_workouts — template columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS created_by_role text;

ALTER TABLE public.custom_workouts
  DROP CONSTRAINT IF EXISTS custom_workouts_created_by_role_check;
ALTER TABLE public.custom_workouts
  ADD CONSTRAINT custom_workouts_created_by_role_check
  CHECK (created_by_role IS NULL OR created_by_role IN ('coach', 'athlete'));

ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS source_template_id uuid
  REFERENCES public.custom_workouts(id);

ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS assigned_by uuid
  REFERENCES auth.users(id);

ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.custom_workouts.created_by_role IS
  'coach|athlete at insert. Null on rows created before this column.';
COMMENT ON COLUMN public.custom_workouts.source_template_id IS
  'When a coach assigns a copy, the athlete-owned row points at the source custom_workouts.id.';
COMMENT ON COLUMN public.custom_workouts.assigned_by IS
  'Coach user id who created the athlete-owned copy. Null for self-authored templates.';
COMMENT ON COLUMN public.custom_workouts.deleted_at IS
  'Soft delete. App must filter deleted_at is null.';
COMMENT ON COLUMN public.custom_workouts.sections IS
  'Template blocks jsonb. Dual shape already used in app: wizard {label,order,duration_sec,exercises[]} OR session blocks with shape (interval|emom|circuit|rep_pass_fail|section|check). Prefer session-shaped blocks for v1 EMOM.';
COMMENT ON COLUMN public.custom_workouts.is_starred IS
  'Athlete pin. Contract is_pinned maps here. Do not add a second pin column.';

CREATE INDEX IF NOT EXISTS custom_workouts_owner_live_idx
  ON public.custom_workouts (created_by, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS custom_workouts_source_idx
  ON public.custom_workouts (source_template_id)
  WHERE source_template_id IS NOT NULL AND deleted_at IS NULL;

-- Recreate RLS so: own rows; shared non-deleted; coach may INSERT an
-- athlete-owned copy for an active linked athlete. Coach does NOT get a
-- blanket SELECT on athlete copies (keeps them out of the coach catalog).
DROP POLICY IF EXISTS custom_workouts_select ON public.custom_workouts;
CREATE POLICY custom_workouts_select ON public.custom_workouts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR visibility = 'shared'
    )
  );

DROP POLICY IF EXISTS custom_workouts_insert ON public.custom_workouts;
CREATE POLICY custom_workouts_insert ON public.custom_workouts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR (
      assigned_by = auth.uid()
      AND created_by IS NOT NULL
      AND created_by <> auth.uid()
      AND created_by_role = 'athlete'
      AND source_template_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.coach_athlete_links cal
        WHERE cal.coach_id = auth.uid()
          AND cal.athlete_id = created_by
          AND cal.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS custom_workouts_update ON public.custom_workouts;
CREATE POLICY custom_workouts_update ON public.custom_workouts
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS custom_workouts_delete ON public.custom_workouts;
CREATE POLICY custom_workouts_delete ON public.custom_workouts
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) training_sessions — run columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.custom_workouts(id);

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS template_snapshot jsonb;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS completion jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.training_sessions.template_id IS
  'custom_workouts.id this run was started from. Null for a blank Build session.';
COMMENT ON COLUMN public.training_sessions.template_snapshot IS
  'Copy of template blocks at start. Live `blocks` is the mutated in-session JSON (complete flags, attempts, timers).';
COMMENT ON COLUMN public.training_sessions.completion IS
  'Map of item id → bool. Source of truth for v1 checkboxes; also mirrored on each block/item.complete.';
COMMENT ON COLUMN public.training_sessions.blocks IS
  'In-session jsonb (existing). Coach journal counts this array. Do not rename.';
COMMENT ON COLUMN public.training_sessions.energy_type IS
  'Required by existing Train + coach journal. Write the template training_focus here. Not in the v1 contract but must stay.';

CREATE INDEX IF NOT EXISTS training_sessions_template_started_idx
  ON public.training_sessions (user_id, template_id, started_at DESC)
  WHERE deleted_at IS NULL AND template_id IS NOT NULL;

-- Own-row + device + coach-read policies stay as defined in
-- sql/training-sessions-custom-workouts.sql and
-- sql/training-sessions-coach-read.sql. Additive columns inherit them.

-- ---------------------------------------------------------------------------
-- 3) assignments — no new columns
-- ---------------------------------------------------------------------------
-- Coach/athlete assign still writes an assignments row pointing at the
-- athlete-owned custom_workouts copy (custom_workout_item_id). Existing
-- XOR library_item_id / custom_workout_item_id is unchanged. Warm-up
-- remains assignments.warmup_custom_workout_item_id.
