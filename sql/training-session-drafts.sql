-- In-progress Train session draft, one row per athlete.
-- John applies this on live Supabase; keep the file for the repo record.
-- Idempotent: safe to re-run.
-- Local storage stays primary. This table is the cross-device replica.
-- payload is the existing serialized draft. Cap is 256KB (262144 bytes).

create table if not exists public.training_session_drafts (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  assignment_id text,
  title text,
  started_at timestamptz,
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  explicit_save boolean not null default false,
  payload jsonb not null,
  constraint training_session_drafts_payload_size check (octet_length(payload::text) <= 262144)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_session_drafts_payload_size'
  ) then
    alter table public.training_session_drafts
      add constraint training_session_drafts_payload_size
      check (octet_length(payload::text) <= 262144);
  end if;
end $$;

alter table public.training_session_drafts enable row level security;

drop policy if exists training_session_drafts_select_own on public.training_session_drafts;
create policy training_session_drafts_select_own on public.training_session_drafts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists training_session_drafts_insert_own on public.training_session_drafts;
create policy training_session_drafts_insert_own on public.training_session_drafts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists training_session_drafts_update_own on public.training_session_drafts;
create policy training_session_drafts_update_own on public.training_session_drafts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists training_session_drafts_delete_own on public.training_session_drafts;
create policy training_session_drafts_delete_own on public.training_session_drafts
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.training_session_drafts to authenticated;
grant all on public.training_session_drafts to service_role;
