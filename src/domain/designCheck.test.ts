import { describe, expect, it } from 'vitest';
import { groupFindings, parseDesignReport } from './designCheck';

describe('디자인 자동 검사 결과(v0.5.56)', () => {
  it('모양을 확인하고 같은 규칙을 묶어 한국어로', () => {
    expect(parseDesignReport({ checkedAt: 'x' })).toBeNull();
    const r = parseDesignReport({ checkedAt: '2026-11-08T00:00:00Z', url: 'https://a.pages.dev', ok: true, findings: [
      { rule: 'low-contrast', name: 'Low contrast text', snippet: '1.6:1', view: 'desktop' },
      { rule: 'low-contrast', name: 'Low contrast text', snippet: '2:1', view: 'mobile' },
      { rule: 'new-rule', name: 'New thing', view: 'mobile' }, 3] })!;
    expect(r.findings).toHaveLength(3);
    expect(groupFindings(r.findings)).toEqual([
      { label: '글자와 배경 대비가 낮아요', count: 2, views: '데스크톱·휴대폰', example: '1.6:1' },
      { label: 'New thing', count: 1, views: '휴대폰', example: '' },
    ]);
  });
});
