import type { Stage, WorkflowData } from './workflow-types';

export type AgentId = 'mina' | 'claude' | 'codex' | 'grok' | 'studioA' | 'studioB' | 'ci';
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
  sample?: boolean;
  createdAt: string;
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
  /** B 승인 뒤 기록한 PR 주소 */
  prUrl?: string | null;
  /** PM에 보낸 기획서 버전 */
  dispatchSpecRevision?: number | null;
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
  purpose: 'question' | 'image';
  /** 공급자 응답 코드(429 = 한도) */
  httpStatus: number | null;
  createdAt: string;
}

export interface Snapshot {
  projects: Project[];
  tasks: Task[];
  usage: UsageRun[];
  workflow: WorkflowData;
  /** 최근 Gemini 질문 기록(Supabase 모드만) */
  aiCalls?: AiCall[];
}

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
