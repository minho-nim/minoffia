import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScreen, screenDecision, screenFeedback } from './screen';
import { signNotify, verifyNotify } from './notifySig';

describe('화면 평가(v0.7.40)', () => {
  it('JSON을 읽고 점수·문제를 다듬는다', () => {
    expect(parseScreen('```json\n{"score": 42.6, "problems": ["  버튼이 화면 밖  ", "", "글자 겹침"]}\n```')).toEqual({ score: 43, problems: ['버튼이 화면 밖', '글자 겹침'] });
    expect(parseScreen('{"score": 140}')).toEqual({ score: 100, problems: [] });
    expect(parseScreen('모르겠어요')).toBeNull();
  });
  it('확실히 깨진 화면만 다시 개발, 승인 뒤·이미 다시 개발이면 기록만', () => {
    const bad = { score: 40, problems: ['빈 화면'] };
    expect(screenDecision(bad, { verdict: 'pass', bApproved: false, redos: 0, maxRedo: 2 })).toBe('redo');
    expect(screenDecision(bad, { verdict: 'pass', bApproved: false, redos: 2, maxRedo: 2 })).toBe('owner');
    expect(screenDecision(bad, { verdict: 'pass', bApproved: true, redos: 0, maxRedo: 2 })).toBe('note');
    expect(screenDecision(bad, { verdict: 'redo', bApproved: false, redos: 0, maxRedo: 2 })).toBe('note');
    // v0.7.44: 60~79점은 코드 채점이 통과여도 사장님 확인
    expect(screenDecision({ score: 75, problems: ['여백'] }, { verdict: 'pass', bApproved: false, redos: 0, maxRedo: 2 })).toBe('owner');
    expect(screenDecision({ score: 75, problems: ['여백'] }, { verdict: 'owner', bApproved: false, redos: 0, maxRedo: 2 })).toBe('note');
    expect(screenDecision({ score: 85, problems: [] }, { verdict: 'pass', bApproved: false, redos: 0, maxRedo: 2 })).toBe('note');
    expect(screenFeedback(bad)).toContain('1) 빈 화면');
  });
  it('알림 표 서명: 맞는 것만, 만료·바꾼 값은 거절', async () => {
    const n = { taskId: '6b6b6b6b-0000-4000-8000-000000000001', revision: 2, kind: 'build', exp: Date.now() + 60_000 };
    const sig = await signNotify('s3cret', n);
    expect(await verifyNotify('s3cret', n, sig)).toBe(true);
    expect(await verifyNotify('s3cret', { ...n, revision: 3 }, sig)).toBe(false);
    expect(await verifyNotify('other', n, sig)).toBe(false);
    expect(await verifyNotify('s3cret', { ...n, exp: Date.now() - 1 }, await signNotify('s3cret', { ...n, exp: Date.now() - 1 }))).toBe(false);
  });
  it('복사본이 같다(notifySig·redo)', () => {
    const r = (p: string) => readFileSync(`supabase/functions/${p}`, 'utf8');
    expect(r('review-screen/notifySig.ts')).toBe(r('site-check/notifySig.ts'));
    expect(r('review-screen/redo.ts')).toBe(r('review-result/redo.ts'));
  });
});
