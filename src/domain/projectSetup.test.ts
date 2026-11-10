import { describe, expect, it } from 'vitest';
import { setupIssues } from './projectSetup';
import { EMPTY_WORKFLOW } from './workflow-types';

const task = { id: 't1', projectId: 'p1' } as never;
const a = (assignee: string, status: string, ps: string, at: string) => ({ taskId: 't1', assignee, dispatchStatus: status, actualProviderStatus: ps, updatedAt: at }) as never;

describe('프로젝트 준비 체크리스트(v0.6.32)', () => {
  it('Codex 환경 없음·Claude 저장소 없음 흔적을 찾는다', () => {
    const wf = { ...EMPTY_WORKFLOW, assignments: [a('codex', 'failed', 'linear: 시작 못 함 — Codex 환경 없음', '2026-11-10T01'), a('claude', 'failed', '저장소 없음: 루틴 설정에 추가', '2026-11-10T02')] };
    expect(setupIssues('p1', [task], wf)).toEqual({ codex: 'Codex가 이 저장소 환경을 찾지 못했어요', claude: 'Claude 루틴에 이 저장소가 없어요' });
  });
  it('그 뒤에 잘 된 기록이 있으면 알리지 않는다', () => {
    const wf = { ...EMPTY_WORKFLOW, assignments: [a('codex', 'failed', 'Codex 환경 없음', '2026-11-10T01'), a('codex', 'completed', 'session_reported_result', '2026-11-10T03')] };
    expect(setupIssues('p1', [task], wf).codex).toBeNull();
  });
  it('다른 프로젝트 기록은 보지 않는다', () => {
    const wf = { ...EMPTY_WORKFLOW, assignments: [a('codex', 'failed', 'Codex 환경 없음', '2026-11-10T01')] };
    expect(setupIssues('p2', [task], wf).codex).toBeNull();
  });
});
