-- MinLab AI Office v0.2.5: 입력창의 일반 질문을 Gemini(무료)에 보낸 기록
-- 질문·답변 글은 저장하지 않는다(개인정보). 하루 사용 횟수·성공 여부·길이만 남긴다.
-- 기록은 서버(Edge Function ask-gemini)만 한다.

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gemini')),
  -- 1 = GEMINI_API_KEY(A), 2 = GEMINI_API_KEY2(B 예비). 둘 다 실패하면 null
  key_slot smallint check (key_slot in (1, 2)),
  ok boolean not null,
  http_status integer,
  model text not null default '' check (char_length(model) <= 100),
  prompt_chars integer not null default 0 check (prompt_chars >= 0),
  answer_chars integer not null default 0 check (answer_chars >= 0),
  error text not null default '' check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);

create index ai_calls_owner_day_idx on public.ai_calls (owner_id, created_at);

alter table public.ai_calls enable row level security;

-- 읽기만. 고치거나 지울 수 없다(사용량 기록).
create policy ai_calls_select on public.ai_calls for select to authenticated using (owner_id = (select auth.uid()));
