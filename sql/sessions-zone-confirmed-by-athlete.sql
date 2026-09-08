-- Athlete confirmation of a coach-logged activation zone.
-- Idempotent: safe to re-run. Additive, nullable-safe (NOT NULL default false).

alter table public.sessions
  add column if not exists zone_confirmed_by_athlete boolean not null default false;

comment on column public.sessions.zone_confirmed_by_athlete is
  'True after the athlete replaces a coach-logged zone with their own felt read. Default false. logged_by_coach stays true.';
