import { describe, expect, it } from 'vitest';
import { WEATHER_RE } from '../../../src/domain/weather';
import { areaName, cleanWhere, fromMet, nameFromNominatim, nameFromPhoton, skyOf, skyOfMet, WEATHER, weatherAnswer, weatherAsk, weatherText } from './weather';

const forecast = {
  current: { temperature_2m: 4.6, weather_code: 0 },
  daily: {
    time: ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'],
    weather_code: [1, 61, 3, 0, 0, 71, 2],
    temperature_2m_max: [11.2, 9.4, 8, 7, 9, 3, 6],
    temperature_2m_min: [1.8, 3.1, 0, -1, 0, -4, -2],
    precipitation_probability_max: [10, 70, 20, 0, 5, 60, 10],
  },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('날씨 질문(v0.7.68)', () => {
  it('앱과 서버의 날씨 말 규칙이 같다', () => {
    expect(WEATHER.source).toBe(WEATHER_RE.source);
  });
  it('날씨 말을 알아보고, 곳이 없으면 null(설정·현재 위치로)', () => {
    expect(weatherAsk('오늘날씨')).toEqual({ place: null, day: 0 });
    expect(weatherAsk('부산 내일 날씨 어때?')).toEqual({ place: '부산', day: 1 });
    expect(weatherAsk('@Tavily 제주도 모레 비 와?')).toEqual({ place: '제주도', day: 2 });
    expect(weatherAsk('대전의 기온 알려줘')).toEqual({ place: '대전', day: 0 });
    expect(weatherAsk('무료 AI 서비스 뭐 있어')).toBeNull();
  });
  it('오늘·내일·모레와 이번 주 남은 날을 한 번에 알려 준다', () => {
    expect(weatherText('서울', 0, forecast)).toBe(
      [
        '서울 날씨',
        '오늘 11/18 수 · 구름 조금 · 2°~11° · 비·눈 10% (지금 5° 맑음)',
        '내일 11/19 목 · 비 · 3°~9° · 비·눈 70% ☂',
        '모레 11/20 금 · 흐림 · 0°~8° · 비·눈 20%',
        '',
        '이번 주 남은 날',
        '11/21 토 · 맑음 · -1°~7° · 비·눈 0%',
        '11/22 일 · 맑음 · 0°~9° · 비·눈 5%',
        '11/23 월 · 눈 · -4°~3° · 비·눈 60% ☂',
        '11/24 화 · 구름 조금 · -2°~6° · 비·눈 10%',
        '',
        '☂ 표시 날은 우산을 챙기세요.',
      ].join('\n'),
    );
    expect(weatherText('서울', 0, {})).toBeNull();
    expect(skyOf(95)).toBe('뇌우');
  });
  it('표에 있는 곳은 위치 찾기 없이 예보 한 번만 부른다', async () => {
    const urls: string[] = [];
    const got = await weatherAnswer({ place: '부산', day: 0 }, null, async (u) => (urls.push(u), json(forecast)));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('latitude=35.1796');
    expect(got?.answer).toMatch(/^부산 날씨\n오늘 11\/18/);
    expect(urls[0]).toContain('forecast_days=7');
  });
  it('모르는 곳은 위치 찾기, 못 찾으면 서울, 예보 실패면 null', async () => {
    const got = await weatherAnswer({ place: '제주도', day: 0 }, null, async (u) => (u.includes('geocoding') ? json({ results: [{ name: '제주도', latitude: 33.4, longitude: 126.5 }] }) : json(forecast)));
    expect(got?.place).toBe('제주도');
    const none = await weatherAnswer({ place: '어딘가', day: 0 }, null, async (u) => (u.includes('geocoding') ? json({}) : json(forecast)));
    expect(none?.place).toBe('서울');
    expect(await weatherAnswer({ place: '서울', day: 0 }, null, async () => json({}, 500))).toBeNull();
  });
  it('곳 정하기: 질문 > 설정 지역 > 현재 위치(동네 이름) > 서울, 표 숫자도 함께', async () => {
    const urls: string[] = [];
    const run = async (u: string) => {
      urls.push(u);
      if (u.includes('nominatim')) return json({ address: { city: '성남시', borough: '분당구', suburb: '분당' } });
      return json(forecast);
    };
    const here = await weatherAnswer({ place: null, day: 0 }, { lat: 37.38, lon: 127.12 }, run);
    expect(here?.place).toBe('성남시 분당구');
    expect(urls.some((u) => u.includes('latitude=37.38'))).toBe(true);
    expect(here?.data.days).toHaveLength(7);
    expect(here?.data.days[1]).toEqual({ date: '2026-11-19', wd: '목', sky: '비', lo: 3, hi: 9, rain: 70 });
    expect(here?.data.now).toEqual({ temp: 5, sky: '맑음' });
    expect((await weatherAnswer({ place: null, day: 0 }, { place: '부산' }, run))?.place).toBe('부산');
    expect((await weatherAnswer({ place: '대구', day: 0 }, { place: '부산' }, run))?.place).toBe('대구');
    expect((await weatherAnswer({ place: null, day: 0 }, null, run))?.place).toBe('서울');
    const noName = await weatherAnswer({ place: null, day: 0 }, { lat: 37.5, lon: 127 }, async (u) => (u.includes('nominatim') || u.includes('photon') ? json({}, 500) : json(forecast)));
    expect(noName?.place).toBe('현재 위치');
  });
  it('앱이 보낸 위치는 범위·모양을 확인하고 좌표는 약 1km로 줄인다', () => {
    expect(cleanWhere({ lat: 37.38123, lon: 127.11987 })).toEqual({ lat: 37.38, lon: 127.12 });
    expect(cleanWhere({ place: ' 부산 ' })).toEqual({ place: '부산' });
    expect(cleanWhere({ lat: 200, lon: 0 })).toBeNull();
    expect(cleanWhere({ place: '<script>' })).toBeNull();
    expect(cleanWhere('x')).toBeNull();
  });
  it('Open-Meteo가 막히면 MET Norway 숫자로 답하고, 어디서 막혔는지 남긴다(v0.7.72)', async () => {
    const met = {
      properties: {
        timeseries: [
          { time: '2026-11-18T00:00:00Z', data: { instant: { details: { air_temperature: 4.4 } }, next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: { probability_of_precipitation: 0 } }, next_6_hours: { summary: { symbol_code: 'fair_day' }, details: { air_temperature_max: 11.2, air_temperature_min: 3, probability_of_precipitation: 10 } } } },
          { time: '2026-11-18T06:00:00Z', data: { instant: { details: { air_temperature: 9 } }, next_6_hours: { summary: { symbol_code: 'cloudy' }, details: { air_temperature_min: 1.6, probability_of_precipitation: 5 } } } },
          { time: '2026-11-19T00:00:00Z', data: { instant: { details: { air_temperature: 5 } }, next_6_hours: { summary: { symbol_code: 'rain' }, details: { air_temperature_max: 9, air_temperature_min: 3, probability_of_precipitation: 70 } } } },
        ],
      },
    };
    const logs: Record<string, unknown>[] = [];
    const got = await weatherAnswer({ place: '부산', day: 0 }, null, async (u) => (u.includes('open-meteo') ? json({ reason: 'limit' }, 429) : json(met)), (e) => logs.push(e));
    expect(got?.source).toBe('MET Norway');
    expect(got?.data.days[0]).toMatchObject({ date: '2026-11-18', lo: 2, hi: 11, rain: 10 });
    expect(got?.data.days[1]).toMatchObject({ date: '2026-11-19', sky: '비', rain: 70 });
    expect(got?.data.now).toEqual({ temp: 4, sky: '맑음' });
    expect(logs[0]).toMatchObject({ weatherTry: 'Open-Meteo', status: 429 });
    expect(skyOfMet('lightsnowshowers_night')).toBe('눈');
    expect(fromMet('서울', {})).toBeNull();
  });
  it('동네 이름: Nominatim이 막히면 Photon, 동까지(v0.7.75)', async () => {
    expect(nameFromNominatim({ address: { quarter: '수내동', suburb: '분당', borough: '분당구', city: '성남시', province: '경기도' } })).toBe('성남시 분당구 수내동');
    expect(nameFromPhoton({ features: [{ properties: { locality: '수내동', district: '분당', city: '성남시' } }] })).toBe('성남시 분당 수내동');
    const logs: Record<string, unknown>[] = [];
    const name = await areaName(37.38, 127.12, async (u) => (u.includes('nominatim') ? json({}, 403) : json({ features: [{ properties: { locality: '수내동', district: '분당', city: '성남시' } }] })), (e) => logs.push(e));
    expect(name).toBe('성남시 분당 수내동');
    expect(logs[0]).toMatchObject({ areaTry: 'Nominatim', status: 403 });
    expect(await areaName(1, 2, async () => json({}, 500))).toBe('');
  });
});
