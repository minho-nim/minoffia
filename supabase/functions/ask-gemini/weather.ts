// 날씨 질문(v0.7.68, 소유자 "오늘날씨 → AI 날씨 기사로 답함"): 웹 검색은 날씨 값을 못 준다.
// 날씨는 Open-Meteo(무료·키 없음)에서 숫자를 받아 규칙으로 답한다(모델 호출 0).
// v0.7.70: 곳을 말하지 않으면 앱 설정(지역 이름 또는 현재 위치) → 그것도 없으면 서울. 답은 표로 그릴 숫자(data)도 함께 보낸다.

/** 날씨를 묻는 말인지(앱 src/domain/weather.ts의 WEATHER_RE와 같아야 한다, 동기화 시험 있음) */
export const WEATHER = /날씨|기온|몇\s?도|우산|(비|눈)\s?(와|오|올|내리)|일기\s?예보/;

/** 자주 묻는 곳은 좌표를 바로 쓴다(위치 찾기 호출 아낌) */
const CITY: Record<string, [number, number]> = {
  서울: [37.5665, 126.978], 부산: [35.1796, 129.0756], 인천: [37.4563, 126.7052], 대구: [35.8714, 128.6014],
  대전: [36.3504, 127.3845], 광주: [35.1595, 126.8526], 울산: [35.5384, 129.3114], 세종: [36.48, 127.289],
  수원: [37.2636, 127.0286], 성남: [37.42, 127.1265], 고양: [37.6584, 126.832], 용인: [37.2411, 127.1776],
  제주: [33.4996, 126.5312], 서귀포: [33.2541, 126.56], 강릉: [37.7519, 128.8761], 춘천: [37.8813, 127.7298],
  원주: [37.3422, 127.9202], 청주: [36.6424, 127.489], 천안: [36.8151, 127.1139], 전주: [35.8242, 127.148],
  포항: [36.019, 129.3435], 창원: [35.2285, 128.6811], 김해: [35.2285, 128.8894], 여수: [34.7604, 127.6622],
  목포: [34.8118, 126.3922], 안동: [36.5684, 128.7294], 경주: [35.8562, 129.2247], 속초: [38.207, 128.5918],
};

const DROP = /@\S+|오늘|내일|모레|지금|현재|이번\s?주|날씨|기온|일기\s?예보|몇\s?도|우산|챙겨야|필요해?|(비|눈)\s?(와|오|올|내리)\S*|어때\S*|어떄\S*|알려\S*|좀|요|\?|!|\./g;

export interface WeatherAsk {
  /** 질문에 적힌 곳(없으면 null → 설정·현재 위치·서울 순) */
  place: string | null;
  /** 0 오늘, 1 내일, 2 모레 */
  day: 0 | 1 | 2;
}

export function weatherAsk(text: string): WeatherAsk | null {
  if (!WEATHER.test(text)) return null;
  const day = /모레/.test(text) ? 2 : /내일/.test(text) ? 1 : 0;
  // 남은 말에서 곳 이름(조사 '의·에·은·는' 떼기). 없으면 서울
  const word = text
    .replace(DROP, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/(특별시|광역시|시|의|에|은|는|쪽|지역)$/, ''))
    .find((w) => /^[가-힣A-Za-z]{2,12}$/.test(w));
  return { place: word ?? null, day };
}

/** WMO 날씨 코드 → 쉬운 말 */
export function skyOf(code: number): string {
  if (code === 0) return '맑음';
  if (code <= 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '비';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '눈';
  if (code >= 95) return '뇌우';
  return '알 수 없음';
}

interface Forecast {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] };
}

const DAY_WORD = ['오늘', '내일', '모레'];
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const round = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);

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

/** 예보 → 표에 그릴 숫자(7일, 빠진 날은 뺀다) */
export function weatherData(place: string, f: Forecast): WeatherData | null {
  const d = f.daily;
  const days: WeatherDay[] = [];
  for (let i = 0; i < (d?.time?.length ?? 0); i++) {
    const hi = round(d?.temperature_2m_max?.[i]);
    const lo = round(d?.temperature_2m_min?.[i]);
    const code = d?.weather_code?.[i];
    const time = d?.time?.[i];
    if (hi === null || lo === null || typeof code !== 'number' || !time) continue;
    const rain = d?.precipitation_probability_max?.[i];
    days.push({ date: time, wd: WEEKDAY[new Date(`${time}T00:00:00Z`).getUTCDay()], sky: skyOf(code), lo, hi, rain: typeof rain === 'number' ? Math.round(rain) : null });
  }
  if (!days.length) return null;
  const t = round(f.current?.temperature_2m);
  const c = f.current?.weather_code;
  return { place, now: t !== null ? { temp: t, sky: typeof c === 'number' ? skyOf(c) : '' } : null, days };
}

/** 하루 한 줄: '11/19 목 · 비 · 3°~9° · 비 70%' (숫자가 빠지면 null) */
function dayLine(f: Forecast, i: number): string | null {
  const d = f.daily;
  const hi = round(d?.temperature_2m_max?.[i]);
  const lo = round(d?.temperature_2m_min?.[i]);
  const code = d?.weather_code?.[i];
  const time = d?.time?.[i];
  if (hi === null || lo === null || typeof code !== 'number' || !time) return null;
  const rain = d?.precipitation_probability_max?.[i];
  const wd = WEEKDAY[new Date(`${time}T00:00:00Z`).getUTCDay()];
  return `${time.slice(5).replace('-', '/')} ${wd} · ${skyOf(code)} · ${lo}°~${hi}°${typeof rain === 'number' ? ` · 비·눈 ${Math.round(rain)}%` : ''}${typeof rain === 'number' && rain >= 50 ? ' ☂' : ''}`;
}

/** 받은 숫자로 답 글을 만든다(규칙). v0.7.69 소유자 "오늘 내일 모레 알려주고 1주일": 늘 오늘·내일·모레 + 그 뒤 4일 */
export function weatherText(place: string, _day: 0 | 1 | 2, f: Forecast): string | null {
  const data = weatherData(place, f);
  return data ? textOf(data) : null;
}

/** 표 숫자 → 글 답(복사·문맥용. 화면은 표로 그린다) */
export function textOf(data: WeatherData): string {
  const line = (d: WeatherDay) =>
    `${d.date.slice(5).replace('-', '/')} ${d.wd} · ${d.sky} · ${d.lo}°~${d.hi}°${d.rain !== null ? ` · 비·눈 ${d.rain}%` : ''}${(d.rain ?? 0) >= 50 ? ' ☂' : ''}`;
  const [today, ...more] = data.days;
  const lines = [`${data.place} 날씨`, `오늘 ${line(today)}${data.now ? ` (지금 ${data.now.temp}°${data.now.sky ? ` ${data.now.sky}` : ''})` : ''}`];
  more.slice(0, 2).forEach((d, i) => lines.push(`${DAY_WORD[i + 1]} ${line(d)}`));
  const rest = more.slice(2, 6).map(line);
  if (rest.length) lines.push('', '이번 주 남은 날', ...rest);
  if (data.days.slice(0, 3).some((d) => (d.rain ?? 0) >= 50)) lines.push('', '☂ 표시 날은 우산을 챙기세요.');
  return lines.join('\n');
}

// ── 예비 날씨: 노르웨이 기상청 MET Norway(무료·키 없음, v0.7.72). Open-Meteo가 막히면 쓴다 ──
interface MetSeries {
  time: string;
  data?: {
    instant?: { details?: { air_temperature?: number } };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { probability_of_precipitation?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { air_temperature_max?: number; air_temperature_min?: number; probability_of_precipitation?: number } };
  };
}

/** MET 날씨 기호 → 쉬운 말 */
export function skyOfMet(symbol: string): string {
  const s = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (/thunder/.test(s)) return '뇌우';
  if (/sleet/.test(s)) return '진눈깨비';
  if (/snow/.test(s)) return '눈';
  if (/rain|drizzle/.test(s)) return '비';
  if (s === 'fog') return '안개';
  if (s === 'cloudy') return '흐림';
  if (s === 'partlycloudy' || s === 'fair') return '구름 조금';
  if (s === 'clearsky') return '맑음';
  return '알 수 없음';
}

const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const kstHour = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).getUTCHours();

/** MET 시간별 예보 → 하루씩(한국 날짜) 표 숫자 */
export function fromMet(place: string, json: unknown): WeatherData | null {
  const series = ((json as { properties?: { timeseries?: MetSeries[] } })?.properties?.timeseries ?? []).filter((t) => typeof t?.time === 'string');
  if (!series.length) return null;
  const byDay = new Map<string, MetSeries[]>();
  for (const t of series) {
    const k = kstDate(t.time);
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const days: WeatherDay[] = [];
  for (const [date, list] of [...byDay].slice(0, 7)) {
    const temps: number[] = [];
    let rain: number | null = null;
    const skies = new Map<string, number>();
    for (const t of list) {
      const d = t.data;
      const at = d?.instant?.details?.air_temperature;
      if (typeof at === 'number') temps.push(at);
      for (const v of [d?.next_6_hours?.details?.air_temperature_max, d?.next_6_hours?.details?.air_temperature_min]) if (typeof v === 'number') temps.push(v);
      for (const p of [d?.next_1_hours?.details?.probability_of_precipitation, d?.next_6_hours?.details?.probability_of_precipitation]) if (typeof p === 'number') rain = Math.max(rain ?? 0, p);
      const sym = d?.next_6_hours?.summary?.symbol_code ?? d?.next_1_hours?.summary?.symbol_code;
      // 낮(6~18시) 하늘을 더 무겁게
      if (sym) skies.set(skyOfMet(sym), (skies.get(skyOfMet(sym)) ?? 0) + (kstHour(t.time) >= 6 && kstHour(t.time) < 18 ? 2 : 1));
    }
    if (!temps.length || !skies.size) continue;
    const sky = [...skies].sort((x, y) => y[1] - x[1])[0][0];
    days.push({ date, wd: WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()], sky, lo: Math.round(Math.min(...temps)), hi: Math.round(Math.max(...temps)), rain: rain === null ? null : Math.round(rain) });
  }
  if (!days.length) return null;
  const first = series[0].data;
  const t = first?.instant?.details?.air_temperature;
  const sym = first?.next_1_hours?.summary?.symbol_code;
  return { place, now: typeof t === 'number' ? { temp: Math.round(t), sky: sym ? skyOfMet(sym) : '' } : null, days };
}

type Fetch = (url: string) => Promise<Response>;
// Nominatim 이용 규칙: 앱 이름을 User-Agent로 밝힌다
// 하나가 늦어도 전체가 오래 걸리지 않게 5초에서 끊는다(v0.7.72)
const get: Fetch = (url) => fetch(url, { headers: { 'User-Agent': 'minoffia-weather/1.0 (personal app)' }, signal: AbortSignal.timeout(5_000) });

/** 곳 이름 → 좌표(표에 없으면 Open-Meteo 위치 찾기) */
async function locate(place: string, run: Fetch): Promise<Spot | null> {
  const known = CITY[place];
  if (known) return { name: place, lat: known[0], lon: known[1] };
  const res = await run(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=ko&format=json`);
  if (!res.ok) return null;
  const top = ((await res.json()) as { results?: { name?: string; latitude?: number; longitude?: number }[] }).results?.[0];
  return top && typeof top.latitude === 'number' && typeof top.longitude === 'number' ? { name: top.name || place, lat: top.latitude, lon: top.longitude } : null;
}

/** Nominatim 주소 → '성남시 분당구 수내동' */
export function nameFromNominatim(json: unknown): string {
  const a = ((json as { address?: Record<string, string> })?.address ?? {}) as Record<string, string>;
  const gu = a.borough || a.city_district;
  return [a.city || a.county || a.province || a.state, gu, a.quarter || a.neighbourhood || a.village || (gu ? '' : a.suburb)].filter(Boolean).join(' ');
}
/** Photon 결과 → '성남시 분당 수내동' */
export function nameFromPhoton(json: unknown): string {
  const p = ((json as { features?: { properties?: Record<string, string> }[] })?.features?.[0]?.properties ?? {}) as Record<string, string>;
  return [p.city || p.county || p.state, p.district, p.locality].filter(Boolean).join(' ');
}

/** 좌표 → 동네 이름(v0.8.0: 운영에서 Nominatim이 계속 403이라 Photon 먼저 → 안 되면 Nominatim, 둘 다 OpenStreetMap 자료·무료·키 없음). 못 찾으면 ''. 좌표는 기록하지 않는다 */
export async function areaName(lat: number, lon: number, run: Fetch = get, log: (e: Record<string, unknown>) => void = () => undefined): Promise<string> {
  const tries: [string, string, (j: unknown) => string][] = [
    ['Photon', `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`, nameFromPhoton],
    ['Nominatim', `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&accept-language=ko`, nameFromNominatim],
  ];
  for (const [who, url, read] of tries) {
    const t0 = Date.now();
    try {
      const res = await run(url);
      if (!res.ok) {
        await res.body?.cancel();
        log({ areaTry: who, status: res.status, ms: Date.now() - t0 });
        continue;
      }
      const name = read(await res.json());
      if (name) return name;
      log({ areaTry: who, status: 200, empty: true, ms: Date.now() - t0 });
    } catch (e) {
      log({ areaTry: who, error: (e as Error).name, ms: Date.now() - t0 });
    }
  }
  return '';
}

export interface Spot {
  name: string;
  lat: number;
  lon: number;
}
/** 앱이 보내는 기준 곳(v0.7.70): 설정한 지역 이름 또는 현재 위치(약 1km로 줄인 좌표) */
export type Where = { place: string } | { lat: number; lon: number };

/** 받은 where를 믿을 수 있는 값으로만(범위 밖·이상한 값은 버림) */
export function cleanWhere(raw: unknown): Where | null {
  const w = raw as { place?: unknown; lat?: unknown; lon?: unknown } | null;
  if (!w || typeof w !== 'object') return null;
  if (typeof w.place === 'string' && /^[가-힣A-Za-z0-9 ]{2,20}$/.test(w.place.trim())) return { place: w.place.trim() };
  const lat = Number(w.lat);
  const lon = Number(w.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
  return null;
}

export const WEATHER_SOURCE = 'https://open-meteo.com/';
export const MET_SOURCE = 'https://www.met.no/en';
const SEOUL: Spot = { name: '서울', lat: CITY['서울'][0], lon: CITY['서울'][1] };

/** 곳 정하기: 질문에 적힌 곳 > 설정한 지역 > 현재 위치 > 서울. 현재 위치의 동네 이름은 따로(예보와 동시에) 찾는다 */
async function pick(ask: WeatherAsk, where: Where | null, run: Fetch, log: (e: Record<string, unknown>) => void): Promise<{ spot: Spot; name: Promise<string> | null }> {
  if (ask.place) return { spot: (await locate(ask.place, run).catch(() => null)) ?? SEOUL, name: null };
  if (where && 'place' in where) return { spot: (await locate(where.place, run).catch(() => null)) ?? SEOUL, name: null };
  if (where) return { spot: { name: '현재 위치', lat: where.lat, lon: where.lon }, name: areaName(where.lat, where.lon, run, log).then((n) => n || '현재 위치') };
  return { spot: SEOUL, name: null };
}

export interface WeatherResult {
  answer: string;
  place: string;
  data: WeatherData;
  /** 숫자를 준 곳 */
  source: 'Open-Meteo' | 'MET Norway';
}

/** 날씨 답. Open-Meteo → 안 되면 MET Norway. 둘 다 안 되면 null(어디서 왜 안 됐는지 log로) */
export async function weatherAnswer(ask: WeatherAsk, where: Where | null = null, run: Fetch = get, log: (e: Record<string, unknown>) => void = () => undefined): Promise<WeatherResult | null> {
  const { spot, name } = await pick(ask, where, run, log);
  const tryOne = async (source: WeatherResult['source'], url: string, read: (place: string, json: unknown) => WeatherData | null) => {
    const t0 = Date.now();
    try {
      const res = await run(url);
      if (!res.ok) {
        await res.body?.cancel();
        log({ weatherTry: source, status: res.status, ms: Date.now() - t0 });
        return null;
      }
      const data = read(spot.name, await res.json());
      if (!data) log({ weatherTry: source, status: 200, empty: true, ms: Date.now() - t0 });
      return data;
    } catch (e) {
      log({ weatherTry: source, error: (e as Error).name, ms: Date.now() - t0 });
      return null;
    }
  };
  const om = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
    '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=7';
  let source: WeatherResult['source'] = 'Open-Meteo';
  let data = await tryOne('Open-Meteo', om, (p, j) => weatherData(p, j as Forecast));
  if (!data) {
    source = 'MET Norway';
    data = await tryOne('MET Norway', `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${spot.lat}&lon=${spot.lon}`, fromMet);
  }
  if (!data) return null;
  const place = name ? await name : spot.name;
  const named = { ...data, place };
  return { answer: textOf(named), place, data: named, source };
}
