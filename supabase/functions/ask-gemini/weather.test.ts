import { describe, expect, it } from 'vitest';
import { skyOf, weatherAnswer, weatherAsk, weatherText } from './weather';

const forecast = {
  current: { temperature_2m: 4.6, weather_code: 0 },
  daily: { time: ['2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [1, 61, 3], temperature_2m_max: [11.2, 9.4, 8], temperature_2m_min: [1.8, 3.1, 0], precipitation_probability_max: [10, 70, 20] },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('날씨 질문(v0.7.68)', () => {
  it('날씨 말을 알아보고, 곳이 없으면 서울', () => {
    expect(weatherAsk('오늘날씨')).toEqual({ place: '서울', day: 0 });
    expect(weatherAsk('부산 내일 날씨 어때?')).toEqual({ place: '부산', day: 1 });
    expect(weatherAsk('@Tavily 제주도 모레 비 와?')).toEqual({ place: '제주도', day: 2 });
    expect(weatherAsk('대전의 기온 알려줘')).toEqual({ place: '대전', day: 0 });
    expect(weatherAsk('무료 AI 서비스 뭐 있어')).toBeNull();
  });
  it('숫자로 쉬운 답을 만든다', () => {
    expect(weatherText('서울', 0, forecast)).toBe('서울 오늘(11/18) 날씨: 구름 조금, 최저 2° / 최고 11°, 비·눈 올 확률 10%. 지금 5° · 맑음.');
    expect(weatherText('서울', 1, forecast)).toContain('비, 최저 3° / 최고 9°, 비·눈 올 확률 70%. 우산을 챙기세요.');
    expect(weatherText('서울', 0, {})).toBeNull();
    expect(skyOf(95)).toBe('뇌우');
  });
  it('표에 있는 곳은 위치 찾기 없이 예보 한 번만 부른다', async () => {
    const urls: string[] = [];
    const got = await weatherAnswer({ place: '부산', day: 0 }, async (u) => (urls.push(u), json(forecast)));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('latitude=35.1796');
    expect(got?.answer).toMatch(/^부산 오늘/);
  });
  it('모르는 곳은 위치 찾기, 못 찾으면 서울, 예보 실패면 null', async () => {
    const got = await weatherAnswer({ place: '제주도', day: 0 }, async (u) => (u.includes('geocoding') ? json({ results: [{ name: '제주도', latitude: 33.4, longitude: 126.5 }] }) : json(forecast)));
    expect(got?.place).toBe('제주도');
    const none = await weatherAnswer({ place: '어딘가', day: 0 }, async (u) => (u.includes('geocoding') ? json({}) : json(forecast)));
    expect(none?.place).toBe('서울');
    expect(await weatherAnswer({ place: '서울', day: 0 }, async () => json({}, 500))).toBeNull();
  });
});
