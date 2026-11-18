import { describe, expect, it } from 'vitest';
import { jobMinutes, reposToRead, runMinutes, workflowLabel } from './actionsUsage';

describe('GitHub Actions 사용량(v0.7.93)', () => {
  it('작업마다 분 단위로 올려 더한다(10초 = 1분, 61초 = 2분)', () => {
    expect(jobMinutes([
      { started_at: '2026-11-18T00:00:00Z', completed_at: '2026-11-18T00:00:10Z' },
      { started_at: '2026-11-18T00:00:00Z', completed_at: '2026-11-18T00:01:01Z' },
      { started_at: null, completed_at: null },
    ])).toBe(3);
  });
  it('끝난 실행만 실행 시간 올림', () => {
    expect(runMinutes({ id: 1, name: 'verify', status: 'completed', conclusion: 'success', created_at: '2026-11-18T00:00:00Z', run_started_at: '2026-11-18T00:00:05Z', updated_at: '2026-11-18T00:02:06Z' })).toBe(3);
    expect(runMinutes({ id: 2, name: 'verify', status: 'in_progress', conclusion: null, created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-18T00:05:00Z' })).toBe(0);
  });
  it('이름과 읽을 저장소(MinLab 빼고, 겹치지 않게)', () => {
    expect(workflowLabel('verify')).toBe('PR 검사(verify)');
    expect(workflowLabel('운영 배포(release)')).toBe('운영 배포(release)');
    expect(workflowLabel(null)).toBe('이름 없는 실행');
    expect(reposToRead(['minho-nim/MinSnakey', 'minho-nim/MinLab', null, 'minho-nim/minoffia', 'bad repo'])).toEqual(['minho-nim/minoffia', 'minho-nim/minoffia-skills', 'minho-nim/minoffia-notes', 'minho-nim/MinSnakey']);
  });
});
