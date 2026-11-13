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
/** P = 견본 승인(Prototype First 계획에서 Codex 실행 전) */
export type Gate = 'A' | 'E' | 'P' | 'B' | 'C';

export interface TaskSpec {
  id: string;
  taskId: string;
  revision: number;
  intent: Intent;
  /** chatgpt_manual = ChatGPT 기획을 사람이 저장, gemini_draft = Gemini 무료 초안(서버 저장, v0.4.0) */
  planner: 'chatgpt_manual' | 'gemini_draft';
  userOriginalText: string;
  finalPrompt: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  /** 단순 질문일 때 GPT 답변 */
  answer: string;
  /** Gemini 초안이 매긴 크기(v0.5.20, 작은 일 바로 배정에 씀). 없으면 PM이 나눈다 */
  sizeHint?: { difficulty: number; single_task: boolean; needs_design: boolean; bug?: boolean } | null;
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

/** gemini_optional은 견본(AI Studio). Gemini 개발(gemini_dev)은 2026-11-13 뺐다(소유자, 한 번도 안 쓰임) */
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

/** 개발 방식(새 플로우 07단계): 견본 먼저(AI Studio Build → 견본 승인 → Codex) / 바로 개발 */
export type DevelopmentMode = 'prototype_first' | 'direct';

export const DEVELOPMENT_MODE_LABEL: Record<DevelopmentMode, string> = {
  prototype_first: '견본 먼저(Prototype First)',
  direct: '바로 개발(Direct Development)',
};

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

export interface PmPlan {
  id: string;
  taskId: string;
  planRevision: number;
  approvedSpecRevision: number;
  targetBaseRevision: string;
  /** routine_session_auto = PM 세션이 submit-plan으로 보낸 계획(v0.4.2).
   *  rule_small = 작은 일이라 규칙이 바로 배정, gemini_fallback = Claude PM이 안 돼 Gemini가 대신 나눔(v0.5.20) */
  source: 'routine_session_manual_import' | 'routine_session_auto' | 'manual' | 'rule_small' | 'gemini_fallback';
  plan: PlanBody;
  createdAt: string;
}

export type AgentKind = 'codex' | 'claude' | 'gemini';
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
  /** gemini_actions = Gemini 개발 워크플로(GitHub Actions)로 자동 실행(v0.4.82) */
  executionMode: ExecutionMode | 'gemini_actions';
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
  /** claude_session_auto = Claude 보조 개발 세션이 submit-result로 보낸 결과(v0.4.3), gemini_actions_auto = Gemini 개발 워크플로(v0.4.82) */
  /** codex_linear_auto = Codex(Linear)가 결과 제출표로 직접 보낸 결과(v0.6.19) */
  source: 'codex_cloud_manual' | 'claude_manual' | 'claude_session_auto' | 'gemini_actions_auto' | 'codex_linear_auto' | 'manual';
  summary: string;
  diff: string;
  testLog: string;
  remainingIssues: string;
  sha256: string;
  /** 작업 브랜치 미리보기 링크(Claude가 미리보기용으로 push했고 프로젝트에 미리보기 주소가 있을 때, v0.4.57) */
  previewUrl?: string;
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

/** 서버가 배포 승인 뒤 release를 main으로 앞당긴 기록(0011_inbox_deployments.sql). 성공 = release 갱신이지 Cloudflare 빌드 완료가 아니다. */
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
  /** 결과 점수 평가(v0.4.64) */
  reviews?: ResultReview[];
  /** 개발 중 추가 요청(v0.6.13). 표가 없는 DB면 undefined */
  followups?: Followup[];
}

/** 결과 점수 평가 기록(서버 review-result가 결과 버전마다 한 번, v0.4.64) */
export interface ResultReview {
  id: string;
  taskId: string;
  resultRevision: number;
  workItemId: string;
  /** 그 결과를 만든 AI(배정 기준) */
  assignee: string;
  gates: import('./review').Gate[];
  score: import('./review').Score | null;
  total: number | null;
  verdict: import('./review').Verdict;
  reasons: string[];
  /** 다시 개발할 때 PM에 넘길 글 */
  feedback: string;
  /** 이 평가 전까지 자동으로 다시 개발한 횟수 */
  autoRedo: number;
  /** 채점한 쪽(규칙, Gemini · Studio A 등) */
  judge: string;
  /** 소유자가 누른 교차 채점(v0.6.26): 다른 AI 점수·채점한 쪽·못 지킨 기준. 없으면 null */
  crossTotal?: number | null;
  crossJudge?: string | null;
  crossReasons?: string[];
  createdAt: string;
}

export const EMPTY_WORKFLOW: WorkflowData = { specs: [], approvals: [], plans: [], assignments: [], results: [], revisionRequests: [], attachments: [], imageAnalyses: [], links: [], prChecks: [], deployments: [], clarifications: [] };

export const STAGE_LABEL: Record<Stage, string> = {
  received: '접수',
  media_analysis: '이미지 분석',
  planner_handoff: 'GPT 인계',
  planning: '기획 중',
  needs_clarification: '확인 필요',
  spec_ready: '기획서 준비',
  development_approval_pending: '기획 승인 대기',
  pm_queued: 'PM 전달 대기',
  dispatching: 'PM 세션 시작',
  agent_handoff_pending: '실행 승인 대기',
  executing: '개발 중',
  validation: '검증 중',
  result_review: '결과 검토',
  github_approval_pending: '결과 승인 대기',
  github_uploading: 'GitHub 업로드',
  pr_review: 'PR 검토',
  deployment_approval_pending: '배포 승인 대기',
  deploying: '배포 중',
  completed: '완료',
  paused: '보류',
  rate_limited: '한도 대기',
  integration_blocked: '연동 차단',
  failed: '실패',
  cancelled: '취소',
};

export const GATE_LABEL: Record<Gate, string> = {
  A: '기획 승인',
  E: '실행 승인',
  P: '견본 승인',
  B: '결과 승인',
  C: '배포 승인',
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

/** 개발 중 사장님이 더한 요청(v0.6.13): 다음 PM 재계획에 함께 간다. usedAt = 보낸 시각(서버가 적음) */
export interface Followup {
  id: string;
  taskId: string;
  text: string;
  usedAt: string | null;
  createdAt: string;
}
