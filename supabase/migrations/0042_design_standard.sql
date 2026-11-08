-- 프로젝트 디자인 기준 문서(v0.5.56, 소유자 목록 30번): Gemini(무료)가 저장소의 스타일 파일을 보고 초안(design_draft)을 쓰고,
-- 소유자가 승인하면 design_md로 확정한다. 확정된 기준은 디자인 자동 검사(26번)·디자인 채점(29번)이 쓴다.
alter table public.projects
  add column if not exists design_md text not null default '' check (char_length(design_md) <= 8000),
  add column if not exists design_draft text not null default '' check (char_length(design_draft) <= 8000);

-- 초안 쓰기 호출도 Gemini 사용 기록에 남긴다
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review', 'pm', 'design'));
