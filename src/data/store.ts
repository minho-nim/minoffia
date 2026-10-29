import type { Project, Snapshot, Task, UsageRun } from '../domain/types';
import type { AgentAssignment, Approval, PmPlan, ResultPackage, TaskSpec } from '../domain/workflow-types';

export type StoreMode = 'local' | 'supabase';

export interface OfficeStore {
  mode: StoreMode;
  load(): Promise<Snapshot>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  /** 수동 실행 기록. Cloud 실행은 서버만 기록한다. */
  addManualRun(run: UsageRun): Promise<void>;
  /** 아래는 추가만 가능한 감사 기록. 규칙 위반은 오류로 거절된다(Supabase는 DB 트리거가 판단). */
  addSpec(spec: TaskSpec): Promise<void>;
  addApproval(approval: Approval): Promise<void>;
  addPlan(plan: PmPlan, assignments: AgentAssignment[]): Promise<void>;
  updateAssignment(assignment: AgentAssignment): Promise<void>;
  addResult(result: ResultPackage): Promise<void>;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
