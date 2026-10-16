-- Optional send style when Result = Sent: onsight | flash | redpoint.
-- Null is allowed. Never required. John applies this; do not run from the app.
-- Idempotent: safe to re-run.

alter table public.sessions
  add column if not exists tick_type text;

comment on column public.sessions.tick_type is
  'Optional send style when baseline_zone is sent: onsight | flash | redpoint. Null allowed.';

do $$
begin
  alter table public.sessions
    add constraint sessions_tick_type_check
    check (tick_type is null or tick_type in ('onsight', 'flash', 'redpoint'));
exception
  when duplicate_object then null;
end $$;
