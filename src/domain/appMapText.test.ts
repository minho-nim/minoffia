import { describe, expect, it } from 'vitest';
import { appMapSection } from './appMapText';

describe('개발 지시서의 앱 지도(v0.5.95)', () => {
  it('화면·기능 이름과 위치만 짧게', () => {
    const t = appMapSection({ parts: [{ name: '운동 기록 화면', kind: '화면', what: '세트를 적어요', folder: 'src/workout', files: [] }, { name: '빈 위치', kind: '기능', what: 'x', folder: '', files: [] }] });
    expect(t).toContain('- [화면] 운동 기록 화면: 세트를 적어요 → src/workout/');
    expect(t).not.toContain('빈 위치');
    expect(appMapSection(null)).toBe('');
    expect(appMapSection({ parts: Array.from({ length: 200 }, (_, i) => ({ name: `부분${i}`, what: 'x'.repeat(90), folder: `f${i}` })) }).length).toBeLessThan(2300);
  });
});
