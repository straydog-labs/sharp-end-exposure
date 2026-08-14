-- Build 209: per-terrain self-reported pre-climb expectation on baseline rows.
-- Old sessions.baseline_terrain (text) is left in place, dormant. Do not drop it.

alter table public.sessions
  add column if not exists baseline_terrain_state jsonb;

comment on column public.sessions.baseline_terrain_state is
  'JSON object of terrain -> pre-climb-state option string from the baseline questionnaire. Blank terrains omitted. Replaces writing to baseline_terrain.';
