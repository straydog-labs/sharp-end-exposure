-- Build 191: Indoor/Outdoor detail fields on sessions
-- Reused existing columns (do NOT recreate):
--   discipline, rock_type, bolt_count, route_height_ft, setting
-- New columns below.

alter table public.sessions
  add column if not exists crux_count integer,
  add column if not exists gym_name text;

comment on column public.sessions.crux_count is 'Optional outdoor enrichment: number of cruxes (log-flow details screen, build 191)';
comment on column public.sessions.gym_name is 'Optional indoor enrichment: gym name free text (log-flow details screen, build 191)';
