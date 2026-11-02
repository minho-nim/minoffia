import type { AgentId, RoomId, WorkType } from './types';

export type AgentMode = 'rule' | 'cloud' | 'manual' | 'ci';

export interface AgentPalette {
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  accent: string;
}

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  provider: string;
  mode: AgentMode;
  /** 평소 자리. null이면 복도 접수 데스크. */
  home: RoomId | null;
  skills: WorkType[];
  /** 하루 등록 실행 상한. null이면 상한 없음. */
  dailyCap: number | null;
  note: string;
  sprite: 'person' | 'bot';
  palette: AgentPalette;
}

export const MODE_LABEL: Record<AgentMode, string> = {
  rule: '규칙 기반',
  cloud: 'Cloud 실행',
  manual: '수동 인계',
  ci: 'CI 연동 예정',
};

export const AGENTS: Agent[] = [
  {
    id: 'mina',
    name: '미니엉',
    role: '접수 매니저',
    provider: 'AI Office 규칙 엔진',
    mode: 'rule',
    home: null,
    skills: [],
    dailyCap: null,
    note: '대화창의 얼굴. 받은 말을 넘기고, 앱 상태 답·승인 알림·첫 배정은 규칙으로 한다(모델 호출 없음). 질문·판단은 근무 중인 Studio A·B(Gemini)의 답을 받아 전한다.',
    sprite: 'person',
    palette: { hair: '#2b1d1a', skin: '#f1c7a5', shirt: '#d8577a', pants: '#3b3550', accent: '#f6d65b' },
  },
  {
    id: 'claude',
    name: 'Claude',
    role: '기획·설계 리드',
    provider: 'Claude Code Cloud Routines',
    mode: 'cloud',
    home: 'planning',
    skills: ['planning', 'dev', 'research'],
    dailyCap: 20,
    note: 'Claude Pro 사용량을 쓴다. 서버가 하루 20회로 제한하며(루틴 한도는 시간당 30회), 허용된 저장소 하나만 작업한다.',
    sprite: 'person',
    palette: { hair: '#8a4b2d', skin: '#f3cfb1', shirt: '#d97757', pants: '#3d3a46', accent: '#fbe3d4' },
  },
  {
    id: 'codex',
    name: 'Codex (Linear)',
    role: '주 개발',
    provider: 'OpenAI (ChatGPT 계정: Codex·ChatGPT)',
    mode: 'manual',
    home: 'dev',
    skills: ['dev', 'planning'],
    dailyCap: 6,
    note: '무인 클라우드 실행이 연결되지 않았다. 지시서를 복사해 직접 전달한다.',
    sprite: 'person',
    palette: { hair: '#1c1f26', skin: '#e2b48f', shirt: '#2f9e7a', pants: '#2b3140', accent: '#c9f2e2' },
  },
  {
    id: 'grok',
    name: 'Grok',
    role: '리서치',
    provider: 'Grok Build (무료)',
    mode: 'manual',
    home: 'research',
    skills: ['research'],
    dailyCap: 6,
    note: '무료 계정의 외부 호출은 확인되지 않았다. 수동 인계만 가능하다.',
    sprite: 'person',
    palette: { hair: '#d8d8d8', skin: '#e9c09c', shirt: '#2d2f36', pants: '#4a4e5a', accent: '#9aa0ad' },
  },
  {
    id: 'studioA',
    name: 'Studio A',
    role: 'UI·디자인',
    provider: 'Google AI Studio Build (계정 1)',
    mode: 'manual',
    home: 'planning',
    skills: ['design', 'prototype', 'research'],
    dailyCap: 5,
    note: 'AI Studio Build 외부 호출은 확인되지 않았다. 수동 인계만 가능하다.',
    sprite: 'person',
    palette: { hair: '#4d6bd6', skin: '#f0c9a8', shirt: '#f2b33d', pants: '#344067', accent: '#ffffff' },
  },
  {
    id: 'studioB',
    name: 'Studio B',
    role: '프로토타입',
    provider: 'Google AI Studio Build (계정 2)',
    mode: 'manual',
    home: 'planning',
    skills: ['prototype', 'design', 'research'],
    dailyCap: 5,
    note: 'AI Studio Build 외부 호출은 확인되지 않았다. 수동 인계만 가능하다.',
    sprite: 'person',
    palette: { hair: '#6a3d8f', skin: '#d9a47e', shirt: '#4aa3d8', pants: '#33354a', accent: '#ffffff' },
  },
  {
    id: 'ci',
    name: 'CI 봇',
    role: '검수·QA',
    provider: 'GitHub Actions',
    mode: 'ci',
    home: 'terminal',
    skills: ['qa'],
    dailyCap: null,
    note: 'PR마다 typecheck·test·build를 돌린다. 결과 자동 반영은 v0.2에서 연결한다.',
    sprite: 'bot',
    palette: { hair: '#9aa6b2', skin: '#c7d0d8', shirt: '#6f7c89', pants: '#4a5560', accent: '#5fe08a' },
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, Agent>;

/** 작업 유형별 배정 후보, 앞쪽이 우선. */
export const CANDIDATES: Record<WorkType, AgentId[]> = {
  planning: ['claude', 'codex'],
  dev: ['codex', 'claude'],
  design: ['studioA', 'studioB'],
  prototype: ['studioB', 'studioA'],
  // 조사: Grok이 휴가면 Gemini(무료, Google 검색 연결)가 먼저, Claude는 마지막(v0.4.76 소유자 "대신 해줄 AI")
  research: ['grok', 'studioA', 'studioB', 'claude'],
  qa: ['ci'],
};

export const WORK_ROOM: Record<WorkType, RoomId> = {
  planning: 'planning',
  dev: 'dev',
  design: 'planning',
  prototype: 'planning',
  research: 'research',
  qa: 'terminal',
};
