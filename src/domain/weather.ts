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

/** 설정 '날씨 지역': 현재 위치(here) 또는 지역 이름(place).
 * v0.7.71: 계정에 저장(owner_settings, 아이폰·PC 같이). 이 기기에도 사본을 두어 앱을 열자마자 쓴다(로컬 데모는 사본만). */
export type WeatherWhere = { mode: 'here' } | { mode: 'place'; place: string };
const KEY = 'minoffia.weatherWhere';
let cached: WeatherWhere | null = null;

/** 계정 값(서버의 weather_place, 비면 현재 위치)을 받아 이 기기 사본을 맞춘다 */
export function applyAccountWeatherPlace(place: string | null) {
  saveWeatherWhere(place ? { mode: 'place', place } : { mode: 'here' });
}

export function readWeatherWhere(): WeatherWhere {
  if (cached) return cached;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as WeatherWhere | null;
    if (v?.mode === 'place' && typeof v.place === 'string' && v.place.trim()) return { mode: 'place', place: v.place.trim() };
  } catch {
    /* 저장소를 못 읽으면 기본값 */
  }
  return { mode: 'here' };
}

export function saveWeatherWhere(w: WeatherWhere) {
  cached = w;
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* 못 저장해도 이번 화면에서는 쓴다 */
  }
}

/** 지역 이름 칸 확인(서버 cleanWhere와 같은 범위) */
export const validPlace = (s: string) => /^[가-힣A-Za-z0-9 ]{2,20}$/.test(s.trim());

/** 현재 위치(약 1km로 줄여 보냄). 거절·시간 초과·지원 안 함이면 null → 서버가 서울로 */
export function currentSpot(timeout = 5000, fresh = false): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: fresh ? 0 : 30 * 60_000, timeout },
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

/** 마지막으로 확인한 현재 위치 이름과 시각(설정 ↻, 이 기기에만) */
const SEEN = 'minoffia.weatherHereSeen';
export function readHereSeen(): { name: string; at: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN) ?? 'null') as { name?: unknown; at?: unknown } | null;
    return v && typeof v.name === 'string' && typeof v.at === 'string' ? { name: v.name, at: v.at } : null;
  } catch {
    return null;
  }
}
export function saveHereSeen(name: string, at = new Date().toISOString()) {
  try {
    localStorage.setItem(SEEN, JSON.stringify({ name, at }));
  } catch {
    /* 못 저장해도 화면에는 보인다 */
  }
}
/** '방금'·'5분 전'·'3시간 전'·'2일 전' */
export function agoText(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
