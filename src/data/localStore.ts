import type { Snapshot } from '../domain/types';
import { canApprove, deriveWorkflow } from '../domain/workflow';
import { EMPTY_WORKFLOW } from '../domain/workflow-types';
import { sampleSnapshot } from './sample';
import type { OfficeStore } from './store';

const KEY = 'minlab-ai-office:v1';

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

export function createLocalStore(): OfficeStore {
  let state: Snapshot = read() ?? sampleSnapshot();
  const commit = (next: Snapshot) => {
    state = next;
    write(state);
  };
  // 업무를 지우면 딸린 기록도 지운다(DB의 on delete cascade와 같다).
  const dropOrphans = (alive: Set<string>) => {
    const w = state.workflow;
    const keep = <T extends { taskId: string }>(list: T[]) => list.filter((x) => alive.has(x.taskId));
    commit({ ...state, workflow: { specs: keep(w.specs), approvals: keep(w.approvals), plans: keep(w.plans), assignments: keep(w.assignments), results: keep(w.results) } });
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
      const locked = { ...next, taskId: prev.taskId, planRevision: prev.planRevision, workItemId: prev.workItemId, assignee: prev.assignee, executionMode: prev.executionMode };
      commit({ ...state, workflow: { ...state.workflow, assignments: state.workflow.assignments.map((a) => (a.id === prev.id ? locked : a)) } });
    },
    async addResult(result) {
      const max = Math.max(0, ...state.workflow.results.filter((x) => x.taskId === result.taskId).map((x) => x.revision));
      if (result.revision !== max + 1) throw new Error(`result revision must be ${max + 1}`);
      commit({ ...state, workflow: { ...state.workflow, results: [...state.workflow.results, result] } });
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
