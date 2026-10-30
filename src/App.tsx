import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentRoster } from './components/AgentPanel';
import { Inbox } from './components/Inbox';
import { Login } from './components/Login';
import { ProjectPanel } from './components/ProjectPanel';
import { TaskCard } from './components/TaskCard';
import { TaskForm, type TaskDraft } from './components/TaskForm';
import type { PendingImage } from './components/Attachments';
import { WorkflowPanel, type WorkflowActions } from './components/WorkflowPanel';
import { createLocalStore, resetLocalDemo } from './data/localStore';
import { newId, type OfficeStore } from './data/store';
import { AGENT_BY_ID, AGENTS } from './domain/agents';
import { attachmentsOf, moved, sha256OfBytes, type AttachmentKind } from './domain/attachments';
import { buildHandoff } from './domain/handoff';
import { routeTask } from './domain/router';
import { canTransition } from './domain/status';
import type { AgentId, Project, Snapshot, Task, TaskStatus } from './domain/types';
import { STATUS_LABEL } from './domain/types';
import { kstDay, runsToday } from './domain/usage';
import { PREF_AGENT, parsePmPlan } from './domain/pmPlan';
import { deriveWorkflow, officeStatus, sha256Hex } from './domain/workflow';
import type { AgentAssignment, Approval, PmPlan } from './domain/workflow-types';
import { EMPTY_WORKFLOW, STAGE_LABEL } from './domain/workflow-types';
import { dispatchClaude } from './lib/dispatch';
import { getSupabase } from './lib/supabase';
import { OfficeView } from './office/OfficeView';
import { version } from '../package.json';

type Tab = 'tasks' | 'projects' | 'agent';
type Filter = 'open' | 'all' | TaskStatus;

const EMPTY: Snapshot = { projects: [], tasks: [], usage: [], workflow: EMPTY_WORKFLOW };
const POLL_MS = 15_000;

/** DB·저장소 규칙 위반 메시지를 사용자 말로 바꾼다. */
function explainDbError(message: string): string {
  const rules: [string, string][] = [
    ['approvals_once', '이미 승인한 항목입니다. 중복으로 기록하지 않았습니다.'],
    ['A must approve the latest spec', '최신 기획서만 A 승인할 수 있습니다.'],
    ['question/ambiguous', '단순 질문이나 의도 불분명 기획서는 개발 승인 대상이 아닙니다.'],
    ['A approval required', '최신 기획서의 A 승인이 먼저 필요합니다.'],
    ['plan is stale', '기획서가 바뀌어 이 계획으로는 실행 승인할 수 없습니다. PM 계획을 다시 받으세요.'],
    ['E must', '최신 계획에 있는 작업만 실행 승인할 수 있습니다.'],
    ['E approval required', 'E 실행 승인 전에는 시작을 기록할 수 없습니다.'],
    ['B must approve the latest', '최신 결과 패키지만 B 승인할 수 있습니다.'],
    ['C requires B', '같은 결과의 B 승인이 먼저 필요합니다.'],
    ['revision must be', '다른 기기에서 먼저 새 버전이 저장됐습니다. 새로고침 후 다시 시도하세요.'],
    ['only the server', '서버가 확인한 상태는 화면에서 기록할 수 없습니다.'],
    ['revision request needs', 'A 승인된 최신 기획서가 있어야 수정 요청할 수 있습니다.'],
    ['revision request must target', '최신 결과에만 수정 요청할 수 있습니다.'],
    ['already approved for GitHub', '이미 GitHub 업로드를 승인한 결과는 수정 요청할 수 없습니다.'],
    ['새 결과를 받은 뒤', 'PM에 수정을 요청한 상태입니다. 새 결과를 받은 뒤 승인하세요.'],
    ['locked after A approval', 'A 승인 뒤에는 요청 자료를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.'],
    ['append-only', '결과 스크린샷은 검토 기록이라 고치거나 지울 수 없습니다.'],
    ['result attachment must target', '최신 결과 패키지에만 스크린샷을 붙일 수 있습니다.'],
    ['too many attachments', '이미지 장수 상한(요청 10장, 결과 6장)을 넘었습니다.'],
    ['quota exceeded', '첨부 저장 공간 상한(900MB)을 넘었습니다. 오래된 업무를 정리하세요.'],
    ['invalid storage path', '파일 저장 위치가 올바르지 않습니다. 다시 로그인한 뒤 시도하세요.'],
    ['mime type', 'PNG·JPG·WEBP·GIF 이미지만 올릴 수 있습니다.'],
    ['concurrent execution limit', '이미 시작된 개발 작업이 있습니다. 동시에 하나만 진행합니다. 그 작업의 결과를 등록하거나 "중단 기록"을 누른 뒤 시작하세요.'],
    ['exceeded the maximum allowed size', '파일이 5MB를 넘습니다.'],
    ['links are locked after A approval', 'A 승인 뒤에는 요청 자료(링크)를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.'],
    ['clarification must target', '다른 기기에서 기획서가 새로 저장됐습니다. 새로고침 후 다시 기록하세요.'],
    ['too many clarifications', '확인 질문은 업무당 30건까지 기록합니다.'],
  ];
  const hit = rules.find(([needle]) => message.includes(needle));
  return hit ? hit[1] : `저장하지 못했습니다: ${message}`;
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<OfficeStore | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>('tasks');
  const [filter, setFilter] = useState<Filter>('open');
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const handoffRef = useRef<HTMLTextAreaElement>(null);

  const say = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
    // 오류는 이유를 읽을 수 있게 직접 닫을 때까지 남긴다.
    if (kind === 'ok') window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  }, []);

  // 시작: Supabase 설정이 없으면 로컬 데모 모드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = await getSupabase();
      if (cancelled) return;
      if (!sb) {
        const local = createLocalStore();
        setStore(local);
        setSnap(await local.load());
        setBooting(false);
        return;
      }
      setClient(sb);
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      sb.auth.onAuthStateChange((_e, s) => setSession(s));
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인하면 Supabase 저장소로 전환
  useEffect(() => {
    if (!client || !session) return;
    let alive = true;
    void import('./data/supabaseStore').then(({ createSupabaseStore }) => {
      if (alive) setStore(createSupabaseStore(client));
    });
    return () => {
      alive = false;
    };
  }, [client, session]);

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      setSnap(await store.load());
    } catch (e) {
      say('error', `불러오기 실패: ${(e as Error).message}`);
    }
  }, [store, say]);

  useEffect(() => {
    if (!store) return;
    void reload();
    if (store.mode !== 'supabase') return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [store, reload]);

  useEffect(() => {
    if (handoff) handoffRef.current?.select();
  }, [handoff]);

  const projectById = useMemo(() => new Map(snap.projects.map((p) => [p.id, p])), [snap.projects]);

  const visibleTasks = useMemo(() => {
    const list = snap.tasks.filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'open') return t.status !== 'done';
      return t.status === filter;
    });
    return list;
  }, [snap.tasks, filter]);

  if (booting) return <main className="boot">오피스를 여는 중…</main>;
  if (client && !session) return <Login client={client} />;
  if (!store) return <main className="boot">업무를 불러오는 중…</main>;

  const mutate = async (fn: () => Promise<void>, ok?: string): Promise<boolean> => {
    try {
      await fn();
      setSnap(await store.load());
      if (ok) say('ok', ok);
      return true;
    } catch (e) {
      say('error', `저장하지 못했습니다: ${(e as Error).message}`);
      return false;
    }
  };

  /** 이미지를 순서대로 올린다. 실패한 파일은 이유를 모아 돌려주고 나머지는 계속 올린다. */
  const uploadImages = async (
    taskId: string,
    kind: AttachmentKind,
    resultRevision: number | null,
    images: Pick<PendingImage, 'file' | 'role' | 'note'>[],
    startPosition: number,
  ): Promise<string[]> => {
    const errors: string[] = [];
    for (const [i, img] of images.entries()) {
      try {
        await store.addAttachment(
          {
            id: newId(),
            taskId,
            kind,
            resultRevision,
            position: startPosition + i,
            role: img.role,
            note: img.note.trim(),
            fileName: img.file.name,
            mime: img.file.type,
            sizeBytes: img.file.size,
            sha256: await sha256OfBytes(await img.file.arrayBuffer()),
            createdAt: new Date().toISOString(),
          },
          img.file,
        );
      } catch (e) {
        errors.push(`${img.file.name}: ${explainDbError((e as Error).message)}`);
      }
    }
    return errors;
  };

  const reportUploads = (errors: string[], count: number) => {
    if (errors.length) say('error', `이미지 ${errors.length}장을 올리지 못했습니다. ${errors[0]}`);
    else if (count) say('ok', `이미지 ${count}장을 ${store.mode === 'local' ? '이 브라우저에' : '비공개 저장소에'} 저장했습니다.`);
  };

  const addTask = async (d: TaskDraft, images: PendingImage[] = []): Promise<Task | null> => {
    const route = routeTask(d, snap.usage);
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      projectId: d.projectId,
      title: d.title,
      description: d.description,
      type: route.type,
      requestedType: d.requestedType,
      priority: d.priority,
      assignee: route.assignee,
      routeReason: route.reason,
      status: 'queued',
      stage: 'received',
      userOriginalText: d.originalText?.trim() || [d.title, d.description.trim()].filter(Boolean).join('\n\n'),
      dispatch: { state: 'none' },
      createdAt: now,
      updatedAt: now,
    };
    if (!(await mutate(() => store.saveTask(task), `${AGENT_BY_ID[route.assignee].name}에게 배정했습니다.`))) return null;
    if (images.length) {
      const errors = await uploadImages(task.id, 'request', null, images, 0);
      setSnap(await store.load());
      reportUploads(errors, images.length);
    }
    return task;
  };

  const setStatus = (task: Task, to: TaskStatus) => {
    if (!canTransition(task, to)) return;
    const agent = AGENT_BY_ID[task.assignee];
    void mutate(async () => {
      const next = { ...task, status: to, updatedAt: new Date().toISOString() };
      // DB의 단계 값도 함께 맞춘다(예: 기획서 없는 업무를 완료 → completed).
      await store.saveTask({ ...next, stage: deriveWorkflow(next, snap.workflow).stage });
      // 수동 인계 에이전트는 사람이 실제로 맡긴 시점(진행 시작)을 실행 1회로 기록한다.
      if (to === 'in_progress' && agent.mode === 'manual') {
        await store.addManualRun({
          id: newId(),
          agent: agent.id,
          taskId: task.id,
          kind: 'manual',
          day: kstDay(),
          createdAt: new Date().toISOString(),
        });
      }
    }, `${task.title}: ${STATUS_LABEL[to]}`);
  };

  const assignTask = (task: Task, to: AgentId) => {
    const from = AGENT_BY_ID[task.assignee].name;
    const name = AGENT_BY_ID[to].name;
    // 여러 번 바꿔도 처음 배정 근거는 하나만 남긴다.
    const first = task.routeReason.replace(/^사용자가 담당을 바꿈: .*? \(처음 배정: (.*)\)$/, '$1');
    void mutate(
      () =>
        store.saveTask({
          ...task,
          assignee: to,
          routeReason: `사용자가 담당을 바꿈: ${from} → ${name} (처음 배정: ${first})`,
          updatedAt: new Date().toISOString(),
        }),
      `${task.title}: 담당을 ${name}(으)로 바꿨습니다.`,
    );
  };

  const copyHandoff = async (task: Task) => {
    const text = buildHandoff(task, projectById.get(task.projectId));
    try {
      await navigator.clipboard.writeText(text);
      setHandoff(null);
      return true;
    } catch {
      setHandoff(text);
      return false;
    }
  };

  const dispatchBlocker = (task: Task): string | null => {
    if (store.mode === 'local' || !client) return '로컬 데모에서는 실행할 수 없습니다. Supabase와 Edge Function을 연결해야 합니다.';
    const project = projectById.get(task.projectId);
    if (!project?.repo) return '프로젝트에 GitHub 저장소(owner/repo)를 먼저 입력하세요.';
    if (runsToday(snap.usage, 'claude') >= (AGENT_BY_ID.claude.dailyCap ?? 0)) return `오늘 Claude Cloud 실행 ${AGENT_BY_ID.claude.dailyCap}회를 모두 썼습니다.`;
    if (!deriveWorkflow(task, snap.workflow).aApproved) return '최신 기획서의 A 승인이 먼저 필요합니다.';
    return null;
  };

  // DB 기록으로 단계를 다시 계산해 업무에 반영한다(캐릭터 위치도 이 값을 따른다).
  const syncStage = async (taskId: string) => {
    const now = await store.load();
    const t = now.tasks.find((x) => x.id === taskId);
    if (t) {
      const stage = deriveWorkflow(t, now.workflow).stage;
      const status = officeStatus(stage, t.status);
      if (t.stage !== stage || t.status !== status) {
        try {
          await store.saveTask({ ...t, stage, status, updatedAt: new Date().toISOString() });
        } catch {
          // 전송 중에는 상태를 바꿀 수 없다(DB 규칙). 다음 새로고침 때 다시 맞춘다.
        }
      }
    }
    setSnap(await store.load());
  };

  const step = async (taskId: string, fn: () => Promise<void>, ok?: string): Promise<boolean> => {
    try {
      await fn();
      await syncStage(taskId);
      if (ok) say('ok', ok);
      return true;
    } catch (e) {
      say('error', explainDbError((e as Error).message));
      return false;
    }
  };

  const nextRevision = (list: { taskId: string }[], taskId: string, key: (x: never) => number) =>
    Math.max(0, ...list.filter((x) => x.taskId === taskId).map((x) => key(x as never))) + 1;

  const workflowActions: WorkflowActions = {
    // step은 성공 여부(boolean)를 돌려주지만 패널은 완료만 기다린다.
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        setHandoff(null);
        return true;
      } catch {
        setHandoff(text);
        return false;
      }
    },
    saveSpec: (task, f) =>
      step(
        task.id,
        () =>
          store.addSpec({
            id: newId(),
            taskId: task.id,
            revision: nextRevision(snap.workflow.specs, task.id, (x: { revision: number }) => x.revision),
            intent: f.intent,
            planner: 'chatgpt_manual',
            userOriginalText: task.userOriginalText ?? [task.title, task.description].filter(Boolean).join('\n\n'),
            finalPrompt: f.finalPrompt,
            changeScope: f.changeScope,
            preserveConstraints: f.preserveConstraints,
            testCriteria: f.testCriteria,
            answer: f.answer,
            createdAt: new Date().toISOString(),
          }),
        '기획서 새 버전을 저장했습니다.',
      ),
    decide: (task, gate, revision, decision, workItemId = '', scope = {}) =>
      step(
        task.id,
        async () => {
          const previous = snap.workflow.approvals
            .filter((a) => a.taskId === task.id && a.gate === gate && a.decision === 'approved')
            .reduce<number | null>((m, a) => (m === null || a.approvedRevision > m ? a.approvedRevision : m), null);
          const approval: Approval = {
            id: newId(),
            taskId: task.id,
            gate,
            decision,
            approvedRevision: revision,
            previousRevision: previous,
            workItemId,
            scope,
            actor: session?.user.email ?? '로컬 데모',
            createdAt: new Date().toISOString(),
          };
          await store.addApproval(approval);
          if (gate === 'E' && decision === 'approved') {
            const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.planRevision === revision && x.workItemId === workItemId);
            if (a) await store.updateAssignment({ ...a, dispatchStatus: 'ready' });
          }
        },
        decision === 'approved' ? `${gate} 승인을 기록했습니다.` : '수정 요청을 기록했습니다. ChatGPT용 자료를 다시 복사해 재기획하세요.',
      ),
    dispatchPm: (task, ack) => dispatch(task, ack),
    importPlan: async (task, text) => {
      const view = deriveWorkflow(task, snap.workflow);
      const parsed = parsePmPlan(text, task.id);
      if (!parsed.ok) return parsed.errors;
      if (!view.spec || !view.aApproved) return ['최신 기획서의 A 승인이 먼저 필요합니다.'];
      const planRevision = nextRevision(snap.workflow.plans, task.id, (x: { planRevision: number }) => x.planRevision);
      const plan: PmPlan = {
        id: newId(),
        taskId: task.id,
        planRevision,
        approvedSpecRevision: view.spec.revision,
        targetBaseRevision: parsed.plan.target_base_revision,
        source: task.dispatch.sessionUrl ? 'routine_session_manual_import' : 'manual',
        plan: { ...parsed.plan, plan_revision: planRevision },
        createdAt: new Date().toISOString(),
      };
      const assignments: AgentAssignment[] = parsed.plan.work_items.map((w) => ({
        id: newId(),
        taskId: task.id,
        planRevision,
        workItemId: w.id,
        title: w.title,
        assignee: PREF_AGENT[w.assignee_preference],
        // 자동 실행 경로가 검증되기 전까지는 계획이 codex_cloud라고 해도 수동 인계로 둔다.
        executionMode: 'manual_handoff',
        dispatchStatus: 'awaiting_user_execution_approval',
        statusSource: 'none',
        providerExecutionId: null,
        providerTaskUrl: null,
        actualProviderStatus: 'unknown',
        startedAt: null,
        lastVerifiedAt: null,
        updatedAt: new Date().toISOString(),
      }));
      const saved = await step(task.id, () => store.addPlan(plan, assignments), `PM 계획 v${planRevision}을 저장했습니다.`);
      return saved ? null : ['저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.'];
    },
    recordStart: (a, url) =>
      step(
        a.taskId,
        async () => {
          await store.updateAssignment({
            ...a,
            dispatchStatus: 'started',
            statusSource: 'user_reported',
            providerTaskUrl: url.trim() || null,
            actualProviderStatus: 'user_reported_started',
            startedAt: new Date().toISOString(),
          });
          if (AGENT_BY_ID[a.assignee === 'gemini' ? 'studioA' : a.assignee].mode === 'manual') {
            await store.addManualRun({ id: newId(), agent: a.assignee === 'gemini' ? 'studioA' : a.assignee, taskId: a.taskId, kind: 'manual', day: kstDay(), createdAt: new Date().toISOString() });
          }
        },
        '직접 시작했다고 기록했습니다.',
      ),
    stopAssignment: (a) =>
      step(
        a.taskId,
        () => store.updateAssignment({ ...a, dispatchStatus: 'failed', actualProviderStatus: 'user_stopped' }),
        `${a.workItemId} 작업을 중단으로 기록했습니다. 다른 작업을 시작할 수 있습니다.`,
      ),
    addResult: async (task, f, images = []) => {
      const revision = nextRevision(snap.workflow.results, task.id, (x: { revision: number }) => x.revision);
      const ok = await step(
        task.id,
        async () => {
          const assignment = snap.workflow.assignments.find((a) => a.taskId === task.id && a.workItemId === f.workItemId);
          const view = deriveWorkflow(task, snap.workflow);
          await store.addResult({
            id: newId(),
            taskId: task.id,
            revision,
            planRevision: view.plan?.planRevision ?? null,
            workItemId: f.workItemId,
            source: assignment?.assignee === 'codex' ? 'codex_cloud_manual' : assignment?.assignee === 'claude' ? 'claude_manual' : 'manual',
            summary: f.summary,
            diff: f.diff,
            testLog: f.testLog,
            remainingIssues: f.remainingIssues,
            sha256: await sha256Hex(`${f.diff}\n---\n${f.testLog}`),
            createdAt: new Date().toISOString(),
          });
        },
        '결과 패키지를 저장했습니다. GitHub에는 아직 올라가지 않았습니다.',
      );
      // 결과를 받은 작업은 끝난 것으로 기록한다(동시 실행 1개 제한이 풀린다).
      // 작업을 고르지 않고 '전체'로 등록하면 이 업무의 시작된 작업을 모두 끝낸다.
      const done = snap.workflow.assignments.filter(
        (a) => a.taskId === task.id && (f.workItemId === '' || a.workItemId === f.workItemId) && (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting'),
      );
      if (ok && done.length) {
        try {
          for (const a of done) await store.updateAssignment({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'user_reported_result' });
          setSnap(await store.load());
        } catch {
          // 완료 기록 실패는 결과 저장과 별개다. 작업 카드에서 다시 시도할 수 있다.
        }
      }
      if (ok && images.length) {
        const errors = await uploadImages(task.id, 'result', revision, images, 0);
        setSnap(await store.load());
        reportUploads(errors, images.length);
      }
      return ok;
    },
    readLink: async (task, url) => {
      try {
        const link = await store.readLink(task.id, url.trim());
        setSnap(await store.load());
        const okText = link.status === 'ok' ? '링크를 읽었습니다.' : link.status === 'partial' ? `링크를 일부만 읽었습니다. ${link.error}` : link.status === 'blocked' ? `링크를 차단했습니다: ${link.error}` : `링크를 읽지 못했습니다: ${link.error}`;
        say(link.status === 'ok' || link.status === 'partial' ? 'ok' : 'error', okText);
        return true;
      } catch (e) {
        say('error', explainDbError((e as Error).message));
        return false;
      }
    },
    deleteLink: (l) => step(l.taskId, () => store.deleteLink(l), '링크를 지웠습니다.'),
    addClarification: (task, question, answer) =>
      step(
        task.id,
        () =>
          store.addClarification({
            id: newId(),
            taskId: task.id,
            specRevision: Math.max(0, ...snap.workflow.specs.filter((x) => x.taskId === task.id).map((x) => x.revision)),
            question: question.trim(),
            answer: answer.trim(),
            createdAt: new Date().toISOString(),
          }),
        '확인 질문·답변을 기록했습니다. ChatGPT용 자료에 함께 들어갑니다.',
      ),
    attachmentUrl: (a) => store.attachmentUrl(a),
    analyzeImage:
      store.mode === 'supabase'
        ? async (a) => {
            try {
              await store.analyzeImage(a.id);
              setSnap(await store.load());
              say('ok', `${a.fileName}을(를) 분석했습니다. 진행 단계 1번에서 "Gemini 분석 보기"를 여세요.`);
              return true;
            } catch (e) {
              say('error', `이미지를 분석하지 못했습니다: ${(e as Error).message}`);
              return false;
            }
          }
        : undefined,
    addAttachments: async (task, kind, resultRevision, files) => {
      const existing = attachmentsOf(snap.workflow.attachments, task.id, kind, resultRevision);
      const errors = await uploadImages(
        task.id,
        kind,
        resultRevision,
        files.map((file, i) => ({ file, note: '', role: kind === 'result' ? 'after' : existing.length + i === 0 ? 'current' : 'target' })),
        existing.length ? Math.max(...existing.map((a) => a.position)) + 1 : 0,
      );
      setSnap(await store.load());
      reportUploads(errors, files.length);
      return errors;
    },
    updateAttachment: (a) => step(a.taskId, () => store.updateAttachment(a)),
    deleteAttachment: (a) => step(a.taskId, () => store.deleteAttachment(a), `${a.fileName}을(를) 지웠습니다.`),
    moveAttachment: (task, id, delta) =>
      step(task.id, async () => {
        const list = attachmentsOf(snap.workflow.attachments, task.id, 'request');
        const next = moved(list, id, delta);
        for (const a of next) {
          if (list.find((x) => x.id === a.id)?.position !== a.position) await store.updateAttachment(a);
        }
      }),
    setPrUrl: (task, url) => step(task.id, () => store.saveTask({ ...task, prUrl: url.trim() }), 'PR 주소를 기록했습니다.'),
    requestRevision: (task, feedback) =>
      step(
        task.id,
        async () => {
          const view = deriveWorkflow(task, snap.workflow);
          if (!view.spec || !view.result) throw new Error('revision request must target the latest result package');
          await store.addRevisionRequest({
            id: newId(),
            taskId: task.id,
            specRevision: view.spec.revision,
            resultRevision: view.result.revision,
            feedback,
            createdAt: new Date().toISOString(),
          });
        },
        '수정 요청을 기록했습니다. 진행 단계 3번에서 Claude PM에 다시 보내세요.',
      ),
  };

  const dispatch = async (task: Task, ack: boolean) => {
    if (!client) return;
    const res = await dispatchClaude(client, task.id, ack);
    await reload();
    if (res.ok) say('ok', 'Claude Cloud 세션을 시작했습니다. 세션 링크에서 진행 상황을 확인하세요.');
    else say('error', `실행하지 못했습니다: ${res.error ?? '알 수 없는 오류'}`);
  };

  const saveProject = async ({ id, ...fields }: { id?: string; name: string; repo: string | null; description: string }): Promise<Project | null> => {
    const existing = id ? projectById.get(id) : undefined;
    // 수정해도 id가 같으므로 연결된 업무는 그대로 따라온다.
    const project: Project = existing
      ? { ...existing, ...fields, sample: false }
      : { id: newId(), ...fields, createdAt: new Date().toISOString() };
    return (await mutate(() => store.saveProject(project), `${fields.name} 프로젝트를 ${existing ? '수정' : '등록'}했습니다.`)) ? project : null;
  };

  const createRepo = async (project: Project, name: string): Promise<string | null> => {
    try {
      const r = await store.createRepo(project.id, name);
      setSnap(await store.load());
      say(r.warning ? 'error' : 'ok', r.warning ?? `${r.repo} 비공개 저장소를 만들고 ${project.name}에 연결했습니다.`);
      return r.repo;
    } catch (e) {
      say('error', `저장소를 만들지 못했습니다: ${(e as Error).message}`);
      return null;
    }
  };

  const selectAgent = (id: AgentId) => {
    setSelected((cur) => (cur === id && tab === 'agent' ? null : id));
    setTab('agent');
  };

  const openCount = snap.tasks.filter((t) => t.status !== 'done').length;
  const counts = (s: TaskStatus) => snap.tasks.filter((t) => t.status === s).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">
            MINLAB AI OFFICE <span className="ver">v{version}</span>
          </h1>
          {store.mode === 'local' ? (
            <span className="mode mode-local" title="데이터는 이 브라우저의 localStorage에만 저장됩니다">
              로컬 데모 · 이 기기에만 저장
            </span>
          ) : (
            <span className="mode mode-cloud">
              Supabase 동기화 · {session?.user.email}
              <button type="button" className="link-btn" onClick={() => void client?.auth.signOut()}>
                로그아웃
              </button>
            </span>
          )}
        </div>
        <ul className="usage" aria-label="오늘 등록된 실행 횟수">
          {AGENTS.filter((a) => a.dailyCap !== null).map((a) => {
            const used = runsToday(snap.usage, a.id);
            const cap = a.dailyCap ?? 0;
            return (
              <li key={a.id} className={used >= cap ? 'is-full' : ''}>
                <span>{a.name}</span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
                </span>
                <span className="num">
                  {used}/{cap}
                </span>
              </li>
            );
          })}
          {store.mode === 'supabase' && (
            <li title="입력창 일반 질문을 Gemini 무료 API에 보낸 횟수(오늘, 성공만). 하루 상한은 서버가 관리합니다.">
              <span>Gemini</span>
              <span className="num">{(snap.aiCalls ?? []).filter((c) => c.ok && kstDay(new Date(c.createdAt)) === kstDay()).length}회</span>
            </li>
          )}
        </ul>
      </header>

      <main className="layout">
        <section className="stage" aria-label="오피스">
          <OfficeView tasks={snap.tasks} assignments={snap.workflow.assignments} selected={selected} onSelect={selectAgent} />
          <p className="stage-note">
            캐릭터 위치와 말풍선은 업무 상태만 따릅니다. 진행 중이면 책상, 다른 방 일이면 도우러 가고, 열린 업무가 없으면 휴게실로 갑니다. 캐릭터를 누르면 상세가 열립니다.
          </p>
        </section>

        <aside className="panel">
          <nav className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}>
              업무 <span className="num">{openCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'projects'} onClick={() => setTab('projects')}>
              프로젝트 <span className="num">{snap.projects.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'agent'}
              onClick={() => {
                setSelected((s) => s ?? 'mina');
                setTab('agent');
              }}
            >
              에이전트
            </button>
          </nav>

          {notice && (
            <p className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              {notice.kind === 'error' && (
                <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="알림 닫기">
                  닫기
                </button>
              )}
            </p>
          )}

          {handoff && (
            <div className="handoff">
              <label className="field">
                <span>지시서 (선택된 상태입니다. Ctrl+C로 복사)</span>
                <textarea id="handoff-text" ref={handoffRef} readOnly value={handoff} rows={8} />
              </label>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setHandoff(null)}>
                닫기
              </button>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="stack">
              <Inbox
                snap={snap}
                canAskGemini={store.mode === 'supabase'}
                onCreateTask={(d, images) => addTask(d, images)}
                onCreateProject={(name) => saveProject({ name, repo: null, description: '입력창에서 만든 프로젝트' })}
                onAskGemini={async (q, history, images) => {
                  try {
                    return (await store.askGemini(q, history, images)).answer;
                  } finally {
                    setSnap(await store.load());
                  }
                }}
                onCopy={workflowActions.copy}
                onCreateRepo={store.mode === 'supabase' ? createRepo : undefined}
              />
              <details className="direct-entry">
                <summary className="small">직접 입력(이미지·유형·우선순위 지정)</summary>
                <TaskForm projects={snap.projects} usage={snap.usage} onSubmit={addTask} />
              </details>
              <div className="filters" role="group" aria-label="업무 필터">
                {(
                  [
                    ['open', `열린 업무 ${openCount}`],
                    ['all', `전체 ${snap.tasks.length}`],
                    ...(['queued', 'in_progress', 'review', 'blocked', 'done'] as TaskStatus[]).map(
                      (s) => [s, `${STATUS_LABEL[s]} ${counts(s)}`] as [Filter, string],
                    ),
                  ] as [Filter, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {visibleTasks.length === 0 ? (
                <p className="empty">이 조건의 업무가 없습니다.</p>
              ) : (
                visibleTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    project={projectById.get(t.projectId)}
                    stageLabel={STAGE_LABEL[deriveWorkflow(t, snap.workflow).stage]}
                    workflow={
                      <WorkflowPanel
                        task={t}
                        project={projectById.get(t.projectId)}
                        view={deriveWorkflow(t, snap.workflow)}
                        attachments={snap.workflow.attachments.filter((a) => a.taskId === t.id)}
                        analyses={snap.workflow.imageAnalyses.filter((a) => a.taskId === t.id)}
                        links={snap.workflow.links}
                        clarifications={snap.workflow.clarifications}
                        canReadLinks={store.mode === 'supabase'}
                        dispatchBlocker={dispatchBlocker(t)}
                        actions={workflowActions}
                      />
                    }
                    onStatus={setStatus}
                    onAssign={assignTask}
                    onDelete={(task) => void mutate(() => store.deleteTask(task.id), '업무를 삭제했습니다.')}
                    onCopy={copyHandoff}
                  />
                ))
              )}
            </div>
          )}

          {tab === 'projects' && (
            <ProjectPanel
              projects={snap.projects}
              tasks={snap.tasks}
              onSave={saveProject}
              onDelete={(p) => void mutate(() => store.deleteProject(p.id), `${p.name} 프로젝트를 삭제했습니다.`)}
              onCreateRepo={store.mode === 'supabase' ? createRepo : undefined}
            />
          )}

          {tab === 'agent' && (
            <AgentRoster
              snap={snap}
              selected={selected}
              onSelect={(id) => setSelected(id)}
              serverMode={store.mode === 'supabase'}
              onOpenTask={() => {
                setFilter('all');
                setTab('tasks');
              }}
            />
          )}

          {store.mode === 'local' && (
            <footer className="panel-foot">
              <button
                type="button"
                className="link-btn small"
                onClick={() => {
                  resetLocalDemo();
                  window.location.reload();
                }}
              >
                예시 데이터로 초기화
              </button>
            </footer>
          )}
        </aside>
      </main>
    </div>
  );
}
