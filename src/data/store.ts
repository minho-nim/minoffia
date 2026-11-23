import type { Source } from '../domain/research';
import type { AgentId } from '../domain/types';
import type { AskOptions } from '../domain/aiRoute';
import type { Attachment, ImageAnalysis } from '../domain/attachments';
import type { ChatEntry } from '../domain/devlog';
import type { Clarification, LinkRef } from '../domain/requestContext';
import type { Project, Snapshot, Task, UsageRun } from '../domain/types';
import type { DesignDraft } from '../domain/designDraft';
import type { AgentAssignment, Approval, PmPlan, PrCheck, ResultPackage, RevisionRequest, TaskSpec, ResultReview } from '../domain/workflow-types';

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
  /** 프로젝트 순서 저장(v0.6.42): 아이디 목록 순서대로 */
  reorderProjects?(ids: string[]): Promise<void>;
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
  /** 개발 중 추가 요청(v0.6.13) */
  addFollowup?(taskId: string, text: string): Promise<void>;
  /** 결과 점수 평가(v0.4.64): 규칙 검사 → Gemini 채점 → 판정. 같은 결과 버전은 한 번만(이미 있으면 그것을 돌려줌) */
  /** 'started' = Claude에 채점을 막 맡김, 'waiting' = Claude 채점을 기다리는 중(v0.4.94) */
  reviewResult(taskId: string, resultRevision: number): Promise<ResultReview | 'started' | 'waiting'>;
  /** 체험 모드(로컬)만: 정해진 평가 기록 넣기(v0.7.8, AI를 부르지 않음) */
  putDemoReview?(review: ResultReview): Promise<void>;
  /** Gemini 시안(v0.7.13): 최신 기획서로 A·B가 그리고 서로 평가(서버). 이미 있으면 그대로 */
  drawDesign?(taskId: string): Promise<DesignDraft[]>;
  /** 시안 고르기(추가만, 승인 아님) */
  pickDesign?(taskId: string, specRevision: number, draftId: string): Promise<void>;
  /** 체험 모드(로컬)만: 정해진 시안 넣기 */
  putDemoDrafts?(drafts: DesignDraft[]): Promise<void>;
  /** 체험 모드(로컬)만: 실행 기록을 서버가 확인한 모양으로 바꾸기(v0.7.12, 실제 실행 없음) */
  putDemoAssignment?(assignment: AgentAssignment): Promise<void>;
  /** Claude 웹 조사(v0.7.11): 웹 검색(Tavily·Firecrawl)이 안 될 때 Claude에게 맡긴다. 답은 나중에 snapshot.research로 온다 */
  askClaudeResearch?(question: string): Promise<{ id: string; sessionUrl: string | null; already?: boolean }>;
  /** 3중 평가(v0.7.8): 동료 평가를 기다리지 않고 지금 모인 점수로 판정 */
  finishReview?(taskId: string, resultRevision: number): Promise<ResultReview>;
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
  /** Claude 보조 개발: 실행 승인한 Claude 작업을 서버가 두 번째 루틴으로 시작한다(세션 주소). 로컬 데모는 지원하지 않음. */
  startClaudeDev(assignmentId: string, acknowledgeRetry: boolean): Promise<{ sessionUrl: string | null }>;
  /** Gemini 개발: 서버가 GitHub Actions 워크플로를 시작(v0.4.82). runUrl은 워크플로 실행 목록 */
  /** Codex를 Linear로 맡기기(v0.5.2): 앱이 만든 Codex 지시서로 Linear 이슈를 만들고 Codex에게 맡긴다 */
  startCodexLinear(assignmentId: string, acknowledgeRetry: boolean, text: string): Promise<{ issueUrl: string; identifier: string }>;
  /** Codex 앱에 직접 붙여 넣을 때 지시서 끝에 붙일 결과 제출 절(v0.6.21). 작업을 '시작함'으로 기록한다 */
  codexManualSection?(assignmentId: string): Promise<string>;
  /** Linear 이슈의 Codex 소식 읽기(읽기만). kind 'error' = 시작 못 함(한도·환경 없음) */
  codexLinearStatus(assignmentId: string): Promise<{ kind: 'error' | 'working' | 'none'; last: string; taskUrl: string | null }>;
  /** 올리기 승인(B)된 Claude 결과로 Claude가 PR을 연다(서버, v0.4.5) */
  dispatchClaudePr(taskId: string, acknowledgeRetry: boolean): Promise<{ sessionUrl: string | null; branch: string }>;
  /** 배포 승인 뒤 서버가 release를 main으로 앞당긴다(운영 배포). 로컬 데모는 지원하지 않음. */
  /** wait = main 시험(CI)이 끝나기를 기다리는 중(앱이 다시 부른다). allowExtra = 같이 나갈 다른 변경을 확인함(v0.4.20) */
  deployRelease(taskId: string, allowExtra?: boolean): Promise<{ updated: boolean; to: string; wait?: boolean; message?: string }>;
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
  setAgentLimit(assignee: 'codex' | 'claude' | 'gemini', maxRunning: number): Promise<void>;
  /** AI 휴가(true)·근무(false) 바꾸기(v0.4.39) */
  setLeave(agent: AgentId, onLeave: boolean): Promise<void>;
  /** 프로젝트에서 지켜야 할 것: 소유자가 직접 추가·지우기(v0.4.57). AI가 적는 것은 서버가 넣는다 */
  addProjectRule(projectId: string, rule: string): Promise<void>;
  removeProjectRule(id: string): Promise<void>;
  /** 새 프로젝트의 GitHub 저장소를 서버가 만들고 연결한다(로컬 데모는 지원하지 않음). */
  createRepo(projectId: string, name: string): Promise<{ repo: string; url: string; warning?: string }>;
  /** 이미 있는 AI Office 저장소에 작업 규칙 파일(CLAUDE.md)이 없으면 넣는다(v0.4.60). created=false면 이미 있음 */
  /** 없으면 넣고, 있으면 '지켜야 할 것' 절만 맞춘다(v0.4.75) */
  addRepoRules(projectId: string): Promise<{ repo: string; created: boolean; updated?: boolean }>;
  /** PM 세션이 보내 온 계획 중 아직 처리하지 않은 것(v0.4.2) */
  loadPlanInbox(): Promise<PlanInboxItem[]>;
  /** 받은 계획을 처리함으로 표시. 이미 다른 기기가 처리했으면 false */
  markPlanInbox(id: string, status: 'imported' | 'invalid', note: string): Promise<boolean>;
  /** Claude 보조 개발 세션이 보내 온 결과 중 아직 처리하지 않은 것(v0.4.3) */
  loadResultInbox(): Promise<ResultInboxItem[]>;
  /** 받은 결과를 처리함으로 표시. 이미 다른 기기가 처리했으면 false */
  markResultInbox(id: string, status: 'imported' | 'invalid', note: string): Promise<boolean>;
  /** 서버가 이미 올린 결과 화면을 결과 스크린샷으로 붙인다(파일은 다시 올리지 않음, v0.4.97) */
  linkResultShots(taskId: string, resultRevision: number, shots: ResultInboxItem['screenshots']): Promise<void>;
  /** 휴대폰 알림(웹 푸시, v0.4.12): 공개키 받기·구독 저장·해제·시험 */
  push(action: 'key' | 'subscribe' | 'unsubscribe' | 'test', body?: Record<string, string>): Promise<Record<string, unknown>>;
  /** Linear 연결 확인(읽기만, 아무것도 만들지 않음) */
  linearProbe(): Promise<LinearProbe>;
  /** 서버 비밀 열쇠가 들어 있는지와 GitHub 토큰 만료일(값은 받지 않음, v0.5.38). 로컬 데모는 없음 */
  keyStatus?(): Promise<KeyStatus[]>;
  /** 챗봇 지난 대화(v0.7.99 소유자 "지난 대화는 서버에"). 로컬 데모는 이 기기에 */
  chatThreads?: {
    list(): Promise<ChatThreadInfo[]>;
    get(id: string): Promise<ChatThread | null>;
    save(thread: ChatThread): Promise<void>;
    remove(id: string): Promise<void>;
  };
  /** 옵시디언 세컨드 브레인(v0.8.5): 노트를 노트 보관함에 커밋 한 번으로 올린다. 로컬 데모는 없음 */
  pushNotes?(files: { path: string; content: string }[]): Promise<{ changed: number }>;
  /** 계정 설정 '날씨 지역'(v0.7.71): null이면 현재 위치. 로컬 데모는 없음(이 기기 사본만) */
  weatherPlace?: { get(): Promise<string | null>; set(place: string | null): Promise<void> };
  /** 좌표 → 동네 이름(설정 '날씨 지역' ↻, v0.7.73). 로컬 데모는 없음 */
  areaName?(spot: { lat: number; lon: number }): Promise<string>;
  /** 결과의 바뀐 곳 구조도(Archify) HTML. 아직 없으면 서버가 그리기를 시작한다(v0.5.43). 로컬 데모는 없음 */
  archify?(taskId: string, revision: number): Promise<{ html?: string; started?: boolean }>;
  /** Gemini 무료가 견본 지시서로 HTML 견본 한 장을 만든다(서버, 저장은 앱이 견본으로 올림, v0.4.7) */
  /** v0.4.94: 근무 중인 Studio A·B가 하나씩(최대 두 장) */
  /** 프로젝트 저장소 파일 목록(경로만, v0.5.24 구조도) */
  repoTree(projectId: string): Promise<string[]>;
  /** GitHub Pages 데모 주소(v0.5.91): Pages가 켜진 저장소만 { 프로젝트 id: 주소 }. Supabase 모드에서만 */
  pagesUrls?(projectIds: string[]): Promise<Record<string, string>>;
  /** 이 저장소(.claude/skills)의 스킬 목록(v0.6.55, AI 호출 없음) */
  skills?(): Promise<import('../domain/skills').SkillFile[]>;
  /** 프로젝트마다 이 스킬이 들어 있는지(v0.6.58) */
  skillStatus?(skill: string): Promise<Record<string, import('../domain/skills').SkillInstallState>>;
  /** 모든 프로젝트 스킬 최신으로(2026-11-16): Actions 한 번으로 프로젝트마다 원본과 다른 스킬만 맞춘다 */
  refreshSkills?(): Promise<{ repos: string[] }>;
  /** UI 코드 검사(PR 알림)가 들어 있는 프로젝트(프로젝트 id → 있음) */
  uiCheckStatus?(): Promise<Record<string, boolean>>;
  /** UI 코드 검사 넣기(Actions) */
  installUiCheck?(projectIds: string[]): Promise<{ repos: string[] }>;
  /** 그림 지도: 프로젝트마다 들어 있는 스킬(v0.6.62) */
  skillMap?(): Promise<import('../domain/skills').SkillMapData>;
  /** 서버에 저장해 둔 스킬 목록·상태(v0.6.70). 없으면 null */
  skillCache?(): Promise<{ files: import('../domain/skills').SkillFile[]; map: import('../domain/skills').SkillMapData; mcp: Record<string, string[]>; updatedAt: string } | null>;
  /** 프로젝트마다 저장소 .mcp.json의 MCP 이름(v0.6.71, 값은 읽지 않음) */
  mcpMap?(): Promise<Record<string, string[]>>;
  /** 고른 프로젝트에 스킬 넣기(Actions '스킬 넣기'를 프로젝트마다 시작) */
  installSkill?(skill: string, projectIds: string[], mode?: 'add' | 'remove'): Promise<{ started: string[]; failed: string[] }>;
  /** 프로젝트 디자인 기준(v0.5.56, Supabase 모드에서만) */
  designStandard?: { draft(projectId: string, refs?: string[]): Promise<string>; approve(projectId: string, md: string): Promise<void> };
  /** 디자인 자동 검사(v0.5.56, Supabase 모드에서만) */
  designCheck?: {
    load(taskId: string, revision: number): Promise<import('../domain/designCheck').DesignReport | null>;
    start(taskId: string, revision: number): Promise<void>;
  };
  /** LLM 위키(v0.7.41): 프로젝트 한 장짜리 위키 읽기·다시 정리·빈 프로젝트 채우기(Supabase 모드에서만) */
  wiki?: {
    get(projectId: string): Promise<{ body: string; updatedAt: string; judge: string; tasks: number } | null>;
    rebuild(projectId: string): Promise<string>;
    fillAll(): Promise<number>;
  };
  /** 화면 확인(v0.6.9): 실제 미리보기·운영 사이트를 찍어 본다(Supabase 모드에서만) */
  siteCheck?: {
    load(taskId: string): Promise<import('../domain/siteCheck').SiteChecks>;
    start(taskId: string, kind: import('../domain/siteCheck').SiteKind): Promise<void>;
  };
  /** Gemini 개발 결과의 PR 자동 열기(v0.5.85, Supabase 모드에서만) */
  openPr?(taskId: string): Promise<void>;
  /** 옵시디언 노트 보관함(v0.5.62, Supabase 모드에서만): 코드 그래프 다시 만들기, 지운 프로젝트·업무 노트 지우기 */
  notes?: { graph(projectId: string): Promise<void>; remove(project: string, task?: string): Promise<void> };
  /** 앱 점검(floorplan 1단계, v0.5.53, Supabase 모드에서만) */
  healthCheck?: {
    load(projectId: string): Promise<import('../domain/healthText').HealthReport | null>;
    /** unchanged = 코드가 그대로라 다시 돌리지 않음(v0.6.53). force면 늘 다시 */
    start(projectId: string, force?: boolean): Promise<{ unchanged: boolean }>;
    map(projectId: string): Promise<string | null>;
  };
  /** Claude PM 대신 Gemini가 쓴 분배 계획 글(v0.5.20). 저장은 앱이 검증한 뒤 */
  draftPlan(taskId: string): Promise<{ plan: string; specRevision: number }>;
  draftPrototype(taskId: string, text: string): Promise<{ drafts: { slot: 'A' | 'B'; html: string }[]; planRevision: number }>;
  /** Gemini 무료가 기획 요청 문서로 기획서 초안을 써서 새 버전으로 저장한다(서버). */
  draftSpec(taskId: string, text: string): Promise<{ revision: number; intent: string }>;
  /** 질문 전에 Gemini 질문 서버를 미리 깨운다(입력창을 누를 때, Gemini는 부르지 않음, v0.4.23) */
  warmGemini?(): void;
  /** 사용량 기간 읽기(v0.7.84): ai_calls·usage_runs의 [fromIso, toIso) 기록. 없으면 화면이 스냅샷(최근 7일)으로 센다 */
  usageRange?(fromIso: string, toIso: string): Promise<{ calls: import('../domain/usageStats').UsageCall[]; runs: import('../domain/usageStats').UsageRunRow[] }>;
  /** GitHub Actions 실행 기록(v0.7.93): 저장소·워크플로·분. 서버 actions-usage */
  actionsUsage?(fromIso: string, toIso: string): Promise<{ runs: NonNullable<import('../domain/usageStats').UsageInput['actions']>; skipped: { repo: string; why: string }[] }>;
  /** 웹 검색 남은 크레딧(서비스 사용량 API, 막혀 있으면 null, v0.7.53) */
  searchCredits?(): Promise<{ tavily: import('../domain/searchCredits').Credits | null; firecrawl: import('../domain/searchCredits').Credits | null }>;
  askGemini(
    question: string,
    history: { role: 'user' | 'model'; text: string }[],
    images?: { mime: string; data: string }[],
    /** 답 조각이 올 때마다 지금까지의 글 전체로 부른다(있으면 스트리밍, v0.4.15) */
    onDelta?: (soFar: string) => void,
    /** AI 먼저 판단(프로젝트 이름들)·고른 프로젝트 정보(v0.4.29) */
    opts?: AskOptions,
  ): Promise<{ answer: string; keySlot: number; model?: string; video?: boolean; sources?: Source[]; engine?: string; pages?: number; weather?: import('../domain/weather').WeatherData }>;
}

/** 챗봇 모드 대화 한 마디(v0.7.99) */
export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  at: string;
  /** 답한 키(A·B)와 함께 일한 쪽(웹 조사) */
  by?: 'A' | 'B' | 'office';
  /** 실제로 답한 모델(v0.8.0: 챗봇은 Flash 먼저, 안 되면 Lite) */
  model?: string;
  helpers?: string[];
  /** 날씨 답(v0.8.13): 표로 그린다(Open-Meteo 숫자, 모델 아님) */
  weather?: import('../domain/weather').WeatherData;
  /** 웹 조사 출처(v0.8.6): 답 아래 '출처 n'과 옵시디언 '자료/' 노트 */
  sources?: { title: string; uri: string }[];
  /** 함께 보낸 사진의 작은 미리보기(v0.8.6, 원본은 저장하지 않음) */
  thumbs?: string[];
  /** 유튜브 요약이 안 됐을 때(v0.8.4): Gemini 앱에서 이어 하기 버튼(원문) */
  yt?: string;
  /** 업무로 접수 제안(v0.8.1): 대화 중 개발 요청으로 보이면. 접수하면 그 업무 대화로 넘긴다 */
  suggest?: { candidates: string[]; state: 'open' | 'sent' | 'dismissed'; projectId?: string };
}
/** 챗봇 모드 대화 한 줄기(서버 chat_threads, v0.7.99) */
export interface ChatThread {
  id: string;
  title: string;
  messages: ChatTurn[];
  updatedAt: string;
  /** 묶인 프로젝트(v0.8.1, 없으면 프로젝트 없는 채팅) */
  projectId?: string | null;
}
export type ChatThreadInfo = { id: string; title: string; updatedAt: string; projectId: string | null };

/** Linear 연결 확인 결과(읽기만, v0.4.11) */
export interface KeyStatus {
  name: string;
  secret: string;
  /** 서버 비밀값이 들어 있는지 */
  set: boolean;
  /** GitHub 확인 결과(true 통함, false 거절, null 확인 안 함) */
  works: boolean | null;
  /** 만료 시각(ISO). null이면 만료 없음 또는 알 수 없음 */
  expiresAt: string | null;
}

export interface LinearProbe {
  connected: boolean;
  reason?: string;
  viewer?: string;
  teams?: { key: string; name: string }[];
  codexUser?: string | null;
  canDelegate?: boolean;
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
  /** 서버가 계산한 브랜치 미리보기 링크(없으면 빈 문자열) */
  previewUrl: string;
  /** 자동 개발이 찍어 보낸 화면(서버가 비공개 버킷에 올림, v0.4.97) */
  screenshots: { path: string; sha256: string; size: number; mime: string; name: string }[];
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
