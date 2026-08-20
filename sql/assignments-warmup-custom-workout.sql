-- Optional warm-up template on an assignment, independent of the
-- library_item_id XOR custom_workout_item_id session workout.
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run. Do not change the XOR constraint.

alter table public.assignments
  add column if not exists warmup_custom_workout_item_id uuid
  references public.custom_workouts(id);

comment on column public.assignments.warmup_custom_workout_item_id is
  'Optional custom_workouts row (training_focus Warm-Ups) attached as the session warm-up. Independent of the main library/custom XOR.';
