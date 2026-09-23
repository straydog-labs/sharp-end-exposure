-- Optional pre-workout intention from the athlete check-in.
-- notes is already the session title, so this is a new nullable column.
-- John applies this; do not run from the app. Idempotent: safe to re-run.

alter table public.training_sessions
  add column if not exists intention text;

comment on column public.training_sessions.intention is
  'Optional athlete focus from the pre-workout check-in. Nullable. Separate from notes (session title).';
