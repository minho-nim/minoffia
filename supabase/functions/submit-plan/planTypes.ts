// submit-plan 전용 타입 복사본(v0.6.11): src/domain/workflow-types.ts에서 계획에 필요한 것만 그대로 옮겼다(같은지 시험이 확인).
// OFFICE_REPOS는 src/domain/smallTask.ts와 같다.
export const OFFICE_REPOS = ['minho-nim/minlab-ai-office', 'minho-nim/minoffia'];

export type AssigneePreference = 'codex_primary' | 'claude_support' | 'gemini_optional';

export type ExecutionMode = 'codex_cloud' | 'manual_handoff';

export interface WorkItem {
  id: string;
  title: string;
  goal: string;
  dependencies: string[];
  assignee_preference: AssigneePreference;
  execution_mode: ExecutionMode;
  acceptance_tests: string[];
  preserve_constraints: string[];
  attachment_refs: string[];
  requires_execution_approval: boolean;
  /** 난이도 1~10(v0.4.71, 없으면 예전 계획) */
  difficulty?: number;
  /** 난이도 이유 한 줄 */
  difficulty_reason?: string;
  /** 이 작업이 맡는 기획서 요구사항 번호(R1, R2…, v0.5.39). 없으면 예전 계획 */
  covers?: string[];
}

export type DevelopmentMode = 'prototype_first' | 'direct';

export interface PlanBody {
  /** 서버에서 발급한 Gemini 생성 식별자(캐시 응답 중복 저장 방지) */
  generation_id?: string;
  /** 없으면 direct(이전 계획 호환) */
  development_mode?: DevelopmentMode;
  /** PM이 방식을 고른 이유 한 줄 */
  mode_reason?: string;
  task_id: string;
  repository: string;
  target_base_revision: string;
  plan_revision: number;
  status: 'planned' | 'needs_clarification';
  questions: string[];
  work_items: WorkItem[];
}

export type AgentKind = 'codex' | 'claude' | 'gemini';
