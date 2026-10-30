/** v0.2.1 확정 업무 플로우의 데이터. DB 테이블과 1:1로 맞춘다(supabase/migrations/0003, 0004). */
import type { Attachment, ImageAnalysis } from './attachments';
import type { Clarification, LinkRef } from './requestContext';

export type Stage =
  | 'received' | 'media_analysis' | 'planner_handoff' | 'planning' | 'needs_clarification' | 'spec_ready'
  | 'development_approval_pending' | 'pm_queued' | 'dispatching' | 'agent_handoff_pending' | 'executing'
  | 'validation' | 'result_review' | 'github_approval_pending' | 'github_uploading' | 'pr_review'
  | 'deployment_approval_pending' | 'deploying' | 'completed' | 'paused' | 'rate_limited'
  | 'integration_blocked' | 'failed' | 'cancelled';

export type Intent = 'question' | 'change_request' | 'asset_request' | 'ambiguous';

/** A = 개발 방향 승인, E = AI 실행 승인, B = GitHub 업로드 승인, C = 운영 배포 승인 */
export type Gate = 'A' | 'E' | 'B' | 'C';

export interface TaskSpec {
  id: string;
  taskId: string;
  revision: number;
  intent: Intent;
  planner: 'chatgpt_manual';
  userOriginalText: string;
  finalPrompt: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  /** 단순 질문일 때 GPT 답변 */
  answer: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  taskId: string;
  gate: Gate;
  decision: 'approved' | 'rejected';
  approvedRevision: number;
  previousRevision: number | null;
  workItemId: string;
  scope: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export type AssigneePreference = 'codex_primary' | 'claude_support' | 'gemini_optional' | 'grok_optional';
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
}

export interface PlanBody {
  task_id: string;
  repository: string;
  target_base_revision: string;
  plan_revision: number;
  status: 'planned' | 'needs_clarification';
  questions: string[];
  work_items: WorkItem[];
}

export interface PmPlan {
  id: string;
  taskId: string;
  planRevision: number;
  approvedSpecRevision: number;
  targetBaseRevision: string;
  source: 'routine_session_manual_import' | 'manual';
  plan: PlanBody;
  createdAt: string;
}

export type AgentKind = 'codex' | 'claude' | 'gemini' | 'grok';
export type DispatchStatus =
  | 'proposed' | 'awaiting_user_execution_approval' | 'ready' | 'starting' | 'started'
  | 'blocked_integration' | 'blocked_quota' | 'failed' | 'completed';

export interface AgentAssignment {
  id: string;
  taskId: string;
  planRevision: number;
  workItemId: string;
  title: string;
  assignee: AgentKind;
  executionMode: ExecutionMode;
  dispatchStatus: DispatchStatus;
  /** none: 아직 없음 / server_verified: 서버가 공급자에게 확인 / user_reported: 사용자가 직접 기록 */
  statusSource: 'none' | 'server_verified' | 'user_reported';
  providerExecutionId: string | null;
  providerTaskUrl: string | null;
  actualProviderStatus: string;
  startedAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
}

export interface ResultPackage {
  id: string;
  taskId: string;
  revision: number;
  planRevision: number | null;
  workItemId: string;
  source: 'codex_cloud_manual' | 'claude_manual' | 'manual';
  summary: string;
  diff: string;
  testLog: string;
  remainingIssues: string;
  sha256: string;
  createdAt: string;
}

/** 결과 검토에서 Claude PM에 보내는 수정 요청 */
export interface RevisionRequest {
  id: string;
  taskId: string;
  specRevision: number;
  resultRevision: number;
  feedback: string;
  createdAt: string;
}

/** 서버가 GitHub에서 읽은 PR·CI 확인 기록(0010_pr_checks.sql) */
export interface PrCheck {
  id: string;
  taskId: string;
  prUrl: string;
  prState: 'open' | 'closed';
  merged: boolean;
  headSha: string;
  ciState: 'success' | 'failure' | 'pending' | 'none';
  checks: { name: string; status: string; conclusion: string | null }[];
  checkedAt: string;
}

/** 서버가 C 승인 뒤 release를 main으로 앞당긴 기록(0011_inbox_deployments.sql). 성공 = release 갱신이지 Cloudflare 빌드 완료가 아니다. */
export interface Deployment {
  id: string;
  taskId: string;
  repo: string;
  fromSha: string;
  toSha: string;
  ok: boolean;
  error: string;
  createdAt: string;
}

export interface WorkflowData {
  specs: TaskSpec[];
  approvals: Approval[];
  plans: PmPlan[];
  assignments: AgentAssignment[];
  results: ResultPackage[];
  revisionRequests: RevisionRequest[];
  /** 요청 자료·결과 스크린샷(파일은 비공개 저장소에) */
  attachments: Attachment[];
  /** 요청 자료 이미지의 Gemini 분석 */
  imageAnalyses: ImageAnalysis[];
  /** 서버가 읽은 링크 결과 */
  links: LinkRef[];
  /** PR·CI 확인 기록 */
  prChecks: PrCheck[];
  /** 운영 배포(release 갱신) 기록 */
  deployments: Deployment[];
  /** GPT 확인 질문·답변 */
  clarifications: Clarification[];
}

export const EMPTY_WORKFLOW: WorkflowData = { specs: [], approvals: [], plans: [], assignments: [], results: [], revisionRequests: [], attachments: [], imageAnalyses: [], links: [], prChecks: [], deployments: [], clarifications: [] };

export const STAGE_LABEL: Record<Stage, string> = {
  received: '접수',
  media_analysis: '이미지 분석',
  planner_handoff: 'GPT 인계',
  planning: '기획 중',
  needs_clarification: '확인 필요',
  spec_ready: '기획서 준비',
  development_approval_pending: 'A 승인 대기',
  pm_queued: 'PM 전달 대기',
  dispatching: 'PM 세션 시작',
  agent_handoff_pending: '실행 승인 대기',
  executing: '개발 중',
  validation: '검증 중',
  result_review: '결과 검토',
  github_approval_pending: 'B 승인 대기',
  github_uploading: 'GitHub 업로드',
  pr_review: 'PR 검토',
  deployment_approval_pending: 'C 승인 대기',
  deploying: '배포 중',
  completed: '완료',
  paused: '보류',
  rate_limited: '한도 대기',
  integration_blocked: '연동 차단',
  failed: '실패',
  cancelled: '취소',
};

export const GATE_LABEL: Record<Gate, string> = {
  A: 'A 개발 방향 승인',
  E: 'E AI 실행 승인',
  B: 'B GitHub 업로드 승인',
  C: 'C 운영 배포 승인',
};

export const INTENT_LABEL: Record<Intent, string> = {
  question: '단순 질문',
  change_request: '개발·수정 요청',
  asset_request: '이미지·에셋 요청',
  ambiguous: '의도 불분명',
};

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  proposed: '배정 제안',
  awaiting_user_execution_approval: '실행 승인 대기',
  ready: '시작 준비(수동 인계)',
  starting: '시작 중',
  started: '시작됨',
  blocked_integration: '연동 차단',
  blocked_quota: '한도 대기',
  failed: '실패',
  completed: '완료',
};
