import { describe, expect, it } from 'vitest';
import { projectClaudeMd, syncRulesSection } from './rules';

describe('새 저장소 CLAUDE.md', () => {
  it('프로젝트 이름과 핵심 규칙을 담는다', () => {
    const md = projectClaudeMd('MuscleMap');
    expect(md.startsWith('# MuscleMap — AI 작업 규칙')).toBe(true);
    expect(md).toContain('올리기 승인 전에는 PR을 열지 않는다');
    expect(md).toContain('## 이 프로젝트에서 지켜야 할 것');
    expect(md).toContain('병합·배포는 어떤 경우에도 하지 않는다');
  });
  it('이미 쌓인 지켜야 할 것을 절에 넣는다(v0.4.60)', () => {
    expect(projectClaudeMd('X', ['결제 없음'])).toContain('-->\n- 결제 없음\n');
  });
  it('이름의 줄바꿈은 지운다', () => {
    expect(projectClaudeMd('a\nb').split('\n')[0]).toBe('# a b — AI 작업 규칙');
  });

  it('이미 있는 CLAUDE.md는 지켜야 할 것 절만 맞추고 나머지는 그대로(v0.4.75)', () => {
    const md = '# X\n\n소개\n\n## 이 프로젝트에서 지켜야 할 것\n- 옛 규칙\n\n## 기타\n그대로\n';
    const out = syncRulesSection(md, ['새 규칙']);
    expect(out).toContain('- 새 규칙');
    expect(out).not.toContain('옛 규칙');
    expect(out.startsWith('# X\n\n소개\n\n## 이 프로젝트에서 지켜야 할 것\n')).toBe(true);
    expect(out.endsWith('## 기타\n그대로\n')).toBe(true);
    expect(syncRulesSection(out, ['새 규칙'])).toBe(out);
  });
  it('절이 없으면 끝에 붙인다', () => {
    const out = syncRulesSection('# Y\n본문\n', ['a 규칙']);
    expect(out).toMatch(/^# Y\n본문\n\n## 이 프로젝트에서 지켜야 할 것\n<!--.*-->\n- a 규칙\n$/);
  });
});
