-- Tag coach-entered sessions so they are never silent athlete self-logs.
-- Idempotent: safe to re-run. No gym- or person-specific data.

alter table public.sessions
  add column if not exists logged_by_coach boolean not null default false;

alter table public.sessions
  add column if not exists logged_by uuid references auth.users(id);

comment on column public.sessions.logged_by_coach is
  'True when a linked coach logged this session for the athlete. Default false for athlete self-logs.';
comment on column public.sessions.logged_by is
  'auth.users.id of the coach who logged the session. Null unless logged_by_coach is true.';
