-- supabase/migrations/005_translations.sql
-- PDF 뷰어 번역 기능: 페이지 번역 공유 캐시 + 사용자별 일일 사용량.
-- 캐시 키가 doc_hash(파일 SHA-256)인 이유: 같은 PDF는 누가 올려도 같은 키가
-- 되어 두 번째 사용자부터 모델 호출 없이 즉시 표시된다.

create table if not exists tg_translations (
  doc_hash text not null,
  page int not null check (page >= 1),
  source_lang text not null default 'en',
  translated_text text not null,
  glossary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (doc_hash, page)
);

create table if not exists tg_translation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  pages_used int not null default 0,
  selections_used int not null default 0,
  primary key (user_id, usage_date)
);

alter table tg_translations enable row level security;
alter table tg_translation_usage enable row level security;

-- 캐시는 로그인 사용자 누구나 읽는다. 쓰기는 정책을 만들지 않아 service role만 가능.
create policy "authenticated read translations" on tg_translations
  for select using (auth.role() = 'authenticated');

-- 사용량은 본인 행만 읽는다. 쓰기는 service role만.
create policy "select own translation usage" on tg_translation_usage
  for select using (auth.uid() = user_id);

-- 동시 요청에도 안전한 증가. 함수(service role)가 모델 호출 성공 후에만 부른다.
create or replace function tg_bump_translation_usage(
  p_user uuid,
  p_pages int,
  p_selections int
) returns table (pages_used int, selections_used int)
language sql
security definer
set search_path = public
as $$
  insert into tg_translation_usage (user_id, usage_date, pages_used, selections_used)
  values (p_user, current_date, p_pages, p_selections)
  on conflict (user_id, usage_date) do update
    set pages_used = tg_translation_usage.pages_used + excluded.pages_used,
        selections_used = tg_translation_usage.selections_used + excluded.selections_used
  returning tg_translation_usage.pages_used, tg_translation_usage.selections_used;
$$;

revoke all on function tg_bump_translation_usage(uuid, int, int) from public;
grant execute on function tg_bump_translation_usage(uuid, int, int) to service_role;
