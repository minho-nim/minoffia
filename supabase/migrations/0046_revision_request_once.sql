-- v0.6.16 같은 일 두 번 막기(소유자 "21534" 4번): 한 결과 버전에는 수정 요청이 하나만 있다.
-- 서버(채점 직후)와 앱(2분 뒤 대신)이 동시에 보내거나 단추를 두 번 눌러도 PM 재계획이 두 번 가지 않게 DB가 막는다.
-- 운영에 같은 결과의 수정 요청이 둘 이상인 줄은 없다(2026-11-10 확인). 지우기 문 없음.
create unique index if not exists revision_requests_once on public.revision_requests (task_id, result_revision);
