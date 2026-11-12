-- MinLab AI Office v0.6.71(소유자 2026-11-12 관계 지도 "프로젝트–MCP"): 프로젝트마다 저장소 .mcp.json에 적힌 MCP 서버 이름만 저장한다.
-- 값(명령·주소·환경변수)은 읽지도 저장하지도 않는다(비밀값이 들어 있을 수 있음). { 프로젝트 id: [이름, …] }
alter table public.skill_cache add column if not exists mcp jsonb
  check (mcp is null or (jsonb_typeof(mcp) = 'object' and octet_length(mcp::text) <= 50000));
