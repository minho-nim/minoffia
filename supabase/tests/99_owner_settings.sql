-- 계정 설정(0065): 소유자만 자기 날씨 지역을 보고 바꾼다. 이상한 지역 이름은 막는다.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
insert into owner_settings (weather_place) values ('분당');
update owner_settings set weather_place = '부산', updated_at = now();
do $$ begin
  if (select weather_place from owner_settings) <> '부산' then raise exception '지역이 부산이어야 함'; end if;
end $$;
update owner_settings set weather_place = null;
do $$ begin
  begin
    update owner_settings set weather_place = '<script>';
    raise exception '이상한 지역 이름이 막혀야 함';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from owner_settings) <> 0 then raise exception '다른 사람 설정이 보이면 안 됨'; end if;
end $$;
do $$ begin
  begin
    insert into owner_settings (owner_id, weather_place) values ('11111111-1111-4111-8111-111111111111', '서울');
    raise exception '남의 행을 만들 수 없어야 함';
  exception when unique_violation or insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
