// 체험 업무(v0.7.7, 소유자 "데모에서 1회성으로 정해진 작업을 수행해서 흐름을 직접 확인하게, 단 내 클라우드 안 쓰게"):
// 로컬 데모(체험 모드)에서만 돈다. AI·서버가 할 일(기획서 초안 → 계획·실행 → 결과·채점 → PR 검사)을 이 기기 안에서 정해진 내용으로 채우고,
// 소유자 몫(기획 승인 → 올리기 승인 → 배포 승인)은 진짜 버튼을 누르게 둔다. Supabase·GitHub·AI는 부르지 않는다.
import type { OfficeStore } from '../data/store';
import type { Snapshot, Task } from '../domain/types';
import { deriveWorkflow } from '../domain/workflow';
import type { AgentAssignment, PmPlan, ResultPackage, TaskSpec } from '../domain/workflow-types';
import { parsePmPlan } from '../domain/pmPlan';
import { panelEntry, panelJudge, panelOutcome, ruleCheck, type Score } from '../domain/review';

export const DEMO_TAG = '[체험]';
const DEMO_TITLE = `${DEMO_TAG} 로그인 버튼 색 바꾸기`;
const DEMO_TEXT = '로그인 화면의 로그인 버튼 색을 앱 주황색으로 바꿔 줘';
/** AI가 일하는 척 기다리는 시간(ms) */
const WORK_MS = 4000;

const nid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** 체험 업무 만들기(같은 업무가 진행 중이면 그것을 돌려준다) */
export function demoTask(snap: Snapshot): Task | null {
  return snap.tasks.find((t) => t.title.startsWith(DEMO_TAG) && t.status !== 'done' && t.stage !== 'cancelled') ?? null;
}
export function newDemoTask(projectId: string, now = new Date().toISOString()): Task {
  return {
    id: nid(), projectId, title: DEMO_TITLE, description: DEMO_TEXT, type: 'dev', requestedType: 'auto', priority: 'normal', assignee: 'codex',
    routeReason: '체험 업무(정해진 흐름)', status: 'queued', dispatch: { state: 'none', sessionUrl: null, error: null, at: null }, stage: 'received',
    userOriginalText: DEMO_TEXT, createdAt: now, updatedAt: now,
  };
}

/** 다음에 체험 서버가 할 일(없으면 null = 소유자 차례이거나 끝) */
export function demoNext(task: Task, snap: Snapshot, now = Date.now()): 'spec' | 'plan' | 'result' | 'pr' | null {
  const v = deriveWorkflow(task, snap.workflow);
  if (!v.spec) return 'spec';
  if (v.aApproved && !v.plan) return 'plan';
  const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'started');
  if (a && !v.result && now - Date.parse(a.startedAt ?? a.updatedAt) >= WORK_MS) return 'result';
  if (v.bApproved && !snap.workflow.prChecks.some((p) => p.taskId === task.id)) return 'pr';
  return null;
}

/** 한 걸음 진행하고, 대화창에 띄울 안내를 돌려준다 */
export async function advanceDemo(store: OfficeStore, snap: Snapshot, now = new Date()): Promise<string | null> {
  const task = demoTask(snap);
  if (!task) return null;
  const step = demoNext(task, snap, now.getTime());
  const iso = now.toISOString();
  if (step === 'spec') {
    const spec: TaskSpec = {
      id: nid(), taskId: task.id, revision: 1, intent: 'change_request', planner: 'gemini_draft', userOriginalText: DEMO_TEXT,
      finalPrompt: '로그인 화면의 로그인 버튼 색을 앱 주황색(--accent)으로 바꾼다.',
      changeScope: 'src/components/Login.tsx의 로그인 버튼 한 곳',
      preserveConstraints: '다른 화면과 버튼은 그대로 둔다.',
      testCriteria: '(필수) 로그인 버튼이 주황색으로 보인다\n(필수) npm test 통과\n(권장) 휴대폰 400px에서 가로 넘침 없음',
      answer: '', sizeHint: { difficulty: 2, single_task: true, needs_design: false }, createdAt: iso,
    };
    await store.addSpec(spec);
    return '체험: Gemini(Studio A)가 기획서 초안을 썼어요. 업무 탭의 체험 업무에서 기획서를 보고 [기획 승인]을 눌러 보세요.';
  }
  if (step === 'plan') {
    const v = deriveWorkflow(task, snap.workflow);
    const json = JSON.stringify({
      task_id: task.id, repository: 'minho-nim/minoffia', target_base_revision: 'demo000', plan_revision: 1, status: 'planned', questions: [],
      development_mode: 'direct', mode_reason: '작은 일이라 작업 하나(체험)',
      work_items: [{ id: 'W1', title: '로그인 버튼 색 바꾸기', goal: '로그인 버튼을 주황색으로', dependencies: [], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff', acceptance_tests: ['npm test'], preserve_constraints: ['다른 화면 그대로'], attachment_refs: [], requires_execution_approval: true }],
    });
    const parsed = parsePmPlan(json, task.id);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    const plan: PmPlan = { id: nid(), taskId: task.id, planRevision: 1, approvedSpecRevision: v.spec!.revision, targetBaseRevision: 'demo000', source: 'routine_session_auto', plan: parsed.plan, createdAt: iso };
    const a: AgentAssignment = {
      id: nid(), taskId: task.id, planRevision: 1, workItemId: 'W1', title: '로그인 버튼 색 바꾸기', assignee: 'codex', executionMode: 'manual_handoff',
      dispatchStatus: 'awaiting_user_execution_approval', statusSource: 'none', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '',
      startedAt: null, lastVerifiedAt: null, updatedAt: iso,
    };
    await store.addPlan(plan, [a]);
    await store.addApproval({ id: nid(), taskId: task.id, gate: 'E', decision: 'approved', approvedRevision: 1, previousRevision: null, workItemId: 'W1', scope: { auto: true, note: '기획 승인에 포함(체험)' }, actor: '체험', createdAt: iso });
    await store.updateAssignment({ ...a, dispatchStatus: 'started', statusSource: 'user_reported', actualProviderStatus: '체험: 개발 중', startedAt: iso, updatedAt: iso });
    return '체험: Claude(PM)가 작업 1개로 나눴고, 실행 승인은 기획 승인에 포함해 자동으로 기록했어요. Codex가 개발을 시작했어요(몇 초 걸려요).';
  }
  if (step === 'result') {
    const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'started')!;
    const result: ResultPackage = {
      id: nid(), taskId: task.id, revision: 1, planRevision: a.planRevision, workItemId: a.workItemId, source: 'codex_linear_auto',
      summary: '로그인 버튼 색을 앱 주황색으로 바꿨어요. 다른 화면은 그대로예요.\n쓴 스킬: ui-check',
      diff: "--- a/src/components/Login.tsx\n+++ b/src/components/Login.tsx\n@@ -52 +52 @@\n-          <button type=\"submit\" className=\"btn\">\n+          <button type=\"submit\" className=\"btn btn-primary\">",
      testLog: 'npm test  → Tests 500 passed (500)\nnpm run build → ✓ built\n휴대폰 400px·데스크톱 1400px: 콘솔 오류·가로 넘침 없음',
      remainingIssues: '', sha256: 'demo'.padEnd(64, '0'), createdAt: iso,
    };
    await store.addResult(result);
    await store.updateAssignment({ ...a, dispatchStatus: 'completed', actualProviderStatus: '체험: 끝남', updatedAt: iso });
    // 3중 평가(v0.7.8): 정해진 점수로 Gemini A·B·동료(Claude) 채점을 보여 준다. 판정은 진짜 규칙(panelOutcome)으로.
    const s = (acceptance: number, spec: number, quality: number, summary: string, fixes: string[] = []): Score => ({
      parts: { acceptance, spec, constraints: 15, scope: 10, quality },
      criteria: [
        { text: '(필수) 로그인 버튼이 주황색으로 보인다', status: 'met', evidence: 'src/components/Login.tsx:52 btn-primary' },
        { text: '(필수) npm test 통과', status: 'met', evidence: '시험 로그 500 passed' },
        { text: '(권장) 휴대폰 400px에서 가로 넘침 없음', status: 'met', evidence: '시험 로그 화면 확인' },
      ],
      violations: [],
      fixes,
      summary,
    });
    const panel = [
      panelEntry('A', 'Gemini · Studio A', s(38, 24, 9, '요청대로 로그인 버튼만 주황색이 됐어요.')),
      panelEntry('B', 'Gemini · Studio B', s(36, 22, 8, '바뀐 줄이 하나라 깨질 곳이 없어요.', ['버튼 색 시험을 하나 더 두면 좋아요'])),
      panelEntry('peer', 'Claude', s(37, 23, 9, '브랜치에서 화면을 열어 확인했어요.')),
    ];
    const gates = ruleCheck({ diff: `diff --git a/src/components/Login.tsx b/src/components/Login.tsx\n${result.diff}`, testLog: result.testLog, changeScope: 'src/components/Login.tsx' });
    const out = panelOutcome(gates, panel, 0, { executed: true });
    await store.putDemoReview?.({
      id: nid(), taskId: task.id, resultRevision: 1, workItemId: a.workItemId, assignee: 'codex', gates, score: out.score, total: out.total, verdict: out.verdict,
      reasons: out.reasons, feedback: '', autoRedo: 0, judge: panelJudge(panel), panel, createdAt: iso,
    });
    return '체험: Codex 결과가 왔고 AI 셋(Gemini A·B, Claude)이 같은 항목을 다른 관점으로 채점했어요. 업무 카드에서 점수와 평균을 보고 [결과 승인](올리기 승인)을 눌러 보세요.';
  }
  if (step === 'pr') {
    await store.checkPr(task.id);
    return '체험: 미노가 PR을 열고 검사(시험·빌드)를 통과시켰어요. 마지막으로 [배포 승인]을 눌러 보세요.';
  }
  return null;
}
