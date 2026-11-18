// 날씨 답(v0.7.70): 서버(ask-gemini/weather.ts)가 Open-Meteo 숫자로 답하고 표 숫자도 보낸다. 앱은 표로 그리고, 기준 곳을 보낸다.
// 기준 곳: 질문에 적힌 곳 > 설정의 '날씨 지역'(지역 이름 또는 현재 위치) > 서울.

/** 날씨를 묻는 말인지(서버 WEATHER와 같아야 한다, 동기화 시험 ask-gemini/weather.test.ts) */
export const WEATHER_RE = /날씨|기온|몇\s?도|우산|(비|눈)\s?(와|오|올|내리)|일기\s?예보/;

export interface WeatherDay {
  date: string;
  wd: string;
  sky: string;
  lo: number;
  hi: number;
  rain: number | null;
}
export interface WeatherData {
  place: string;
  now: { temp: number; sky: string } | null;
  days: WeatherDay[];
}

/** 서버가 보낸 표 숫자를 확인한다(모양이 다르면 null → 글 답만) */
export function cleanWeather(raw: unknown): WeatherData | null {
  const w = raw as Partial<WeatherData> | null;
  if (!w || typeof w.place !== 'string' || !Array.isArray(w.days)) return null;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const days = w.days
    .filter((d) => d && typeof d.date === 'string' && typeof d.wd === 'string' && typeof d.sky === 'string' && num(d.lo) && num(d.hi))
    .slice(0, 7)
    .map((d) => ({ date: d.date, wd: d.wd, sky: d.sky, lo: d.lo, hi: d.hi, rain: num(d.rain) ? d.rain : null }));
  if (!days.length) return null;
  const now = w.now && num(w.now.temp) ? { temp: w.now.temp, sky: typeof w.now.sky === 'string' ? w.now.sky : '' } : null;
  return { place: w.place.slice(0, 40), now, days };
}

/** 설정 '날씨 지역': 현재 위치(here) 또는 지역 이름(place). 이 기기에만 저장 */
export type WeatherWhere = { mode: 'here' } | { mode: 'place'; place: string };
const KEY = 'minoffia.weatherWhere';

export function readWeatherWhere(): WeatherWhere {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as WeatherWhere | null;
    if (v?.mode === 'place' && typeof v.place === 'string' && v.place.trim()) return { mode: 'place', place: v.place.trim() };
  } catch {
    /* 저장소를 못 읽으면 기본값 */
  }
  return { mode: 'here' };
}

export function saveWeatherWhere(w: WeatherWhere) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* 못 저장해도 이번 화면에서는 쓴다 */
  }
}

/** 지역 이름 칸 확인(서버 cleanWhere와 같은 범위) */
export const validPlace = (s: string) => /^[가-힣A-Za-z0-9 ]{2,20}$/.test(s.trim());

/** 현재 위치(약 1km로 줄여 보냄). 거절·시간 초과·지원 안 함이면 null → 서버가 서울로 */
export function currentSpot(timeout = 8000): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout },
    );
  });
}

/** 서버로 보낼 기준 곳 */
export async function weatherWhereBody(w: WeatherWhere = readWeatherWhere()): Promise<{ place: string } | { lat: number; lon: number } | undefined> {
  if (w.mode === 'place') return { place: w.place };
  return (await currentSpot()) ?? undefined;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
/** 로컬 데모용 예시 날씨(실제 날씨 아님) */
export function demoWeather(now: Date): WeatherData {
  const sample: [string, number, number, number][] = [['구름 조금', 2, 11, 10], ['비', 3, 9, 70], ['흐림', 0, 8, 20], ['맑음', -1, 7, 0], ['맑음', 0, 9, 5], ['눈', -4, 3, 60], ['구름 조금', -2, 6, 10]];
  const days = sample.map(([sky, lo, hi, rain], i) => {
    const d = new Date(now.getTime() + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), wd: WD[d.getDay()], sky, lo, hi, rain };
  });
  return { place: '체험 · 서울', now: { temp: 5, sky: '맑음' }, days };
}
