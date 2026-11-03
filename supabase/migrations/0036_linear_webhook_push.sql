-- MinLab AI Office v0.5.3 Linear 웹훅(소유자 2026-11-03 "웹훅으로 바꿔줘").
-- Codex가 Linear 이슈에 댓글을 달면 Linear가 서버(linear-webhook)로 바로 알리고, 서버가 업무 카드 소식을 바꾼 뒤 휴대폰 알림을 보낸다.
-- 알림 줄 넣기(push_enqueue)는 서버(service_role)만 부를 수 있게 연다. 사용자·익명은 그대로 막힌다.
grant execute on function public.push_enqueue(uuid, uuid, text, text) to service_role;
