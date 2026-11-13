/**
 * 업무 흐름 시뮬레이션(v0.4.20): 가짜 업무로 요청 → 기획 → 계획 → 실행 → 결과 → 올리기 → 배포를 한 단계씩 밟으며
 * 단계·내 차례·사무실 말풍선·입력창 알림·멈춤 감지·승인 규칙이 맞물리는지 본다(AI 호출 없음).
 * 실행: npx vitest run src/domain/simulation.test.ts  (SIM_LOG=1이면 단계표를 출력)
 */
import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { canApprove, deriveWorkflow } from './workflow';
import {
  EMPTY_WORKFLOW,
  STAGE_LABEL,
  type AgentAssignment,
  type AgentKind,
  type Approval,
  type Gate,
  type PmPlan,
  type PrCheck,
  type ResultPackage,
  type TaskSpec,
  type WorkflowData,
} from './workflow-types';
import { parsePmPlan } from './pmPlan';
import { myTurns } from './myTurn';
import { stalls } from './stall';
import { stageNotices } from './stageNotice';
import { speechFor } from '../office/speech';
import { decideDeploy } from '../../supabase/functions/deploy-release/decide';

const T0 = Date.parse('2026-11-01T00:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const LOG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM_LOG === '1';

/** 한 업무의 기록을 쌓아 가며 매 단계 화면 상태를 기록하는 작은 무대 */
class Sim {
  task: Task;
  data: WorkflowData = { ...EMPTY_WORKFLOW };
  seen: Record<string, string> = {};
  clock = 0;
  rows: string[] = [];
  private n = 0;

  constructor(id: string, title: string) {
    this.task = {
      id, projectId: 'p1', title, description: '', type: 'dev', requestedType: 'auto', priority: 'normal', assignee: 'codex',
      routeReason: '', status: 'queued', dispatch: { state: 'none' }, createdAt: at(0), updatedAt: at(0),
    };
    this.stageNotices();
  }
  private id = (p: string) => `${p}-${++this.n}`;
  tick(min: number) {
    this.clock += min;
    return at(this.clock);
  }
  get view() {
    return deriveWorkflow(this.task, this.data);
  }
  stageNotices() {
    const r = stageNotices([this.task], this.data, this.seen);
    this.seen = r.seen;
    return r.notices;
  }
  /** 지금 화면: 단계, 내 차례, 말풍선, 입력창 알림, 멈춤 */
  snap(step: string, now = this.clock) {
    const v = this.view;
    const turns = myTurns([this.task], this.data, T0 + now * 60_000).map((t) => `${t.word}${t.alert ? '!' : '?'}${t.quick ? `(${t.quick})` : ''}`);
    const speech = [...speechFor([this.task], this.data).entries()].map(([who, s]) => `${who}:${s.text}`);
    const notices = this.stageNotices().map((n) => n.stage);
    const st = stalls([this.task], this.data, T0 + now * 60_000).map((s) => s.word);
    const row = `${step.padEnd(28)} | ${STAGE_LABEL[v.stage].padEnd(10)} | 내차례 ${turns.join(',') || '-'} | 말풍선 ${speech.join(',') || '-'} | 입력창알림 ${notices.join(',') || '-'} | 멈춤 ${st.join(',') || '-'}`;
    this.rows.push(row);
    return { v, turns, speech, notices, stalls: st };
  }
  spec(revision: number, intent: TaskSpec['intent'] = 'change_request', extra: Partial<TaskSpec> = {}) {
    this.data = { ...this.data, specs: [...this.data.specs, {
      id: this.id('spec'), taskId: this.task.id, revision, intent, planner: 'gemini_draft', userOriginalText: '원문',
      finalPrompt: intent === 'ambiguous' ? '' : '로그인 화면 개선', changeScope: '', preserveConstraints: '', testCriteria: '',
      answer: intent === 'ambiguous' ? '1. 어느 화면인가요?' : '', createdAt: this.tick(1), ...extra,
    }] };
  }
  approve(gate: Gate, revision: number, workItemId = '', decision: Approval['decision'] = 'approved') {
    const check = canApprove(this.view, gate, workItemId);
    if (!check.ok && decision === 'approved') throw new Error(`${gate} 승인 거절: ${check.reason}`);
    this.data = { ...this.data, approvals: [...this.data.approvals, {
      id: this.id('ap'), taskId: this.task.id, gate, decision, approvedRevision: revision, previousRevision: null,
      workItemId, scope: {}, actor: 'owner', createdAt: this.tick(1),
    }] };
  }
  dispatchPm() {
    this.task = { ...this.task, dispatch: { state: 'dispatched', at: this.tick(1) } };
  }
  /** PM 세션이 submit-plan으로 보낸 JSON을 앱 규칙(parsePmPlan)으로 받아 계획·배정을 만든다 */
  receivePlan(planRevision: number, specRevision: number, items: { id: string; who: AgentKind }[], mode: 'direct' | 'prototype_first' = 'direct') {
    const pref = { codex: 'codex_primary', claude: 'claude_support', gemini: 'gemini_optional' } as const;
    const json = JSON.stringify({
      task_id: this.task.id, repository: 'minho-nim/MinLab-AI-Office', target_base_revision: 'abc1234', plan_revision: planRevision,
      status: 'planned', questions: [], development_mode: mode, mode_reason: '시험',
      work_items: items.map((it) => ({
        id: it.id, title: `${it.id} 작업`, goal: '목표', dependencies: [], assignee_preference: pref[it.who],
        execution_mode: it.who === 'codex' ? 'codex_cloud' : 'manual_handoff', acceptance_tests: ['npm test'], preserve_constraints: [],
        attachment_refs: [], requires_execution_approval: true,
      })),
    });
    const parsed = parsePmPlan(`\`\`\`json\n${json}\n\`\`\``, this.task.id);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    const now = this.tick(1);
    const plan: PmPlan = { id: this.id('plan'), taskId: this.task.id, planRevision, approvedSpecRevision: specRevision, targetBaseRevision: 'abc1234', source: 'routine_session_auto', plan: parsed.plan, createdAt: now };
    const assigns: AgentAssignment[] = items.map((it) => ({
      id: `${this.task.id}-${planRevision}-${it.id}`, taskId: this.task.id, planRevision, workItemId: it.id, title: `${it.id} 작업`, assignee: it.who,
      executionMode: it.who === 'codex' ? 'codex_cloud' : 'manual_handoff', dispatchStatus: 'awaiting_user_execution_approval', statusSource: 'none',
      providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '', startedAt: null, lastVerifiedAt: null, updatedAt: now,
    }));
    this.data = { ...this.data, plans: [...this.data.plans, plan], assignments: [...this.data.assignments, ...assigns] };
  }
  setAssignment(workItemId: string, planRevision: number, dispatchStatus: AgentAssignment['dispatchStatus']) {
    const now = this.tick(1);
    this.data = { ...this.data, assignments: this.data.assignments.map((a) =>
      a.taskId === this.task.id && a.workItemId === workItemId && a.planRevision === planRevision
        ? { ...a, dispatchStatus, startedAt: dispatchStatus === 'started' ? now : a.startedAt, updatedAt: now } : a) };
  }
  addPrototype(planRevision: number) {
    this.data = { ...this.data, attachments: [...this.data.attachments, { id: this.id('att'), taskId: this.task.id, kind: 'prototype', planRevision } as never] };
  }
  result(revision: number, planRevision: number, workItemId: string, source: ResultPackage['source'] = 'claude_session_auto') {
    this.data = { ...this.data, results: [...this.data.results, {
      id: this.id('res'), taskId: this.task.id, revision, planRevision, workItemId, source, summary: `${workItemId} 결과`, diff: `diff ${workItemId}`,
      testLog: 'ok', remainingIssues: '', sha256: 'x'.repeat(64), createdAt: this.tick(1),
    }] };
  }
  revise(specRevision: number, resultRevision: number) {
    this.data = { ...this.data, revisionRequests: [...this.data.revisionRequests, { id: this.id('rr'), taskId: this.task.id, specRevision, resultRevision, feedback: '버튼 색 바꿔 줘', createdAt: this.tick(1) }] };
  }
  prCheck(ciState: PrCheck['ciState'], merged = false) {
    this.task = { ...this.task, prUrl: 'https://github.com/minho-nim/MinLab-AI-Office/pull/1' } as Task;
    this.data = { ...this.data, prChecks: [...this.data.prChecks, {
      id: this.id('pr'), taskId: this.task.id, prUrl: 'https://github.com/minho-nim/MinLab-AI-Office/pull/1', prState: 'open', merged, headSha: 'h1', ciState, checks: [], checkedAt: this.tick(1),
    }] };
  }
  print(title: string) {
    if (LOG) console.log(`\n### ${title}\n${this.rows.join('\n')}`);
  }
}

describe('시뮬레이션 1: Claude 혼자 하는 업무(끝까지)', () => {
  it('요청 → 기획 승인 → 계획 → 실행 승인 → 결과 → 올리기 → CI → 배포 → 완료', () => {
    const s = new Sim('t1', '로그인 화면 개선');
    expect(s.snap('접수').v.stage).toBe('received');
    s.spec(1);
    let r = s.snap('Gemini 기획서 v1');
    expect(r.v.stage).toBe('development_approval_pending');
    expect(r.turns).toEqual(['기획?(A)']);
    expect(r.notices).toEqual(['development_approval_pending']); // v0.5.26: 주요 단계는 대화에도 알림(A 버튼과 함께)
    s.approve('A', 1);
    expect(s.snap('기획 승인').v.stage).toBe('pm_queued');
    s.dispatchPm();
    expect(s.snap('PM 자동 시작').v.stage).toBe('dispatching');
    expect(s.snap('PM 31분 무소식', s.clock + 31).stalls).toEqual(['계획']);
    s.receivePlan(1, 1, [{ id: 'W1', who: 'claude' }]);
    r = s.snap('PM 계획 도착');
    expect(r.v.stage).toBe('agent_handoff_pending');
    expect(r.turns).toEqual(['계획?']);
    s.approve('E', 1, 'W1');
    s.setAssignment('W1', 1, 'started');
    r = s.snap('실행 승인 → Claude 시작');
    expect(r.v.stage).toBe('executing');
    expect(r.turns).toEqual([]);
    expect(s.snap('Claude 3시간+ 무소식', s.clock + 181).stalls).toEqual(['개발']);
    s.result(1, 1, 'W1');
    s.setAssignment('W1', 1, 'completed');
    r = s.snap('Claude 결과 도착');
    expect(r.v.stage).toBe('github_approval_pending');
    expect(r.turns).toEqual(['결과?(B)']);
    s.approve('B', 1);
    r = s.snap('올리기 승인');
    expect(r.v.stage).toBe('deployment_approval_pending');
    expect(r.turns).toEqual([]); // CI 확인 전에는 배포 차례가 아니다
    expect(s.snap('PR 61분 없음', s.clock + 61).stalls).toEqual(['올리기']);
    s.prCheck('success');
    r = s.snap('PR·CI 통과');
    expect(r.turns).toEqual(['배포?']);
    s.approve('C', 1);
    expect(s.snap('배포 승인').v.stage).toBe('completed');
    s.print('시뮬레이션 1');
  });
});

describe('시뮬레이션 2: Codex + Claude가 나눠 하는 업무', () => {
  it('[고침①] Claude 결과가 먼저 와도 Codex가 끝날 때까지 개발 중이고 올리기 승인은 막힌다', () => {
    const s = new Sim('t2', '기록 화면 + 버튼');
    s.spec(1);
    s.approve('A', 1);
    s.dispatchPm();
    s.receivePlan(1, 1, [{ id: 'W1', who: 'codex' }, { id: 'W2', who: 'claude' }]);
    s.approve('E', 1, 'W1');
    s.approve('E', 1, 'W2');
    s.setAssignment('W1', 1, 'started');
    s.setAssignment('W2', 1, 'started');
    expect(s.snap('둘 다 시작').v.stage).toBe('executing');
    s.result(1, 1, 'W2');
    s.setAssignment('W2', 1, 'completed');
    let r = s.snap('Claude(W2) 결과만 도착');
    expect(r.v.stage).toBe('executing');
    expect(r.turns).toEqual([]);
    expect(r.speech).toContain('codex:개발[…]');
    const b = canApprove(r.v, 'B');
    expect(b.ok).toBe(false);
    expect(b.ok ? '' : b.reason).toContain('W1(codex)');
    s.result(2, 1, 'W1', 'codex_cloud_manual');
    s.setAssignment('W1', 1, 'completed');
    r = s.snap('Codex(W1) 결과 도착');
    expect(r.v.stage).toBe('github_approval_pending');
    expect(r.turns).toEqual(['결과?(B)']);
    // 남은 한계: 결과 패키지는 작업마다 따로라 올리기 승인은 마지막 결과(W1)만 대상이다 → 합치기 단계에서 하나로 묶는다.
    expect(s.data.results.length).toBe(2);
    s.print('시뮬레이션 2');
  });
});

describe('시뮬레이션 3: 되돌아가는 길', () => {
  it('기획 수정 요청 → 새 기획서 → 옛 계획은 쓰이지 않는다', () => {
    const s = new Sim('t3', '설정 화면');
    s.spec(1);
    s.approve('A', 1);
    s.dispatchPm();
    s.spec(2); // 사용자가 기획서를 다시 받음(A 다시 필요)
    expect(s.snap('기획서 v2').v.stage).toBe('development_approval_pending');
    s.receivePlan(1, 1, [{ id: 'W1', who: 'claude' }]); // v1 기준 계획이 늦게 도착
    const r = s.snap('옛 계획 늦게 도착');
    expect(r.v.planCurrent).toBe(false);
    expect(canApprove(r.v, 'E', 'W1').ok).toBe(false);
    s.print('시뮬레이션 3');
  });

  it('결과 검토에서 수정 요청 → PM 재계획 → 새 계획은 실행 승인을 다시 받는다', () => {
    const s = new Sim('t4', '목록 정렬');
    s.spec(1);
    s.approve('A', 1);
    s.dispatchPm();
    s.receivePlan(1, 1, [{ id: 'W1', who: 'claude' }]);
    s.approve('E', 1, 'W1');
    s.setAssignment('W1', 1, 'started');
    s.result(1, 1, 'W1');
    s.revise(1, 1);
    let r = s.snap('결과에 수정 요청');
    expect(r.v.stage).toBe('pm_queued');
    expect(canApprove(r.v, 'B').ok).toBe(false);
    s.dispatchPm();
    s.receivePlan(2, 1, [{ id: 'W1', who: 'claude' }]);
    r = s.snap('새 계획 v2');
    expect(r.v.stage).toBe('agent_handoff_pending');
    expect(canApprove(r.v, 'E', 'W1').ok).toBe(true);
    s.print('시뮬레이션 3-2');
  });

  it('견본 먼저: 견본 승인 전에는 Codex 실행 승인이 막힌다', () => {
    const s = new Sim('t5', '새 앱 첫 화면');
    s.spec(1);
    s.approve('A', 1);
    s.dispatchPm();
    s.receivePlan(1, 1, [{ id: 'W0', who: 'gemini' }, { id: 'W1', who: 'codex' }], 'prototype_first');
    expect(canApprove(s.view, 'E', 'W1').ok).toBe(false);
    expect(canApprove(s.view, 'P', '').ok).toBe(false); // 견본이 없으면 P도 안 됨
    s.addPrototype(1);
    expect(s.snap('Gemini 견본 도착').turns).toContain('견본?');
    s.approve('P', 1);
    expect(canApprove(s.view, 'E', 'W1').ok).toBe(true);
    s.print('시뮬레이션 3-3');
  });

  it('의도가 불분명하면 확인 질문을 입력창에 알리고 내 차례에 질문?', () => {
    const s = new Sim('t6', '그거 고쳐줘');
    s.spec(1, 'ambiguous');
    const r = s.snap('Gemini 확인 질문');
    expect(r.v.stage).toBe('needs_clarification');
    expect(r.turns).toEqual(['질문?']);
    expect(r.notices).toEqual(['needs_clarification']);
    s.print('시뮬레이션 3-4');
  });
});

describe('시뮬레이션 4: 배포 범위', () => {
  it('[고침②] main에 다른 변경이 더 있으면 확인을 받고, main 시험이 끝난 뒤에만 배포한다', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'ahead', extraCommits: 1, mainCi: 'success' }).action).toBe('confirm');
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'ahead', extraCommits: 1, mainCi: 'success', allowExtra: true }).action).toBe('update');
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'pending' }).action).toBe('wait');
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'failure' }).action).toBe('refuse');
    expect(decideDeploy({ releaseToMain: 'diverged', mergeToMain: 'identical' }).action).toBe('refuse');
  });

  it('[고침⑥] 배포 승인 뒤 배포가 확인 필요·실패로 남으면 끝난 업무라도 내 차례에 배포!', () => {
    const s = new Sim('t7', '배포 확인');
    s.spec(1);
    s.approve('A', 1);
    s.dispatchPm();
    s.receivePlan(1, 1, [{ id: 'W1', who: 'claude' }]);
    s.approve('E', 1, 'W1');
    s.setAssignment('W1', 1, 'started');
    s.result(1, 1, 'W1');
    s.setAssignment('W1', 1, 'completed');
    s.approve('B', 1);
    s.prCheck('success');
    s.approve('C', 1);
    s.task = { ...s.task, status: 'done' };
    s.data = { ...s.data, deployments: [{ id: 'd1', taskId: 't7', repo: 'minho-nim/MinLab-AI-Office', fromSha: 'a', toSha: 'b', ok: false, error: '확인 필요: 이 업무 말고 main에 들어간 변경 2개가 같이 배포됩니다.', createdAt: s.tick(1) }] };
    expect(s.snap('같이 나갈 변경 있음').turns).toEqual(['배포!']);
    s.data = { ...s.data, deployments: [...s.data.deployments, { id: 'd2', taskId: 't7', repo: 'minho-nim/MinLab-AI-Office', fromSha: 'a', toSha: 'c', ok: true, error: '', createdAt: s.tick(1) }] };
    expect(s.snap('확인하고 배포됨').turns).toEqual([]);
    s.print('시뮬레이션 4-2');
  });
});

describe('시뮬레이션 5: 손이 안 가면 멈추는 곳', () => {
  it('[고침③] PM에 못 보낸 채(저장소 없음 등) 멈추면 내 차례·말풍선에 계획?', () => {
    const s = new Sim('t8', '저장소 없는 프로젝트');
    s.spec(1);
    s.approve('A', 1);
    const r = s.snap('기획 승인, PM 전송 안 됨');
    expect(r.v.stage).toBe('pm_queued');
    expect(r.turns).toEqual(['계획?']);
    expect(r.speech).toEqual(['claude:계획[?]']);
    s.print('시뮬레이션 5');
  });
});
