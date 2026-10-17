-- Already applied live by John. Idempotent. Do not assume a later agent must run it.
alter table public.custom_workouts enable row level security;
alter table public.custom_workouts add column if not exists created_by_role text;
alter table public.custom_workouts drop constraint if exists custom_workouts_created_by_role_check;
alter table public.custom_workouts add constraint custom_workouts_created_by_role_check check (created_by_role is null or created_by_role in ('coach','athlete'));
alter table public.custom_workouts add column if not exists source_template_id uuid references public.custom_workouts(id);
alter table public.custom_workouts add column if not exists assigned_by uuid references auth.users(id);
alter table public.custom_workouts add column if not exists deleted_at timestamptz;
alter table public.custom_workouts add column if not exists updated_at timestamptz not null default now();
create index if not exists custom_workouts_owner_live_idx on public.custom_workouts (created_by, created_at desc) where deleted_at is null;
create index if not exists custom_workouts_source_idx on public.custom_workouts (created_by, source_template_id) where source_template_id is not null and deleted_at is null;
-- SELECT policy: deleted_at is null AND (visibility='shared' OR created_by=auth.uid() OR row is linked to one of the athlete's own non-deleted assignments via custom_workout_item_id or warmup_custom_workout_item_id)
drop policy if exists custom_workouts_select on public.custom_workouts;
create policy custom_workouts_select on public.custom_workouts
  for select to authenticated
  using (
    deleted_at is null
    and (
      visibility = 'shared'
      or created_by = auth.uid()
      or exists (
        select 1 from public.assignments a
        where a.athlete_id = auth.uid()
          and a.deleted_at is null
          and (
            a.custom_workout_item_id = custom_workouts.id
            or a.warmup_custom_workout_item_id = custom_workouts.id
          )
      )
    )
  );
-- UPDATE policy: created_by = auth.uid(). DELETE policy: created_by = auth.uid(). INSERT unchanged.
drop policy if exists custom_workouts_update on public.custom_workouts;
create policy custom_workouts_update on public.custom_workouts
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
drop policy if exists custom_workouts_delete on public.custom_workouts;
create policy custom_workouts_delete on public.custom_workouts
  for delete to authenticated
  using (created_by = auth.uid());
alter table public.training_sessions add column if not exists template_id uuid references public.custom_workouts(id);
create index if not exists training_sessions_template_started_idx on public.training_sessions (user_id, template_id, started_at desc) where deleted_at is null and template_id is not null;
