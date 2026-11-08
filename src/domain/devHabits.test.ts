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

describe('디자인 지시 묶음(v0.5.55)', () => {
  it('새 디자인·꾸미기 업무에만 붙는다', async () => {
    const { domainSteps } = await import('./devHabits');
    expect(domainSteps('홈페이지 첫 화면을 세련되게 새 디자인').join('\n')).toContain('디자인 원칙');
    expect(domainSteps('README 오타 고치기').join('\n')).not.toContain('디자인 원칙');
  });
});
