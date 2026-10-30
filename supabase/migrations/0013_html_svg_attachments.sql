-- MinLab AI Office v0.3.3: 요청 자료에 HTML·SVG도 올리고, 앱 안에서 격리된 미리보기로 본다.
-- SVG는 이미지(5MB, 화면 역할), HTML은 문서(20MB, 역할 document). 결과 스크린샷은 PNG·JPG·WEBP·GIF만.
-- 저장소에는 두 형식 모두 text/plain으로 올려(src/domain/attachments.ts storageContentType) 비공개 주소를 직접 열어도 실행되지 않게 한다.
-- 규칙은 src/domain/attachments.ts 와 같아야 한다.

alter table public.attachments drop constraint attachments_mime_check;
alter table public.attachments drop constraint attachments_check1;

alter table public.attachments add constraint attachments_mime_check check (mime in (
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip'
));

alter table public.attachments add constraint attachments_check1 check (
  (kind = 'request' and mime like 'image/%' and role in ('current', 'target', 'error', 'reference'))
  or (kind = 'request' and mime not like 'image/%' and role = 'document')
  or (kind = 'result' and mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') and role in ('before', 'after'))
);
-- 버킷 형식 목록은 그대로(HTML·SVG는 text/plain으로 올라온다). text/html·image/svg+xml은 버킷이 받지 않는다.
