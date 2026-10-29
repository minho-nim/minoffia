-- Supabase는 public 테이블에 기본 권한을 준다. 접근 제어는 RLS가 맡는다.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
