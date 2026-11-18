// 설정 '날씨 지역'(v0.7.70, 소유자 "현재 내 위치 기준 + 지역 설정을 따로"): 현재 위치(기본) 또는 지역 이름. 이 기기에만 저장.
// 질문에 곳을 적으면("부산 날씨") 그 곳이 먼저다. 현재 위치를 못 받으면(거절 등) 서울.
import { useState } from 'react';
import { currentSpot, readWeatherWhere, saveWeatherWhere, validPlace, type WeatherWhere } from '../domain/weather';

export function WeatherWhereSetting() {
  const [where, setWhere] = useState<WeatherWhere>(readWeatherWhere);
  const [place, setPlace] = useState(where.mode === 'place' ? where.place : '');
  const [note, setNote] = useState('');
  const choose = (w: WeatherWhere) => {
    setWhere(w);
    saveWeatherWhere(w);
  };
  const tryHere = () => {
    choose({ mode: 'here' });
    setNote('위치를 확인하는 중…');
    void currentSpot().then((s) => setNote(s ? '현재 위치를 받았어요. 날씨를 물으면 이 근처로 답해요.' : '위치를 받지 못했어요. 휴대폰 설정에서 이 앱(브라우저)의 위치 허용을 켜 주세요. 그전까지는 서울로 답해요.'));
  };
  const savePlace = () => {
    const p = place.trim();
    if (!validPlace(p)) return setNote('지역 이름은 2~20자 한글·영문으로 적어 주세요(예: 부산, 분당).');
    choose({ mode: 'place', place: p });
    setNote(`날씨를 물으면 '${p}' 기준으로 답해요.`);
  };
  return (
    <div className="weather-where">
      <label className="weather-where-row">
        <input type="radio" name="weather-where" id="weather-where-here" checked={where.mode === 'here'} onChange={tryHere} />
        현재 위치
      </label>
      <div className="weather-where-row">
        <label>
          <input type="radio" name="weather-where" id="weather-where-place" checked={where.mode === 'place'} onChange={() => validPlace(place) && choose({ mode: 'place', place: place.trim() })} />
          지역
        </label>
        <input
          id="weather-where-name"
          type="text"
          inputMode="text"
          placeholder="예: 부산"
          value={place}
          maxLength={20}
          aria-label="날씨 지역 이름"
          onChange={(e) => setPlace(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && savePlace()}
        />
        <button type="button" className="btn btn-small" onClick={savePlace}>
          저장
        </button>
      </div>
      <p className="muted small">{note || '질문에 곳을 적으면("부산 날씨") 그 곳이 먼저예요.'}</p>
    </div>
  );
}
