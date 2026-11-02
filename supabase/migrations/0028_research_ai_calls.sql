-- MinLab AI Office v0.4.61: 조사(Gemini Google 검색 연결) 횟수를 따로 센다(무료 검색 한도가 질문과 다름).
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check check (purpose in ('question', 'image', 'plan', 'prototype', 'research'));
