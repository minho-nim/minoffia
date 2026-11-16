-- v0.7.41 LLM 위키(소유자 "컨텍스트 엔지니어링: 2 ㄱㄱ"): 프로젝트마다 AI가 쓰고 고치는 한 장짜리 위키.
-- 업무가 배포까지 끝나면 서버(wiki-update)가 그 업무의 기획서·결과 요약·바뀐 파일·수정 요청을 읽고 고쳐 쓴다(Gemini 무료).
-- 대화 질문·개발 지시서에 참고 자료로 붙는다. 사람은 읽기만(쓰기는 서버 service role만). 원본(기획서·결과)은 그대로 둔다.
create table if not exists public.project_wiki (
  project_id uuid primary key references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 12000),
  -- 위키에 넣은 업무(같은 업무를 두 번 넣지 않게)
  task_ids uuid[] not null default '{}',
  judge text not null default '' check (char_length(judge) <= 80),
  updated_at timestamptz not null default now()
);
create index if not exists project_wiki_owner_idx on public.project_wiki (owner_id);
alter table public.project_wiki enable row level security;
create policy project_wiki_select on public.project_wiki for select to authenticated using (owner_id = (select auth.uid()));
-- 쓰기 정책 없음: 서버(service role)만 쓴다.

-- 위키 정리 호출을 따로 센다(Gemini 무료 키, 하루 상한은 함수에서)
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review', 'pm', 'design', 'drawing', 'wiki'));
