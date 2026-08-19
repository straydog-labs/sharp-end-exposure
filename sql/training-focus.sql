-- training_focus on foundational + custom catalogs (Coach/Log taxonomy redesign)
-- John runs this in the Supabase SQL editor. Do not apply from the app.
--
-- Locked values (exact strings):
--   Boulders, Routes, Boards, Hangboard, Strength & Weights,
--   Mobility & Flexibility, Technique & Footwork, Cardio & Capacity, Mental/Other
--
-- Column is nullable so existing rows stay readable until backfilled.
-- App filters on training_focus when present, else maps legacy category/type.

ALTER TABLE public.workout_library
  ADD COLUMN IF NOT EXISTS training_focus text;

ALTER TABLE public.custom_workouts
  ADD COLUMN IF NOT EXISTS training_focus text;

ALTER TABLE public.workout_library
  DROP CONSTRAINT IF EXISTS workout_library_training_focus_check;
ALTER TABLE public.workout_library
  ADD CONSTRAINT workout_library_training_focus_check
  CHECK (training_focus IS NULL OR training_focus IN (
    'Boulders',
    'Routes',
    'Boards',
    'Hangboard',
    'Strength & Weights',
    'Mobility & Flexibility',
    'Technique & Footwork',
    'Cardio & Capacity',
    'Mental/Other'
  ));

ALTER TABLE public.custom_workouts
  DROP CONSTRAINT IF EXISTS custom_workouts_training_focus_check;
ALTER TABLE public.custom_workouts
  ADD CONSTRAINT custom_workouts_training_focus_check
  CHECK (training_focus IS NULL OR training_focus IN (
    'Boulders',
    'Routes',
    'Boards',
    'Hangboard',
    'Strength & Weights',
    'Mobility & Flexibility',
    'Technique & Footwork',
    'Cardio & Capacity',
    'Mental/Other'
  ));
