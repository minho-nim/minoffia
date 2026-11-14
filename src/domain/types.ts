import type { Stage, WorkflowData } from './workflow-types';

/** exa = 웹 조사(서버 자동, 업무는 맡지 않음). Grok은 2026-11-13 완전히 뺐다(소유자) */
export type AgentId = 'mina' | 'claude' | 'codex' | 'exa' | 'studioA' | 'studioB' | 'ci';
export type RoomId = 'research' | 'dev' | 'terminal' | 'planning' | 'lounge';
export type WorkType = 'planning' | 'dev' | 'design' | 'prototype' | 'research' | 'qa';
export type RequestedType = WorkType | 'auto';
export type TaskStatus = 'queued' | 'in_progress' | 'review' | 'blocked' | 'done';
export type Priority = 'low' | 'normal' | 'high';
export type DispatchState = 'none' | 'dispatching' | 'dispatched' | 'failed';

export interface Project {
  id: string;
  name: string;
  /** GitHub `owner/repo`. 없으면 연결되지 않은 프로젝트. */
  repo: string | null;
  description: string;
  /** 브랜치 미리보기 주소의 호스트(예: minlab-ai-office.pages.dev, Cloudflare Pages). 있으면 Claude 결과에 미리보기 링크가 붙는다(v0.4.57) */
  previewHost?: string | null;
  /** 데모 주소(v0.5.92, 예: https://minho-nim.github.io/repo/). 칸이 없는 DB면 undefined */
  demoUrl?: string | null;
  /** 확정된 디자인 기준(DESIGN.md)과 Gemini 초안(v0.5.56). 칸이 없는 DB면 undefined */
  designMd?: string;
  designDraft?: string;
  sample?: boolean;
  /** 순서(v0.6.42, 작을수록 앞). 칸이 없는 DB면 undefined */
  position?: number;
  createdAt: string;
}

/** 이 프로젝트에서 지켜야 할 것(v0.4.57): AI가 접수·계획·개발 결과에서 적어 두고, 다음 지시서에 함께 넣는다 */
export interface ProjectRule {
  id: string;
  projectId: string;
  rule: string;
  /** spec = Gemini 기획서 초안, plan = Claude PM 계획, result = 개발 결과, owner = 소유자가 직접 */
  source: 'spec' | 'plan' | 'result' | 'owner';
  taskId: string | null;
  createdAt: string;
}

export const RULE_SOURCE_LABEL: Record<ProjectRule['source'], string> = { spec: '기획서', plan: 'PM 계획', result: '개발 결과', owner: '내가 적음' };
export const PREVIEW_HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** 데모 주소 형식(v0.5.92, DB check와 같음) */
export const DEMO_URL_PATTERN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(\/[A-Za-z0-9._~/-]*)?$/;
/** 적은 글을 데모 주소로: 앞뒤 공백 제거, https:// 없으면 붙이고 호스트는 소문자. 틀리면 null */
export function normalizeDemoUrl(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, 'https://') : `https://${t}`;
  const m = /^https:\/\/([^/]+)(\/.*)?$/i.exec(withScheme);
  if (!m) return null;
  const url = `https://${m[1].toLowerCase()}${m[2] ?? '/'}`;
  return DEMO_URL_PATTERN.test(url) ? url : null;
}
/** 운영 사이트 주소(v0.5.89): 프로젝트에 적은 미리보기 주소(Cloudflare Pages)의 운영 주소. 없거나 형식이 틀리면 null */
export function siteUrl(p: Pick<Project, 'previewHost'> | null | undefined): string | null {
  const host = p?.previewHost?.trim().toLowerCase();
  return host && PREVIEW_HOST_PATTERN.test(host) ? `https://${host}/` : null;
}

export interface Dispatch {
  state: DispatchState;
  sessionUrl?: string | null;
  error?: string | null;
  at?: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: WorkType;
  requestedType: RequestedType;
  priority: Priority;
  assignee: AgentId;
  routeReason: string;
  status: TaskStatus;
  dispatch: Dispatch;
  sample?: boolean;
  /** v0.2.1 업무 단계(DB 저장값). 화면은 기록으로 다시 계산한 값을 쓴다. */
  stage?: Stage;
  /** 사용자가 처음 적은 요청 원문 */
  userOriginalText?: string;
  /** 올리기 승인 뒤 기록한 PR 주소 */
  prUrl?: string | null;
  /** PM에 보낸 기획서 버전 */
  dispatchSpecRevision?: number | null;
  /** 소유자가 대화에서 고른 개발 스킬(v0.7.0). 지시서에 한 줄로 들어간다 */
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 실제로 등록된 실행 1회. 공급자의 잔여 토큰이 아니다. */
export interface UsageRun {
  id: string;
  agent: AgentId;
  taskId: string | null;
  kind: 'cloud' | 'manual';
  /** KST 기준 YYYY-MM-DD */
  day: string;
  createdAt: string;
}

/** 입력창 일반 질문을 Gemini에 보낸 기록(글은 저장하지 않음) */
export interface AiCall {
  id: string;
  ok: boolean;
  keySlot: 1 | 2 | null;
  /** 일반 질문 / 이미지 분석 */
  purpose: 'question' | 'image' | 'research' | string;
  /** 공급자 응답 코드(429 = 한도) */
  httpStatus: number | null;
  /** Gemini가 알려 준 실제 토큰(질문+답+생각, v0.5.50). 예전 기록은 null */
  tokens?: number | null;
  createdAt: string;
}

export interface Snapshot {
  projects: Project[];
  tasks: Task[];
  usage: UsageRun[];
  workflow: WorkflowData;
  /** 최근 Gemini 질문 기록(Supabase 모드만) */
  aiCalls?: AiCall[];
  /** AI별 동시 작업 상한(소유자가 바꾼 것만, 나머지는 기본값) */
  agentLimits?: Partial<Record<'codex' | 'claude' | 'gemini', number>>;
  /** 휴가 중인 AI(v0.4.39). 새 배정·PM 계획에서 뺀다 */
  leave?: AgentId[];
  /** 프로젝트에서 지켜야 할 것(v0.4.57) */
  projectRules?: ProjectRule[];
}

/** 휴가를 줄 수 있는 AI(미니엉 접수·CI 봇은 늘 근무). DB 0026_agent_leave.sql의 check와 같아야 한다 */
export const LEAVE_AGENTS: AgentId[] = ['claude', 'codex', 'exa', 'studioA', 'studioB'];

export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  planning: '기획·설계',
  dev: '개발',
  design: 'UI·디자인',
  prototype: '프로토타입',
  research: '리서치',
  qa: '검수·QA',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '접수',
  in_progress: '진행 중',
  review: '검토 대기',
  blocked: '차단',
  done: '완료',
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: '낮음', normal: '보통', high: '높음' };
