import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bugSteps, isBugWork, REPO_MAP_SCRIPT, repoMapStep } from '../../../src/domain/devHabits';

describe('개발 습관·저장소 지도(v0.4.96)', () => {
  it('서버 함수 3곳은 같은 파일을 쓴다', () => {
    const app = readFileSync('src/domain/devHabits.ts', 'utf8');
    for (const f of ['dispatch-claude', 'dispatch-claude-dev', 'draft-plan']) expect(readFileSync(`supabase/functions/${f}/devHabits.ts`, 'utf8')).toBe(app);
  });
  it('지도 스크립트는 scripts/repo-map.mjs와 같다', () => {
    expect(REPO_MAP_SCRIPT).toBe(readFileSync('scripts/repo-map.mjs', 'utf8').trim());
    expect(repoMapStep().join('\n')).toContain("<<'MAPEOF'");
  });
  it('이 저장소에서 돌리면 이미 있는 것을 짧게 보여 준다', () => {
    const out = execFileSync('node', ['scripts/repo-map.mjs'], { encoding: 'utf8' });
    expect(out).toContain('src/domain/:');
    expect(out).toContain('supabase/functions/');
    expect(out.length).toBeLessThanOrEqual(2600);
    expect(out).not.toMatch(/\.test\./);
    // v0.6.69: 저장소에 넣은 스킬(.agents/skills·.claude/skills)의 스크립트는 앱 코드가 아니라 지도에서 뺀다(넣으면 지도가 넘쳐 서버 함수가 빠졌다)
    expect(out).not.toMatch(/\.(agents|claude)\/skills/);
  });
});

describe('버그 진단 순서(v0.5.22, mattpocock diagnosing-bugs)', () => {
  it('버그 업무일 때만 넣는다(평소 토큰 0)', () => {
    for (const t of ['로그인이 안 돼', '저장하면 오류가 나요', '목록이 느려졌어', 'TypeError crash']) expect(isBugWork(t)).toBe(true);
    for (const t of ['다크 모드 추가', 'README에 설치 방법']) expect(isBugWork(t)).toBe(false);
    expect(bugSteps('다크 모드 추가')).toEqual([]);
    expect(bugSteps('저장이 안 됨').join('\n')).toContain('빨갛게 실패하는 확인 명령');
    // v0.5.24: 버그가 아닌 표현은 빼고, 기획서 초안의 판단이 있으면 그것을 따른다
    expect(isBugWork('오류 메시지 문구를 바꿔줘')).toBe(false);
    expect(isBugWork('에러 화면 디자인 다듬기')).toBe(false);
    expect(isBugWork('저장하면 오류가 나요')).toBe(true);
    expect(isBugWork('저장하면 오류가 나요', false)).toBe(false);
    expect(isBugWork('색 바꾸기', true)).toBe(true);
  });
});
