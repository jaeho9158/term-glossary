-- supabase/migrations/003_roadmap_progress.sql
create table if not exists tg_roadmap_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term_slug text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, term_slug)
);

create index if not exists tg_roadmap_progress_user_id_idx on tg_roadmap_progress(user_id);

alter table tg_roadmap_progress enable row level security;

create policy "select own roadmap progress" on tg_roadmap_progress
  for select using (auth.uid() = user_id);

create policy "insert own roadmap progress" on tg_roadmap_progress
  for insert with check (auth.uid() = user_id);

create policy "delete own roadmap progress" on tg_roadmap_progress
  for delete using (auth.uid() = user_id);
