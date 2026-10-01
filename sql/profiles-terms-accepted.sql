-- Timestamped Terms of Service acceptance on profiles.
-- John applies this; do not run from the app. Idempotent: safe to re-run.
--
-- Written at athlete signup when the "I agree to the Terms" checkbox is
-- checked. Nullable so existing accounts stay valid.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles
  add column if not exists terms_version text;

comment on column public.profiles.terms_accepted_at is
  'When the athlete accepted Terms of Service at signup. Null for accounts created before this column.';
comment on column public.profiles.terms_version is
  'Terms "Last updated" string accepted (e.g. July 2026). Bump in the app when terms.html date changes.';
