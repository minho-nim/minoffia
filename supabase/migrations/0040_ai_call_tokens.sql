-- Gemini 실제 토큰 수(v0.5.50, 소유자 목록 14번): 응답의 usageMetadata를 그대로 남긴다. 예전 기록·못 받은 경우는 null(글자 수는 그대로).
alter table public.ai_calls
  add column if not exists prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  add column if not exists answer_tokens integer check (answer_tokens is null or answer_tokens >= 0),
  add column if not exists thinking_tokens integer check (thinking_tokens is null or thinking_tokens >= 0);
