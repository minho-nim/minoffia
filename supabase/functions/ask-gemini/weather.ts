// 날씨 질문(v0.7.68, 소유자 "오늘날씨 → AI 날씨 기사로 답함"): 웹 검색은 날씨 값을 못 준다.
// 날씨는 Open-Meteo(무료·키 없음)에서 숫자를 받아 규칙으로 답한다(모델 호출 0). 곳을 못 찾으면 서울.

/** 날씨를 묻는 말인지 */
const WEATHER = /날씨|기온|몇\s?도|우산|(비|눈)\s?(와|오|올|내리)|일기\s?예보/;

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
  place: string;
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
  return { place: word ?? '서울', day };
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
  const first = dayLine(f, 0);
  if (!first) return null;
  const lines = [`${place} 날씨`];
  const now = round(f.current?.temperature_2m);
  lines.push(`오늘 ${first}${now !== null ? ` (지금 ${now}°${typeof f.current?.weather_code === 'number' ? ` ${skyOf(f.current.weather_code)}` : ''})` : ''}`);
  for (const i of [1, 2]) {
    const l = dayLine(f, i);
    if (l) lines.push(`${DAY_WORD[i]} ${l}`);
  }
  const rest = [3, 4, 5, 6].map((i) => dayLine(f, i)).filter(Boolean) as string[];
  if (rest.length) lines.push('', '이번 주 남은 날', ...rest);
  if ([0, 1, 2].some((i) => (f.daily?.precipitation_probability_max?.[i] ?? 0) >= 50)) lines.push('', '☂ 표시 날은 우산을 챙기세요.');
  return lines.join('\n');
}

type Fetch = (url: string) => Promise<Response>;
const get: Fetch = (url) => fetch(url, { signal: AbortSignal.timeout(8_000) });

/** 곳 이름 → 좌표(표에 없으면 Open-Meteo 위치 찾기) */
async function locate(place: string, run: Fetch): Promise<{ name: string; lat: number; lon: number } | null> {
  const known = CITY[place];
  if (known) return { name: place, lat: known[0], lon: known[1] };
  const res = await run(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=ko&format=json`);
  if (!res.ok) return null;
  const top = ((await res.json()) as { results?: { name?: string; latitude?: number; longitude?: number }[] }).results?.[0];
  return top && typeof top.latitude === 'number' && typeof top.longitude === 'number' ? { name: top.name || place, lat: top.latitude, lon: top.longitude } : null;
}

export const WEATHER_SOURCE = 'https://open-meteo.com/';

/** 날씨 답(못 받으면 null → 평소처럼 웹 조사) */
export async function weatherAnswer(ask: WeatherAsk, run: Fetch = get): Promise<{ answer: string; place: string } | null> {
  try {
    let spot = await locate(ask.place, run);
    // 곳 이름으로 잘못 뽑힌 말이면 서울로
    if (!spot) spot = { name: '서울', lat: CITY['서울'][0], lon: CITY['서울'][1] };
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=7';
    const res = await run(url);
    if (!res.ok) return null;
    const text = weatherText(spot.name, ask.day, (await res.json()) as Forecast);
    return text ? { answer: text, place: spot.name } : null;
  } catch {
    return null;
  }
}
