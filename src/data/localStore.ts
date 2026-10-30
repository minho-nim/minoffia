import { startBlocker } from '../domain/concurrency';
import { attachmentBlocker, attachmentsOf, MAX_TOTAL_BYTES, totalBytes } from '../domain/attachments';
import { linkBlocker, MAX_CLARIFICATIONS } from '../domain/requestContext';
import type { Snapshot } from '../domain/types';
import { canApprove, canRequestRevision, deriveWorkflow } from '../domain/workflow';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';
import { sampleSnapshot } from './sample';
import type { ChatEntry } from '../domain/devlog';
import { newId, type OfficeStore } from './store';

/** 첨부 묶음 버전: 결과 스크린샷은 결과 버전, 견본은 계획 버전 */
const revOf = (a: { kind: string; resultRevision: number | null; planRevision?: number | null }) => (a.kind === 'prototype' ? a.planRevision ?? null : a.resultRevision);

/** 로컬 데모의 대화 기록(이 브라우저에만, 최근 2000줄) */
const CHAT_KEY = 'minlab-ai-office:chat-archive:v1';
const CHAT_KEEP = 2000;

function readChat(): ChatEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]') as ChatEntry[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const KEY = 'minlab-ai-office:v1';
/** 로컬 데모의 이미지 파일(sha256 → data URL). 업무 기록과 따로 둔다. */
const FILES_KEY = 'minlab-ai-office:files:v1';

function read(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    // v0.1에 저장된 데모 데이터에는 workflow가 없다.
    return { ...s, workflow: { ...EMPTY_WORKFLOW, ...(s.workflow ?? {}) } };
  } catch {
    return null;
  }
}

function write(s: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장소가 막힌 환경(비공개 창 등)에서는 이번 화면에서만 유지된다.
  }
}

function readFiles(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

const toDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    r.readAsDataURL(file);
  });

export function createLocalStore(): OfficeStore {
  let state: Snapshot = read() ?? sampleSnapshot();
  let files = readFiles();
  const saveFiles = () => {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(files));
    } catch {
      // 브라우저 저장 공간이 모자라면 이번 화면에서만 보인다.
    }
  };
  // 아무 기록도 가리키지 않는 파일은 지운다.
  const dropUnusedFiles = () => {
    const used = new Set(state.workflow.attachments.map((a) => a.storagePath));
    files = Object.fromEntries(Object.entries(files).filter(([k]) => used.has(`local:${k}`)));
    saveFiles();
  };
  const commit = (next: Snapshot) => {
    state = next;
    write(state);
  };
  // 업무를 지우면 딸린 기록도 지운다(DB의 on delete cascade와 같다).
  const dropOrphans = (alive: Set<string>) => {
    const w = state.workflow;
    const keep = <T extends { taskId: string }>(list: T[]) => list.filter((x) => alive.has(x.taskId));
    commit({
      ...state,
      workflow: { specs: keep(w.specs), approvals: keep(w.approvals), plans: keep(w.plans), assignments: keep(w.assignments), results: keep(w.results), revisionRequests: keep(w.revisionRequests), attachments: keep(w.attachments), imageAnalyses: keep(w.imageAnalyses), links: keep(w.links), prChecks: keep(w.prChecks), deployments: keep(w.deployments), clarifications: keep(w.clarifications) },
    });
    dropUnusedFiles();
  };
  return {
    mode: 'local',
    async load() {
      return state;
    },
    async saveProject(project) {
      const exists = state.projects.some((p) => p.id === project.id);
      commit({
        ...state,
        projects: exists ? state.projects.map((p) => (p.id === project.id ? project : p)) : [...state.projects, project],
      });
    },
    async deleteProject(id) {
      commit({
        ...state,
        projects: state.projects.filter((p) => p.id !== id),
        tasks: state.tasks.filter((t) => t.projectId !== id),
      });
      const alive = new Set(state.tasks.map((t) => t.id));
      dropOrphans(alive);
    },
    async saveTask(task) {
      const exists = state.tasks.some((t) => t.id === task.id);
      commit({
        ...state,
        tasks: exists ? state.tasks.map((t) => (t.id === task.id ? task : t)) : [task, ...state.tasks],
      });
    },
    async deleteTask(id) {
      commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
      dropOrphans(new Set(state.tasks.map((t) => t.id)));
    },
    async addManualRun(run) {
      commit({ ...state, usage: [...state.usage, run] });
    },
    // 데모 모드도 DB 트리거와 같은 규칙으로 거절한다.
    async addSpec(spec) {
      const max = Math.max(0, ...state.workflow.specs.filter((x) => x.taskId === spec.taskId).map((x) => x.revision));
      if (spec.revision !== max + 1) throw new Error(`spec revision must be ${max + 1}`);
      commit({ ...state, workflow: { ...state.workflow, specs: [...state.workflow.specs, spec] } });
    },
    async addApproval(approval) {
      const task = state.tasks.find((t) => t.id === approval.taskId);
      if (!task) throw new Error('task not found');
      if (approval.decision === 'approved') {
        const check = canApprove(deriveWorkflow(task, state.workflow), approval.gate, approval.workItemId);
        if (!check.ok) throw new Error(check.reason);
      }
      commit({ ...state, workflow: { ...state.workflow, approvals: [...state.workflow.approvals, approval] } });
    },
    async addPlan(plan, assignments) {
      const task = state.tasks.find((t) => t.id === plan.taskId);
      if (!task) throw new Error('task not found');
      const view = deriveWorkflow(task, state.workflow);
      if (!view.spec || !view.aApproved || plan.approvedSpecRevision !== view.spec.revision) {
        throw new Error('A approval required before PM plan');
      }
      const max = Math.max(0, ...state.workflow.plans.filter((x) => x.taskId === plan.taskId).map((x) => x.planRevision));
      if (plan.planRevision !== max + 1) throw new Error(`plan revision must be ${max + 1}`);
      commit({
        ...state,
        workflow: {
          ...state.workflow,
          plans: [...state.workflow.plans, plan],
          assignments: [...state.workflow.assignments, ...assignments],
        },
      });
    },
    async updateAssignment(next) {
      const prev = state.workflow.assignments.find((a) => a.id === next.id);
      if (!prev) throw new Error('assignment not found');
      if (next.statusSource === 'server_verified') throw new Error('only the server can record verified provider status');
      const executing = ['starting', 'started', 'completed'].includes(next.dispatchStatus);
      const eOk = state.workflow.approvals.some(
        (a) => a.taskId === prev.taskId && a.gate === 'E' && a.decision === 'approved' && a.approvedRevision === prev.planRevision && a.workItemId === prev.workItemId,
      );
      if (executing && !eOk) throw new Error('E approval required before recording execution');
      // DB와 같은 규칙: AI마다 동시에 1개, 계획의 앞 작업이 끝나야 시작
      const starting = (next.dispatchStatus === 'started' || next.dispatchStatus === 'starting') && prev.dispatchStatus !== 'started' && prev.dispatchStatus !== 'starting';
      if (starting) {
        const plan = state.workflow.plans.find((p) => p.taskId === prev.taskId && p.planRevision === prev.planRevision) ?? null;
        const blocked = startBlocker(prev, state.workflow.assignments, plan, state.agentLimits);
        if (blocked) throw new Error(blocked.includes('앞 작업') ? `dependency not finished: ${blocked}` : `concurrent execution limit: ${blocked}`);
      }
      const locked = { ...next, taskId: prev.taskId, planRevision: prev.planRevision, workItemId: prev.workItemId, assignee: prev.assignee, executionMode: prev.executionMode };
      commit({ ...state, workflow: { ...state.workflow, assignments: state.workflow.assignments.map((a) => (a.id === prev.id ? locked : a)) } });
    },
    async addResult(result) {
      const max = Math.max(0, ...state.workflow.results.filter((x) => x.taskId === result.taskId).map((x) => x.revision));
      if (result.revision !== max + 1) throw new Error(`result revision must be ${max + 1}`);
      commit({ ...state, workflow: { ...state.workflow, results: [...state.workflow.results, result] } });
    },
    async addRevisionRequest(request) {
      const task = state.tasks.find((t) => t.id === request.taskId);
      if (!task) throw new Error('task not found');
      const check = canRequestRevision(deriveWorkflow(task, state.workflow));
      if (!check.ok) throw new Error(check.reason);
      commit({ ...state, workflow: { ...state.workflow, revisionRequests: [...state.workflow.revisionRequests, request] } });
    },
    async addAttachment(att, file) {
      const task = state.tasks.find((t) => t.id === att.taskId);
      if (!task) throw new Error('task not found');
      const view = deriveWorkflow(task, state.workflow);
      const rev = revOf(att);
      const count = attachmentsOf(state.workflow.attachments, att.taskId, att.kind, rev).length;
      const blocked = attachmentBlocker(view, att.kind, 'add', count, rev);
      if (blocked) throw new Error(blocked);
      if (totalBytes(state.workflow.attachments) + att.sizeBytes > MAX_TOTAL_BYTES) throw new Error('attachment storage quota exceeded');
      if (!files[att.sha256]) {
        files[att.sha256] = await toDataUrl(file);
        saveFiles();
      }
      commit({ ...state, workflow: { ...state.workflow, attachments: [...state.workflow.attachments, { ...att, storagePath: `local:${att.sha256}` }] } });
    },
    async updateAttachment(next) {
      const prev = state.workflow.attachments.find((a) => a.id === next.id);
      const task = prev && state.tasks.find((t) => t.id === prev.taskId);
      if (!prev || !task) throw new Error('attachment not found');
      const blocked = attachmentBlocker(deriveWorkflow(task, state.workflow), prev.kind, 'change', 0, revOf(prev));
      if (blocked) throw new Error(blocked);
      const kept = { ...prev, position: next.position, role: next.role, note: next.note };
      commit({ ...state, workflow: { ...state.workflow, attachments: state.workflow.attachments.map((a) => (a.id === prev.id ? kept : a)) } });
    },
    async deleteAttachment(att) {
      const prev = state.workflow.attachments.find((a) => a.id === att.id);
      const task = prev && state.tasks.find((t) => t.id === prev.taskId);
      if (!prev || !task) throw new Error('attachment not found');
      const blocked = attachmentBlocker(deriveWorkflow(task, state.workflow), prev.kind, 'change', 0, revOf(prev));
      if (blocked) throw new Error(blocked);
      commit({ ...state, workflow: { ...state.workflow, attachments: state.workflow.attachments.filter((a) => a.id !== prev.id) } });
      dropUnusedFiles();
    },
    async checkPr() {
      throw new Error('로컬 데모에서는 GitHub PR·CI를 확인할 수 없습니다.');
    },
    async setAgentLimit(assignee, maxRunning) {
      if (!Number.isInteger(maxRunning) || maxRunning < 1 || maxRunning > 5) throw new Error('상한은 1~5입니다.');
      commit({ ...state, agentLimits: { ...(state.agentLimits ?? {}), [assignee]: maxRunning } });
    },
    async analyzeImage() {
      throw new Error('로컬 데모에서는 Gemini 이미지 분석을 쓸 수 없습니다.');
    },
    async deployRelease() {
      throw new Error('로컬 데모에서는 운영 배포를 할 수 없습니다.');
    },
    async appendChat(entries) {
      try {
        const now = new Date().toISOString();
        const list = [...readChat(), ...entries.map((e) => ({ ...e, id: newId(), createdAt: now }))].slice(-CHAT_KEEP);
        localStorage.setItem(CHAT_KEY, JSON.stringify(list));
      } catch {
        // 저장이 막힌 브라우저
      }
    },
    async deleteChat(fromIso, toIso, projectId) {
      const all = readChat();
      const hit = (m: ChatEntry) => m.createdAt >= fromIso && m.createdAt < toIso && (!projectId || m.projectId === projectId);
      try {
        localStorage.setItem(CHAT_KEY, JSON.stringify(all.filter((m) => !hit(m))));
      } catch {
        // 저장이 막힌 브라우저
      }
      return all.filter(hit).length;
    },
    async loadChat(fromIso, toIso) {
      return readChat().filter((m) => m.createdAt >= fromIso && m.createdAt < toIso);
    },
    async loadInbox() {
      return null;
    },
    async saveInbox() {
      // 로컬 데모: 입력창이 이 브라우저(localStorage)에 직접 남긴다.
    },
    async createRepo() {
      throw new Error('로컬 데모에서는 GitHub 저장소를 만들 수 없습니다.');
    },
    async askGemini() {
      throw new Error('로컬 데모에서는 Gemini에 물을 수 없습니다. ChatGPT로 복사해 물어보세요.');
    },
    async readLink() {
      throw new Error('로컬 데모에서는 링크를 읽을 수 없습니다. Supabase에 연결된 사이트에서 쓰세요.');
    },
    async deleteLink(link) {
      const task = state.tasks.find((t) => t.id === link.taskId);
      if (!task) throw new Error('task not found');
      const blocked = linkBlocker(deriveWorkflow(task, state.workflow), 0, 'delete');
      if (blocked) throw new Error(blocked);
      commit({ ...state, workflow: { ...state.workflow, links: state.workflow.links.filter((l) => l.id !== link.id) } });
    },
    async addClarification(item) {
      const latest = Math.max(0, ...state.workflow.specs.filter((x) => x.taskId === item.taskId).map((x) => x.revision));
      if (item.specRevision !== latest) throw new Error('clarification must target the latest spec revision');
      if (state.workflow.clarifications.filter((c) => c.taskId === item.taskId).length >= MAX_CLARIFICATIONS) throw new Error('too many clarifications');
      if (!item.question.trim() || !item.answer.trim()) throw new Error('질문과 답변을 모두 적으세요.');
      commit({ ...state, workflow: { ...state.workflow, clarifications: [...state.workflow.clarifications, item] } });
    },
    async attachmentUrl(att) {
      const url = files[att.sha256];
      if (!url) throw new Error('이 기기에 파일이 없습니다(로컬 데모는 이 브라우저에만 저장됩니다).');
      return url;
    },
  };
}

export function resetLocalDemo(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
