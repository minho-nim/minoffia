import { describe, expect, it } from 'vitest';
import { agoText, applyAccountWeatherPlace, cleanWeather, demoWeather, readWeatherWhere, validPlace } from './weather';

describe('날씨 표 숫자(v0.7.70)', () => {
  it('서버 표 숫자를 확인하고 이상한 날은 뺀다', () => {
    const w = cleanWeather({ place: '부산', now: { temp: 5, sky: '맑음' }, days: [{ date: '2026-11-18', wd: '수', sky: '비', lo: 1, hi: 9, rain: 70 }, { date: 'x', lo: 'a' }] });
    expect(w?.days).toHaveLength(1);
    expect(w?.now).toEqual({ temp: 5, sky: '맑음' });
    expect(cleanWeather({ place: '부산', days: [] })).toBeNull();
    expect(cleanWeather(null)).toBeNull();
  });
  it('체험 날씨는 7일, 지역 이름은 2~20자', () => {
    expect(demoWeather(new Date('2026-11-18T03:00:00Z')).days).toHaveLength(7);
    expect(validPlace('부산')).toBe(true);
    expect(validPlace('a')).toBe(false);
    expect(validPlace('<b>')).toBe(false);
  });
  it('계정 값으로 이 기기 설정을 맞춘다(v0.7.71): 지역 이름 또는 현재 위치', () => {
    applyAccountWeatherPlace('분당');
    expect(readWeatherWhere()).toEqual({ mode: 'place', place: '분당' });
    applyAccountWeatherPlace(null);
    expect(readWeatherWhere()).toEqual({ mode: 'here' });
  });
  it('확인 시각을 쉬운 말로(v0.7.73)', () => {
    const now = Date.parse('2026-11-18T10:00:00Z');
    expect(agoText('2026-11-18T09:59:40Z', now)).toBe('방금');
    expect(agoText('2026-11-18T09:50:00Z', now)).toBe('10분 전');
    expect(agoText('2026-11-18T07:00:00Z', now)).toBe('3시간 전');
    expect(agoText('2026-11-16T10:00:00Z', now)).toBe('2일 전');
  });
});
