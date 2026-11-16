-- v0.7.40 화면 평가(소유자 "루프: 결과 사진을 평가에 넣기"): 미노가 찍은 결과 화면을 Gemini가 기획서와 견줘 본 결과.
-- {score, problems[], kind, errors, overflow, judge, checkedAt}. review-screen(서버)만 쓰고, 앱은 기존 select 정책으로 읽는다.
alter table public.result_reviews add column if not exists screen jsonb check (screen is null or jsonb_typeof(screen) = 'object');
