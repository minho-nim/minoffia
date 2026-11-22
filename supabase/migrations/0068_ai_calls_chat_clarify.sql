-- v0.7.99 사용량 기록 빠짐 고침: 되묻기(clarify, v0.7.98)·챗봇(chat, v0.7.99) 기록이 purpose 검사에 막혀
-- ai_calls에 안 들어갔다(함수는 기록 오류를 넘기고 답만 보냄 → 사용량·통계에서 빠짐). 두 값을 허용한다.
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review', 'pm', 'design', 'drawing', 'wiki', 'clarify', 'chat'));
