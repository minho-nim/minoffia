-- 트리거 전용 함수. API(/rest/v1/rpc)로 직접 부르지 못하게 한다(Supabase 보안 점검 0028/0029).
revoke all on function public.tasks_guard() from public, anon, authenticated;
