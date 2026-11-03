-- MinLab AI Office v0.5.20 Claude 한도가 차도 업무가 안 멈추게(소유자 2026-11-03, pixel-office "교체하고 계속" 아이디어).
-- 1) 작은 일은 PM 없이 규칙이 바로 배정: Gemini 기획서 초안이 같은 호출로 크기 힌트(난이도·작업 하나·새 디자인)를 준다.
-- 2) Claude PM이 한도·휴가·실패·무응답이면 Gemini 무료가 같은 형식으로 분배 계획을 쓴다(draft-plan, ai_calls purpose 'pm').
-- 계획은 앱이 parsePmPlan으로 검증해 저장하고, 실행 승인(E)은 그대로 소유자가 한다.

-- 기획서 크기 힌트: {"difficulty":1~10,"single_task":bool,"needs_design":bool}. 기획서는 추가만 하는 기록이라 새 버전에만 들어간다.
alter table public.task_specs add column if not exists size_hint jsonb;

alter table public.pm_plans drop constraint if exists pm_plans_source_check;
alter table public.pm_plans add constraint pm_plans_source_check
  check (source in ('routine_session_manual_import', 'routine_session_auto', 'manual', 'rule_small', 'gemini_fallback'));

alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review', 'pm'));
