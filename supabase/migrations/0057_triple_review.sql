-- MinLab AI Office v0.7.8(소유자 2026-11-12 "관점은 다르게, 항목은 동일. 각각 점수 보여주고 평균, 평균이나 과반이 기준점 미만이면 자동 다시 개발"):
-- 결과 하나를 Gemini A(요청·사용자)·Gemini B(코드 품질·안전)·동료 개발 AI가 같은 항목으로 채점한다.
-- 채점자별 점수·관점·지적을 panel에 담는다. 서버(service role)만 채운다(소유자는 읽기만, 기존 select 정책 그대로).
-- 동료 점수가 오면 submit-review가 같은 줄의 panel·평균·판정을 한 번 고친다(기다리는 중 → 판정). cross_* 열은 옛 기록용으로 남긴다.
alter table public.result_reviews add column if not exists panel jsonb not null default '[]'::jsonb;
alter table public.result_reviews drop constraint if exists result_reviews_panel_array;
alter table public.result_reviews add constraint result_reviews_panel_array check (jsonb_typeof(panel) = 'array');
