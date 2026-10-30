-- v0.4.0 Gemini 기획서 초안(소유자 결정 2026-10-30: 기본은 Gemini 무료 초안, 어려운 업무만 ChatGPT 수동).
-- 기획서 작성자에 gemini_draft를 더하고, Gemini 호출 기록 용도에 plan(기획서 초안)을 더한다.
alter table public.task_specs drop constraint if exists task_specs_planner_check;
alter table public.task_specs add constraint task_specs_planner_check check (planner in ('chatgpt_manual', 'gemini_draft'));

alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check check (purpose in ('question', 'image', 'plan'));
