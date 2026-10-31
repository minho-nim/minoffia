-- v0.4.7 Gemini 견본(HTML 한 장, 무료): Gemini 호출 기록 용도에 prototype을 더한다(하루 상한 계산용).
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check check (purpose in ('question', 'image', 'plan', 'prototype'));
