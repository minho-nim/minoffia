-- 업무별 개발 스킬(v0.7.0, 소유자 "개발할 때 스킬을 쓸까요? 대화에서 고르면 그걸 참고해서 시작"):
-- 소유자가 대화에서 고른 스킬 이름 목록. 지시서에 "소유자가 고른 스킬" 한 줄로 들어간다. 권한은 tasks의 기존 소유자 규칙 그대로.
alter table public.tasks add column if not exists skills text[] not null default '{}';
alter table public.tasks drop constraint if exists tasks_skills_check;
alter table public.tasks add constraint tasks_skills_check check (cardinality(skills) <= 12);
