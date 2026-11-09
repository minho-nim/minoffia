-- v0.5.92 프로젝트 데모 주소(소유자 "운영은 Cloudflare, 데모는 github.io, 두 칸 모두"): https 주소만, 200자까지.
alter table public.projects
  add column if not exists demo_url text
  check (demo_url is null or (char_length(demo_url) <= 200 and demo_url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(/[A-Za-z0-9._~/-]*)?$'));
