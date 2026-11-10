-- MinLab AI Office v0.6.42(소유자 2026-11-10 "설정으로 순서 바꿀 수 있게, 프로젝트 탭 순서와 연동"): 프로젝트 순서 칸.
alter table public.projects add column if not exists position integer not null default 0;
