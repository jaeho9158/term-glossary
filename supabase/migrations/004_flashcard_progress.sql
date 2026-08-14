-- supabase/migrations/004_flashcard_progress.sql
create table if not exists tg_flashcard_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term_slug text not null,
  status text not null check (status in ('known', 'unknown')),
  updated_at timestamptz not null default now(),
  unique (user_id, term_slug)
);

create index if not exists tg_flashcard_progress_user_id_idx on tg_flashcard_progress(user_id);

alter table tg_flashcard_progress enable row level security;

create policy "select own flashcard progress" on tg_flashcard_progress
  for select using (auth.uid() = user_id);

create policy "insert own flashcard progress" on tg_flashcard_progress
  for insert with check (auth.uid() = user_id);

create policy "update own flashcard progress" on tg_flashcard_progress
  for update using (auth.uid() = user_id);

create policy "delete own flashcard progress" on tg_flashcard_progress
  for delete using (auth.uid() = user_id);
