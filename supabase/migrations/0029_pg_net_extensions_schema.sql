-- MinLab AI Office (2026-11-02, 소유자 승인): 보안 경고 정리. pg_net을 public에서 extensions 스키마로 옮긴다.
-- pg_net은 옮길 수 없는 확장이라 지웠다가 다시 만든다. 함수는 늘 net 스키마(net.http_post)라 push_enqueue는 그대로 동작한다.
-- 로컬 시험 DB처럼 pg_net이 없거나 이미 extensions에 있으면 아무것도 하지 않는다.
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create schema if not exists extensions;
    create extension pg_net schema extensions;
  end if;
end $$;
