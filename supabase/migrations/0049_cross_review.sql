-- MinLab AI Office v0.6.26(소유자 2026-11-10 "채점은 제미니가 기본, 필요할 때 교차 채점 추가해서 평균"):
-- 기본 채점은 Gemini(무료). 소유자가 '교차 채점 추가'를 누르면 다른 AI(Codex 결과 → Claude)가 한 번 더 채점해 여기에 붙인다.
-- 서버(service role)만 채운다. 판정(verdict)은 기본 채점 그대로 두고, 화면에 두 점수와 평균을 보여 준다.
alter table public.result_reviews add column if not exists cross_total integer check (cross_total between 0 and 100);
alter table public.result_reviews add column if not exists cross_judge text;
alter table public.result_reviews add column if not exists cross_reasons jsonb;
