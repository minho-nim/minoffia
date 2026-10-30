-- MinLab AI Office v0.3.2: 요청 자료에 문서 첨부(새 플로우 01단계 "파일 첨부", 07단계 시안 ZIP 인계).
-- 이미지(5MB) 외에 PDF·TXT·MD·CSV·JSON·DOCX·XLSX·PPTX·ZIP(20MB)을 요청 자료로 올린다. 결과 스크린샷은 그대로 이미지만.
-- 규칙은 src/domain/attachments.ts 와 같아야 한다.

alter table public.attachments drop constraint attachments_mime_check;
alter table public.attachments drop constraint attachments_size_bytes_check;
alter table public.attachments drop constraint attachments_role_check;
alter table public.attachments drop constraint attachments_check1;

alter table public.attachments add constraint attachments_mime_check check (mime in (
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip'
));

-- 이미지는 5MB, 문서는 20MB
alter table public.attachments add constraint attachments_size_bytes_check check (
  size_bytes >= 1 and size_bytes <= (case when mime like 'image/%' then 5242880 else 20971520 end)
);

alter table public.attachments add constraint attachments_role_check
  check (role in ('current', 'target', 'error', 'reference', 'document', 'before', 'after'));

-- 요청 자료: 이미지는 화면 역할, 문서는 'document'. 결과 스크린샷: 이미지만, 변경 전·후.
alter table public.attachments add constraint attachments_check1 check (
  (kind = 'request' and mime like 'image/%' and role in ('current', 'target', 'error', 'reference'))
  or (kind = 'request' and mime not like 'image/%' and role = 'document')
  or (kind = 'result' and mime like 'image/%' and role in ('before', 'after'))
);

-- 비공개 버킷: 파일 하나 20MB, 받을 형식 추가(이미지 5MB는 위 표 규칙이 막는다)
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip'
    ]
where id = 'attachments';
