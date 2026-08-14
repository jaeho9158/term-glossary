-- supabase/migrations/002_bookmark_tags.sql
create table if not exists tg_bookmark_tags (
  id uuid primary key default gen_random_uuid(),
  bookmark_id uuid not null references tg_bookmarks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null check (char_length(trim(tag)) > 0 and char_length(tag) <= 30),
  created_at timestamptz not null default now()
);

create index if not exists tg_bookmark_tags_bookmark_id_idx on tg_bookmark_tags(bookmark_id);
create index if not exists tg_bookmark_tags_user_id_idx on tg_bookmark_tags(user_id);

alter table tg_bookmark_tags enable row level security;

create policy "select own bookmark tags" on tg_bookmark_tags
  for select using (auth.uid() = user_id);

create policy "insert own bookmark tags" on tg_bookmark_tags
  for insert with check (auth.uid() = user_id);

create policy "delete own bookmark tags" on tg_bookmark_tags
  for delete using (auth.uid() = user_id);
