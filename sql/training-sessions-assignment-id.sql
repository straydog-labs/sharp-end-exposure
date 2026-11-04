alter table public.training_sessions add column if not exists assignment_id uuid null references public.assignments(id) on delete set null;
create index if not exists training_sessions_assignment_id_idx on public.training_sessions (assignment_id) where assignment_id is not null;
