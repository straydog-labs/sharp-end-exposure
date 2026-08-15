-- Build 211: one-time-per-terrain baseline calibration flags on the same
-- is_baseline=true row that holds baseline_terrain_state.

alter table public.sessions
  add column if not exists baseline_terrain_calibrated jsonb;

comment on column public.sessions.baseline_terrain_calibrated is
  'JSON object of terrain -> true once the athlete has completed the Climb Log calibration reveal for that rated terrain. Missing/false means still pending.';
