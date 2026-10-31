import type { Attachment, ImageAnalysis } from '../domain/attachments';
import type { ChatEntry } from '../domain/devlog';
import type { Clarification, LinkRef } from '../domain/requestContext';
import type { Project, Snapshot, Task, UsageRun } from '../domain/types';
import type { AgentAssignment, Approval, PmPlan, PrCheck, ResultPackage, RevisionRequest, TaskSpec } from '../domain/workflow-types';

export type StoreMode = 'local' | 'supabase';

/** 입력창 대화와 미니엉이 기다리는 선택. 모양은 Inbox가 정한다(저장소는 그대로 보관만). */
export type NewChatEntry = Omit<ChatEntry, 'id' | 'createdAt'>;

export interface InboxState {
  messages: unknown[];
  pending: unknown | null;
  updatedAt: string;
}

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
  /** 결과 검토 → Claude PM 수정 요청 */
  addRevisionRequest(request: RevisionRequest): Promise<void>;
  /**
   * 이미지 첨부. 파일을 비공개 저장소에 올린 뒤 기록을 남긴다. 같은 업무의 같은 파일(sha256)은 한 번만 저장한다.
   * `storagePath`는 저장소가 정한다.
   */
  addAttachment(attachment: Omit<Attachment, 'storagePath'>, file: Blob): Promise<void>;
  /** 요청 자료의 순서·역할·설명만 바꾼다. */
  updateAttachment(attachment: Attachment): Promise<void>;
  deleteAttachment(attachment: Attachment): Promise<void>;
  /** 화면에 보여 줄 주소. Supabase는 1시간 뒤 만료된다. */
  attachmentUrl(attachment: Attachment): Promise<string>;
  /** 요청 자료 이미지를 Gemini로 분석한다(서버, 같은 이미지는 다시 씀). 로컬 데모는 지원하지 않음. */
  analyzeImage(attachmentId: string): Promise<ImageAnalysis>;
  /** 서버가 링크를 한 번 읽고 결과를 기록한다(로컬 데모는 지원하지 않음). */
  readLink(taskId: string, url: string): Promise<LinkRef>;
  deleteLink(link: LinkRef): Promise<void>;
  /** GPT 확인 질문·답변(추가만) */
  addClarification(item: Clarification): Promise<void>;
  /** 입력창 일반 질문을 Gemini 무료 API에 묻는다(서버가 키·하루 상한을 관리). 로컬 데모는 지원하지 않음. */
  /** 업무의 PR 상태와 CI 결과를 서버가 GitHub에서 읽어 기록한다(로컬 데모는 지원하지 않음). */
  checkPr(taskId: string): Promise<PrCheck>;
  /** Claude 보조 개발: E 승인한 Claude 작업을 서버가 두 번째 루틴으로 시작한다(세션 주소). 로컬 데모는 지원하지 않음. */
  startClaudeDev(assignmentId: string, acknowledgeRetry: boolean): Promise<{ sessionUrl: string | null }>;
  /** 올리기 승인(B)된 Claude 결과로 Claude가 PR을 연다(서버, v0.4.5) */
  dispatchClaudePr(taskId: string, acknowledgeRetry: boolean): Promise<{ sessionUrl: string | null; branch: string }>;
  /** C 승인 뒤 서버가 release를 main으로 앞당긴다(운영 배포). 로컬 데모는 지원하지 않음. */
  deployRelease(taskId: string): Promise<{ updated: boolean; to: string }>;
  /**
   * 다른 기기에서 바뀐 기록을 바로 알려 준다(Supabase Realtime, 바뀐 표 이름). 끊을 함수를 돌려준다.
   * 로컬 데모는 없음(이 브라우저에만 저장).
   */
  subscribe?(onChange: (table: string) => void): () => void;
  /** 입력창 대화(계정에 저장해 여러 기기에서 이어 본다. 로컬 데모는 이 브라우저에만) */
  loadInbox(): Promise<InboxState | null>;
  saveInbox(state: InboxState): Promise<void>;
  /** 대화 기록(개발일지 원본)에 추가. 고칠 수는 없다. */
  appendChat(entries: NewChatEntry[]): Promise<void>;
  /** 기간(프로젝트를 주면 그 프로젝트만)의 대화 기록을 지운다. 업무 기록(승인·결과 등)은 지우지 않는다. 지운 수를 돌려준다. */
  deleteChat(fromIso: string, toIso: string, projectId?: string): Promise<number>;
  /** 기간의 대화 기록(시간순) */
  loadChat(fromIso: string, toIso: string): Promise<ChatEntry[]>;
  /** AI별 동시 작업 상한(1~5) */
  setAgentLimit(assignee: 'codex' | 'claude' | 'gemini' | 'grok', maxRunning: number): Promise<void>;
  /** 새 프로젝트의 GitHub 저장소를 서버가 만들고 연결한다(로컬 데모는 지원하지 않음). */
  createRepo(projectId: string, name: string): Promise<{ repo: string; url: string; warning?: string }>;
  /** PM 세션이 보내 온 계획 중 아직 처리하지 않은 것(v0.4.2) */
  loadPlanInbox(): Promise<PlanInboxItem[]>;
  /** 받은 계획을 처리함으로 표시. 이미 다른 기기가 처리했으면 false */
  markPlanInbox(id: string, status: 'imported' | 'invalid', note: string): Promise<boolean>;
  /** Claude 보조 개발 세션이 보내 온 결과 중 아직 처리하지 않은 것(v0.4.3) */
  loadResultInbox(): Promise<ResultInboxItem[]>;
  /** 받은 결과를 처리함으로 표시. 이미 다른 기기가 처리했으면 false */
  markResultInbox(id: string, status: 'imported' | 'invalid', note: string): Promise<boolean>;
  /** Gemini 무료가 견본 지시서로 HTML 견본 한 장을 만든다(서버, 저장은 앱이 견본으로 올림, v0.4.7) */
  draftPrototype(taskId: string, text: string): Promise<{ html: string; planRevision: number }>;
  /** Gemini 무료가 기획 요청 문서로 기획서 초안을 써서 새 버전으로 저장한다(서버). */
  draftSpec(taskId: string, text: string): Promise<{ revision: number; intent: string }>;
  askGemini(
    question: string,
    history: { role: 'user' | 'model'; text: string }[],
    images?: { mime: string; data: string }[],
  ): Promise<{ answer: string; keySlot: number }>;
}

export interface PlanInboxItem {
  id: string;
  taskId: string;
  specRevision: number;
  planText: string;
}

export interface ResultInboxItem {
  id: string;
  taskId: string;
  assignmentId: string;
  summary: string;
  changedFiles: string;
  diff: string;
  testLog: string;
  remainingIssues: string;
  branch: string;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
