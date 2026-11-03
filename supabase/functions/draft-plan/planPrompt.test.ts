import { describe, expect, it } from 'vitest';
import { parsePmPlan } from '../../../src/domain/pmPlan';
import { assignLine, buildPlanText, cleanPlanJson, codePaths, PLAN_SYSTEM } from './planPrompt';

const input = {
  taskId: 't1',
  repo: 'me/app',
  projectName: '앱',
  spec: { revision: 2, user_original_text: '원문', final_prompt: '다크 모드', change_scope: '설정 화면', preserve_constraints: '', test_criteria: '400px 넘침 없음' },
  qa: [{ question: '어느 화면?', answer: '설정' }],
  revisionFeedback: '',
  away: { codex: false, claude: false, gemini: false },
  geminiDevOk: true,
  rules: ['결제 없음'],
  files: ['src/App.tsx'],
};

describe('Gemini 대신 분배(v0.5.20)', () => {
  it('배정 안내는 휴가인 쪽을 빼고, AI Office 저장소엔 Gemini 개발을 안 쓴다', () => {
    expect(assignLine({ codex: false, claude: false, gemini: false }, true)).toContain('쉬움 "gemini_dev", 보통 "codex_primary", 어려움 "claude_support"');
    expect(assignLine({ codex: true, claude: true, gemini: false }, false)).toContain('쉬움 "claude_support", 보통 "claude_support", 어려움 "codex_primary"');
    expect(assignLine({ codex: false, claude: false, gemini: false }, false)).toContain('"gemini_dev"를 쓰지 않는다');
  });

  it('지시문에 기획서·확인 답·규칙·파일 목록이 들어가고, 형식 설명은 시스템에', () => {
    const t = buildPlanText(input);
    for (const s of ['다크 모드', 'A1. 설정', '- 결제 없음', 'src/App.tsx', '승인된 기획서 v2']) expect(t).toContain(s);
    expect(PLAN_SYSTEM).toContain('"work_items"');
  });

  it('코드 파일만, 의존·빌드 폴더 빼고', () => {
    expect(codePaths(['src/a.ts', 'node_modules/x/i.js', 'dist/a.js', 'README.md', 'app/page.tsx'])).toEqual(['src/a.ts', 'app/page.tsx']);
  });

  it('Gemini 답을 꺼내 task_id·저장소는 서버 값으로 덮고, 앱 검사를 지난다', () => {
    const answer = '```json\n{"task_id":"다른것","repository":"x/y","status":"planned","development_mode":"direct","work_items":[{"id":"W1","title":"다크 모드","goal":"g","dependencies":[],"assignee_preference":"codex_primary","execution_mode":"manual_handoff","difficulty":4}]}\n```';
    const plan = cleanPlanJson(answer, 't1', 'me/app');
    expect(plan).not.toBeNull();
    const r = parsePmPlan(plan!, 't1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.repository).toBe('me/app');
    expect(cleanPlanJson('계획 못 씀', 't1', 'me/app')).toBeNull();
    expect(cleanPlanJson('{"status":"planned"}', 't1', 'me/app')).toBeNull();
  });
});
