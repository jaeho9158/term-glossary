# Supabase migrations

이 폴더의 SQL 파일은 Supabase 대시보드 > SQL Editor에서 순서대로 실행한다.
파일명의 번호 순서를 지킬 것. 001은 기존 `tg_bookmarks`/`tg_reading_history`
(대시보드에서 이미 생성됨, 파일 없음). 002부터 이 리포로 관리한다.

- `002_bookmark_tags.sql` — 북마크 태그 (`tg_bookmark_tags`)
- `003_roadmap_progress.sql` — 로드맵 학습 진도 (`tg_roadmap_progress`)
- `004_flashcard_progress.sql` — 플래시카드 안다/모른다 기록 (`tg_flashcard_progress`)
