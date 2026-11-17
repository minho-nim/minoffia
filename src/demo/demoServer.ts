// 체험 업무(v0.7.7, 소유자 "데모에서 1회성으로 정해진 작업을 수행해서 흐름을 직접 확인하게, 단 내 클라우드 안 쓰게"):
// 로컬 데모(체험 모드)에서만 돈다. AI·서버가 할 일(기획서 초안 → 계획·실행 → 결과·채점 → PR 검사)을 이 기기 안에서 정해진 내용으로 채우고,
// 소유자 몫(기획 승인 → 올리기 승인 → 배포 승인)은 진짜 버튼을 누르게 둔다. Supabase·GitHub·AI는 부르지 않는다.
// v0.7.12(소유자 "실제로는 돌지 않지만 보여지는 것만 실행된 것처럼"): 실행 기록·Codex 소식·바뀐 파일·결과 스크린샷·PR 검사·배포 완료를
// 운영과 같은 모양으로 채운다(모두 이 기기 안의 정해진 내용, 데모판 띠에 '실제 서버·AI 안 씀'이 늘 보인다).
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
/** 넘겨주기 전 W1 시간: 업무 카드의 기다림 그림을 볼 수 있게 조금 길게(v0.7.58) */
const HANDOFF_MS = 10_000;

const nid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** 결과 패키지 지문(그럴듯한 64자, 체험 고정값) */
const DEMO_SHA = '7c2e9a41f0b38d65e1a4c97b2d0f8e3a56c1b9d47e2f0a83c6d5b1e9f4a27c08';

/** 바뀐 뒤 로그인 화면 그림(체험 결과 스크린샷). 캔버스가 없으면 null */
async function loginShot(): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 300;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff8ec';
  g.fillRect(0, 0, 400, 300);
  g.fillStyle = '#3b2a1e';
  g.font = 'bold 22px sans-serif';
  g.fillText('로그인', 32, 56);
  const box = (y: number, label: string) => {
    g.strokeStyle = '#d9c7a8';
    g.lineWidth = 2;
    g.strokeRect(32, y, 336, 40);
    g.fillStyle = '#9a8670';
    g.font = '15px sans-serif';
    g.fillText(label, 44, y + 26);
  };
  box(84, '이메일');
  box(136, '비밀번호');
  g.fillStyle = '#e07a3a';
  g.fillRect(32, 200, 336, 46);
  g.fillStyle = '#ffffff';
  g.font = 'bold 17px sans-serif';
  g.fillText('로그인', 172, 229);
  return await new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'));
}

/** 체험 시안 그림(로그인 화면 와이어프레임, 400×800) */
function demoSvg(who: 'A' | 'B'): string {
  const t = (x: number, y: number, s: string, size = 16, fill = '#3b2a1e', weight = 'normal') => `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`;
  const box = (y: number, label: string) => `<rect x="32" y="${y}" width="336" height="48" rx="6" fill="#fff" stroke="#c9b89c" stroke-width="2"/>${t(48, y + 30, label, 15, '#9a8670')}`;
  const body =
    who === 'A'
      ? [t(32, 120, '로그인', 28, '#3b2a1e', 'bold'), t(32, 152, '미노피아에 다시 오신 걸 환영해요', 14, '#7a6a58'), box(200, '이메일'), box(264, '비밀번호'), t(32, 340, '오류가 나면 여기에 안내', 13, '#c0392b'), '<rect x="32" y="372" width="336" height="56" rx="8" fill="#e07a3a"/>', t(172, 407, '로그인', 18, '#fff', 'bold'), t(32, 468, '비밀번호 찾기', 13, '#7a6a58'), t(290, 468, '회원가입', 14, '#e07a3a', 'bold')]
      : [t(32, 140, '로그인', 28, '#3b2a1e', 'bold'), box(220, '이메일'), box(284, '비밀번호'), '<rect x="32" y="680" width="336" height="60" rx="10" fill="#e07a3a"/>', t(172, 717, '로그인', 18, '#fff', 'bold')];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"><rect width="400" height="800" fill="#fff8ec"/><rect width="400" height="56" fill="#3b2a1e"/>${t(20, 36, 'minoffia', 18, '#f6d6a8', 'bold')}${body.join('')}</svg>`;
}

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
export function demoNext(task: Task, snap: Snapshot, now = Date.now()): 'spec' | 'plan' | 'handoff' | 'result' | 'pr' | null {
  const v = deriveWorkflow(task, snap.workflow);
  if (!v.spec) return 'spec';
  if (v.aApproved && !v.plan) return 'plan';
  const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'started');
  // v0.7.58 넘겨주기: 기다리던 작업(W2)이 있으면 W1을 끝내고 W2에게 넘긴다(업무 카드의 기다림 그림이 보이게)
  const waiter = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'proposed');
  if (a && waiter && now - Date.parse(a.startedAt ?? a.updatedAt) >= HANDOFF_MS) return 'handoff';
  if (a && waiter) return null;
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
    // Gemini 시안(v0.7.13): A·B가 그린 시안 두 장과 서로 평가(정해진 그림). 하나를 골라 볼 수 있다
    await store.putDemoDrafts?.([
      { id: nid(), taskId: task.id, specRevision: 1, who: 'A', judge: 'Gemini · Studio A', svg: demoSvg('A'), flow: 'flowchart TD\nA[로그인 화면] --> B[이메일·비밀번호 입력]\nB --> C[주황 로그인 버튼]\nC --> D{맞음?}\nD -->|예| E[홈]\nD -->|아니오| F[오류 안내]\nF --> B', note: '로그인 버튼을 앱 주황색으로 가장 눈에 띄게\n다른 버튼(회원가입)은 글자 버튼으로 낮춤\n오류 안내는 입력칸 바로 아래', review: { by: 'B', parts: { request: 38, ease: 22, mobile: 18, simple: 12 }, total: 90, good: ['주황 버튼이 바로 보임'], fix: ['비밀번호 찾기 글자가 작음'] }, createdAt: iso },
      { id: nid(), taskId: task.id, specRevision: 1, who: 'B', judge: 'Gemini · Studio B', svg: demoSvg('B'), flow: 'flowchart TD\nA[로그인 화면] --> B[입력]\nB --> C[주황 로그인 버튼]\nC --> D[홈]', note: '입력칸 두 개와 주황 버튼만 남김\n버튼을 화면 아래 엄지 닿는 곳에\n회원가입은 다음 화면으로 뺌', review: { by: 'A', parts: { request: 34, ease: 23, mobile: 19, simple: 15 }, total: 91, good: ['단계가 가장 짧음'], fix: ['오류 안내 자리가 없음'] }, createdAt: iso },
    ]);
    return '체험: Gemini(Studio A)가 기획서 초안을 쓰고, Gemini A·B가 화면 시안을 하나씩 그려 서로 평가했어요. 업무 탭의 체험 업무에서 시안을 하나 고르고 [기획 승인]을 눌러 보세요.';
  }
  if (step === 'plan') {
    const v = deriveWorkflow(task, snap.workflow);
    const json = JSON.stringify({
      task_id: task.id, repository: 'minho-nim/minoffia', target_base_revision: 'demo000', plan_revision: 1, status: 'planned', questions: [],
      development_mode: 'direct', mode_reason: '바꾸기와 시험을 나눠 두 AI가 이어서(체험)',
      work_items: [
        { id: 'W1', title: '로그인 버튼 색 바꾸기', goal: '로그인 버튼을 주황색으로', dependencies: [], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff', acceptance_tests: ['npm test'], preserve_constraints: ['다른 화면 그대로'], attachment_refs: [], requires_execution_approval: true },
        { id: 'W2', title: '버튼 색 시험 더하기', goal: 'W1이 바꾼 버튼 색을 확인하는 시험', dependencies: ['W1'], assignee_preference: 'claude_support', execution_mode: 'manual_handoff', acceptance_tests: ['npm test'], preserve_constraints: ['화면은 그대로'], attachment_refs: [], requires_execution_approval: true },
      ],
    });
    const parsed = parsePmPlan(json, task.id);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    const plan: PmPlan = { id: nid(), taskId: task.id, planRevision: 1, approvedSpecRevision: v.spec!.revision, targetBaseRevision: 'demo000', source: 'routine_session_auto', plan: parsed.plan, createdAt: iso };
    const a: AgentAssignment = {
      id: nid(), taskId: task.id, planRevision: 1, workItemId: 'W1', title: '로그인 버튼 색 바꾸기', assignee: 'codex', executionMode: 'manual_handoff',
      dispatchStatus: 'awaiting_user_execution_approval', statusSource: 'none', providerExecutionId: null, providerTaskUrl: null, actualProviderStatus: '',
      startedAt: null, lastVerifiedAt: null, updatedAt: iso,
    };
    // W2는 W1이 끝날 때까지 기다린다(시작 전). 업무 카드에 'Codex W1 → ⏳ Claude W2' 그림이 뜬다
    const b: AgentAssignment = { ...a, id: nid(), workItemId: 'W2', title: '버튼 색 시험 더하기', assignee: 'claude', dispatchStatus: 'proposed', actualProviderStatus: 'W1이 끝나면 시작' };
    await store.addPlan(plan, [a, b]);
    for (const w of ['W1', 'W2']) await store.addApproval({ id: nid(), taskId: task.id, gate: 'E', decision: 'approved', approvedRevision: 1, previousRevision: null, workItemId: w, scope: { auto: true, note: '기획 승인에 포함(체험)' }, actor: '체험', createdAt: iso });
    await (store.putDemoAssignment ?? store.updateAssignment)({ ...a, dispatchStatus: 'started', statusSource: 'server_verified', actualProviderStatus: 'linear: 개발 중 — 브랜치를 만들고 시험을 돌리는 중', startedAt: iso, updatedAt: iso });
    await (store.putDemoAssignment ?? store.updateAssignment)(b);
    return '체험: Claude(PM)가 작업 2개로 나눴어요. Codex가 W1(버튼 색)을 하고, 끝나면 Claude가 이어받아 W2(시험)를 해요. 업무 카드에서 기다림 그림을 볼 수 있어요.';
  }
  if (step === 'handoff') {
    const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'started')!;
    const b = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'proposed')!;
    await (store.putDemoAssignment ?? store.updateAssignment)({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'linear: 끝남 — W2에게 넘김', lastVerifiedAt: iso, updatedAt: iso });
    await (store.putDemoAssignment ?? store.updateAssignment)({ ...b, dispatchStatus: 'started', statusSource: 'server_verified', actualProviderStatus: '루틴: W1 결과를 받아 시험을 쓰는 중', startedAt: iso, updatedAt: iso });
    return `체험: Codex가 ${a.workItemId}를 끝내고 Claude에게 넘겼어요. Claude가 ${b.workItemId}(시험)를 시작했어요.`;
  }
  if (step === 'result') {
    const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.dispatchStatus === 'started')!;
    const result: ResultPackage = {
      id: nid(), taskId: task.id, revision: 1, planRevision: a.planRevision, workItemId: a.workItemId, source: 'codex_linear_auto',
      summary: 'W1(Codex) 로그인 버튼 색을 앱 주황색으로 바꾸고, W2(Claude) 버튼 색 시험을 더했어요. 다른 화면은 그대로예요.\n쓴 스킬: ui-check',
      diff: "diff --git a/src/components/Login.tsx b/src/components/Login.tsx\n--- a/src/components/Login.tsx\n+++ b/src/components/Login.tsx\n@@ -52 +52 @@\n-          <button type=\"submit\" className=\"btn\">\n+          <button type=\"submit\" className=\"btn btn-primary\">",
      testLog: 'npm test  → Tests 500 passed (500)\nnpm run build → ✓ built\n휴대폰 400px·데스크톱 1400px: 콘솔 오류·가로 넘침 없음',
      remainingIssues: '', sha256: DEMO_SHA, createdAt: iso,
    };
    await store.addResult(result);
    await (store.putDemoAssignment ?? store.updateAssignment)({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'linear: 끝남 — 결과를 보냄', lastVerifiedAt: iso, updatedAt: iso });
    // 결과 스크린샷(바뀐 뒤 로그인 화면). 그림을 못 만드는 브라우저면 건너뛴다
    try {
      const shot = await loginShot();
      if (shot) {
        const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await shot.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
        await store.addAttachment({ id: nid(), taskId: task.id, kind: 'result', resultRevision: 1, position: 0, role: 'after', note: '바뀐 뒤 로그인 화면(휴대폰 400px)', fileName: 'login-after.png', mime: 'image/png', sizeBytes: shot.size, sha256: sha, createdAt: iso }, new File([shot], 'login-after.png', { type: 'image/png' }));
      }
    } catch {
      // 스크린샷은 덤
    }
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
      // 동료 평가는 만든 AI가 아닌 쪽(마지막 작업 W2를 Claude가 했으면 Codex)
      panelEntry('peer', a.assignee === 'claude' ? 'Codex' : 'Claude', s(37, 23, 9, '브랜치에서 화면을 열어 확인했어요.')),
    ];
    const gates = ruleCheck({ diff: `diff --git a/src/components/Login.tsx b/src/components/Login.tsx\n${result.diff}`, testLog: result.testLog, changeScope: 'src/components/Login.tsx' });
    const out = panelOutcome(gates, panel, 0, { executed: true });
    await store.putDemoReview?.({
      id: nid(), taskId: task.id, resultRevision: 1, workItemId: a.workItemId, assignee: a.assignee, gates, score: out.score, total: out.total, verdict: out.verdict,
      reasons: out.reasons, feedback: '', autoRedo: 0, judge: panelJudge(panel), panel, createdAt: iso,
      // 화면 평가(v0.7.40): 미노가 찍은 결과 화면을 기획서와 견준 점수(체험은 정해진 값)
      screen: { score: 88, problems: [], judge: 'Gemini · Studio A', errors: 0, overflow: false },
    });
    return '체험: Codex 결과가 왔고 AI 셋(Gemini A·B, Claude)이 같은 항목을 다른 관점으로 채점했어요. 업무 카드에서 점수와 평균을 보고 [결과 승인](올리기 승인)을 눌러 보세요.';
  }
  if (step === 'pr') {
    await store.checkPr(task.id);
    return '체험: 미노가 PR을 열고 검사(시험·빌드)를 통과시켰어요. 마지막으로 [배포 승인]을 눌러 보세요.';
  }
  return null;
}
