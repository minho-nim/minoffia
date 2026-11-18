-- 계정 설정(v0.7.71, 소유자 "날씨 지역 계정 설정 ㅇㅇ"): 기기마다 따로이던 '날씨 지역'을 계정에 둬서 아이폰·PC가 같이 쓴다.
-- weather_place가 비어 있으면 현재 위치, 있으면 그 지역 이름. 소유자만 자기 행을 보고 쓴다.
create table if not exists public.owner_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weather_place text check (weather_place is null or (char_length(btrim(weather_place)) between 2 and 20 and weather_place ~ '^[가-힣A-Za-z0-9 ]+$')),
  updated_at timestamptz not null default now()
);
alter table public.owner_settings enable row level security;
create policy owner_settings_select on public.owner_settings for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_settings_insert on public.owner_settings for insert to authenticated with check (owner_id = (select auth.uid()));
create policy owner_settings_update on public.owner_settings for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update on public.owner_settings to authenticated;
