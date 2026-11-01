import { describe, expect, it } from 'vitest';
import { projectClaudeMd } from './rules';

describe('새 저장소 CLAUDE.md', () => {
  it('프로젝트 이름과 핵심 규칙을 담는다', () => {
    const md = projectClaudeMd('MuscleMap');
    expect(md.startsWith('# MuscleMap — AI 작업 규칙')).toBe(true);
    expect(md).toContain('올리기 승인 전에는 PR을 열지 않는다');
    expect(md).toContain('## 이 프로젝트에서 지켜야 할 것');
    expect(md).toContain('병합·배포는 어떤 경우에도 하지 않는다');
  });
  it('이름의 줄바꿈은 지운다', () => {
    expect(projectClaudeMd('a\nb').split('\n')[0]).toBe('# a b — AI 작업 규칙');
  });
});
