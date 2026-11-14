-- Claude 웹 조사(v0.7.11, 소유자 2026-11-14 "Exa 검색이 안 되면 클로드로"): 대화에서 Exa 웹 검색이 안 됐을 때
-- 소유자가 'Claude에게 찾아보기'를 누르면 서버(ask-claude-research)가 Claude 루틴에 질문을 맡기고, Claude가 웹 검색 뒤
-- 1회용 제출표로 submit-research에 답을 보낸다. 표의 해시만 저장한다. 앱은 읽기만(쓰기는 서버 service role만).
create table if not exists public.claude_research (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  answer text not null default '' check (char_length(answer) <= 8000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  session_url text,
  token_hash text not null unique,
  uses integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists claude_research_owner_idx on public.claude_research (owner_id, created_at desc);
alter table public.claude_research enable row level security;
create policy claude_research_select on public.claude_research for select to authenticated using (owner_id = (select auth.uid()));
-- 넣기·고치기·지우기 정책은 두지 않는다(로그인 사용자는 바꿀 수 없음). 표 해시도 RLS 뒤라 본인만 읽는다.
revoke insert, update, delete on public.claude_research from anon, authenticated;
-- 새 표라 지우기(drop) 문은 넣지 않는다.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'claude_research') then
    alter publication supabase_realtime add table public.claude_research;
  end if;
end $$;
