-- Dated beta-note log per climb. Replaces writing to climbs.beta_notes
-- (that column stays in place, dormant; do not drop it).
-- John applies this on live Supabase; keep the file for repo history.
-- Idempotent: safe to re-run.
--
-- Ownership/RLS: there is no climbs policy dump in this repo. Live app
-- behavior (confirmed by client queries + anon REST probes):
--   * climbs carries user_id AND device_id
--   * signed-in reads/writes filter user_id=eq.<auth>
--   * anonymous reads/writes filter device_id=eq.<see_device_id>
--   * both the `anon` and `authenticated` roles can touch climbs
-- climb_beta_notes does not duplicate user_id/device_id. A caller may
-- SELECT/INSERT/UPDATE a note iff they can see the parent climbs row
-- (EXISTS + climbs RLS applies inside the subquery). That is the same
-- ownership model, not a new one, so device-based users keep note-taking.
-- Soft-delete via deleted_at (standard here). No hard DELETE from the app.

create table if not exists public.climb_beta_notes (
  id uuid primary key default gen_random_uuid(),
  climb_id uuid not null references public.climbs(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists climb_beta_notes_climb_created_idx
  on public.climb_beta_notes (climb_id, created_at desc)
  where deleted_at is null;

comment on table public.climb_beta_notes is
  'Dated beta notes for a climb. Visibility inherited from parent climbs row.';
comment on column public.climb_beta_notes.deleted_at is
  'Soft-delete timestamp. App filters deleted_at=is.null.';
comment on column public.climb_beta_notes.edited_at is
  'Set on in-place edit. Null means never edited.';

alter table public.climb_beta_notes enable row level security;

grant select, insert, update on public.climb_beta_notes to anon, authenticated;
grant all on public.climb_beta_notes to service_role;

drop policy if exists climb_beta_notes_via_parent_climb on public.climb_beta_notes;
create policy climb_beta_notes_via_parent_climb on public.climb_beta_notes
  for all
  to anon, authenticated
  using (
    exists (
      select 1
      from public.climbs c
      where c.id = climb_beta_notes.climb_id
        and c.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.climbs c
      where c.id = climb_beta_notes.climb_id
        and c.deleted_at is null
    )
  );
