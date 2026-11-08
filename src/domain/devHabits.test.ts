import { describe, expect, it } from 'vitest';

describe('필요할 때만 붙는 확인 목록(v0.5.45)', () => {
  it('업무 글에 맞는 분야만 붙고, 해당 없으면 비어 있다', async () => {
    const { domainSteps } = await import('./devHabits');
    const ui = domainSteps('설정 화면 버튼 색 바꾸기').join('\n');
    expect(ui).toContain('## 화면 확인');
    expect(ui).not.toContain('## DB 변경 확인');
    expect(domainSteps('새 테이블과 마이그레이션 추가, RLS').join('\n')).toContain('## DB 변경 확인');
    expect(domainSteps('README 오타 고치기')).toEqual([]);
  });
});
