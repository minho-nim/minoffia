// 설정 '날씨 지역'(v0.7.70, 소유자 "현재 내 위치 기준 + 지역 설정을 따로"): 현재 위치(기본) 또는 지역 이름.
// v0.7.71: 계정에 저장(onSave, 아이폰·PC 같이). 로컬 데모는 이 기기에만.
// 질문에 곳을 적으면("부산 날씨") 그 곳이 먼저다. 현재 위치를 못 받으면(거절 등) 서울.
// v0.7.73 소유자 "위치 새로고침 아이콘": '현재 위치' 옆에 지금 기준 동네와 확인 시각, ↻(위치를 새로 받고 동네 이름 다시 찾기).
import { useEffect, useState } from 'react';
import { agoText, currentSpot, readHereSeen, readWeatherWhere, saveHereSeen, saveWeatherWhere, validPlace, type WeatherWhere } from '../domain/weather';

export function WeatherWhereSetting({ onSave, areaName }: { onSave?: (place: string | null) => Promise<void>; areaName?: (spot: { lat: number; lon: number }) => Promise<string> }) {
  const [where, setWhere] = useState<WeatherWhere>(readWeatherWhere);
  const [place, setPlace] = useState(where.mode === 'place' ? where.place : '');
  const [note, setNote] = useState('');
  const [seen, setSeen] = useState(readHereSeen);
  const [busy, setBusy] = useState(false);
  /** 위치를 새로 받고(휴대폰이 기억한 위치 말고) 동네 이름을 다시 찾는다 */
  const refreshHere = async () => {
    if (busy) return;
    setBusy(true);
    setNote('위치를 확인하는 중…');
    const spot = await currentSpot(8000, true);
    if (!spot) {
      setBusy(false);
      return setNote('위치를 받지 못했어요. 휴대폰 설정에서 이 앱(브라우저)의 위치 허용을 켜 주세요. 그전까지는 서울로 답해요.');
    }
    // 이름을 못 찾으면 '이름 못 찾음'(위치는 받았으니 날씨는 이 근처로 답한다)
    const name = (areaName ? await areaName(spot).catch(() => '') : '체험 위치') || '이름 못 찾음';
    saveHereSeen(name);
    setSeen(readHereSeen());
    setBusy(false);
    setNote(name === '이름 못 찾음' ? '위치는 받았어요. 동네 이름은 찾지 못했지만 날씨는 이 근처로 답해요.' : `날씨를 물으면 '${name}' 근처로 답해요.`);
  };
  const choose = (w: WeatherWhere, done?: string) => {
    setWhere(w);
    saveWeatherWhere(w);
    if (!onSave) return done && setNote(done);
    onSave(w.mode === 'place' ? w.place : null)
      .then(() => done && setNote(`${done} 계정에 저장했어요(다른 기기도 같이).`))
      .catch((e) => setNote(`계정에 저장하지 못했어요: ${(e as Error).message}. 이 기기에는 적용됐어요.`));
  };
  // 위치 허용이 이미 돼 있으면 설정을 열 때 이름을 바로 맞춘다(30분 넘었거나 처음일 때만, 허용 창은 띄우지 않음)
  useEffect(() => {
    if (where.mode !== 'here' || (seen && Date.now() - new Date(seen.at).getTime() < 30 * 60_000)) return;
    let alive = true;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((st) => alive && st.state === 'granted' && void refreshHere())
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // 처음 열 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tryHere = () => {
    choose({ mode: 'here' });
    void refreshHere();
  };
  const savePlace = () => {
    const p = place.trim();
    if (!validPlace(p)) return setNote('지역 이름은 2~20자 한글·영문으로 적어 주세요(예: 부산, 분당).');
    choose({ mode: 'place', place: p }, `날씨를 물으면 '${p}' 기준으로 답해요.`);
  };
  return (
    <div className="weather-where">
      {/* v0.7.74 소유자 "현재 위치 옆에 어딘지도 딱": 같은 줄에 동네 이름 · 확인 시각 · ↻ */}
      <div className="weather-where-row">
        <label>
          <input type="radio" name="weather-where" id="weather-where-here" checked={where.mode === 'here'} onChange={tryHere} />
          현재 위치
        </label>
        {where.mode === 'here' && (
          <>
            <b className="weather-where-name">{busy ? '확인 중…' : seen ? seen.name : '확인 전'}</b>
            {seen && !busy && <span className="weather-where-ago">{agoText(seen.at)}</span>}
            <button type="button" className="weather-where-sync" onClick={() => void refreshHere()} disabled={busy} aria-label="현재 위치 다시 확인" title="현재 위치 다시 확인">
              <span aria-hidden="true" className={busy ? 'is-spinning' : undefined}>
                ↻
              </span>
            </button>
          </>
        )}
      </div>
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
