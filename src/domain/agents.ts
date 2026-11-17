import type { AgentId, RoomId, WorkType } from './types';

export type AgentMode = 'rule' | 'cloud' | 'manual' | 'ci' | 'api';

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
  ci: 'GitHub Actions',
  api: '서버 자동',
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
    note: '대화창의 얼굴. 받은 말을 넘기고, 앱 상태 답·승인 알림·첫 배정은 규칙으로 한다(모델 호출 없음). 질문·판단은 근무 중인 Studio A·B(Gemini)의 답을, 웹 조사는 Exa가 찾고 Gemini가 정리한 답을 받아 전한다.',
    sprite: 'person',
    palette: { hair: '#2b1d1a', skin: '#f1c7a5', shirt: '#d8577a', pants: '#3b3550', accent: '#f6d65b' },
  },
  {
    id: 'claude',
    name: 'Claude',
    role: 'PM·기획 + 보조 개발',
    provider: 'Claude Code 루틴(클라우드)',
    mode: 'cloud',
    home: 'planning',
    skills: ['planning', 'dev', 'research'],
    dailyCap: 20,
    note: '요청을 기획서와 작업으로 나눈다(PM). Codex가 못 하거나 휴가면 보조 개발을 하고, 올리기 승인 뒤 PR을 연다. Claude Pro 사용량을 쓰고 서버가 하루 20회로 제한한다.',
    sprite: 'person',
    palette: { hair: '#8a4b2d', skin: '#f3cfb1', shirt: '#d97757', pants: '#3d3a46', accent: '#fbe3d4' },
  },
  {
    id: 'codex',
    name: 'Codex (Linear)',
    role: '주 개발',
    provider: 'Codex 클라우드(Linear로 맡김)',
    mode: 'cloud',
    home: 'dev',
    skills: ['dev', 'planning'],
    dailyCap: 6,
    note: 'Linear 업무로 받아 Codex 클라우드에서 개발·시험하고 결과를 미노피아로 보낸다. 시작 못 하면 서버가 Claude로 넘긴다.',
    sprite: 'person',
    palette: { hair: '#1c1f26', skin: '#e2b48f', shirt: '#2f9e7a', pants: '#2b3140', accent: '#c9f2e2' },
  },
  {
    id: 'exa',
    name: 'Exa',
    role: '웹 조사',
    provider: 'Exa 검색 API(무료 사용량) + Gemini 정리',
    mode: 'api',
    home: 'research',
    skills: [],
    dailyCap: null,
    note: '대화에서 찾아봐야 하는 질문이 오면 서버가 Exa로 웹 글 5개를 찾고 Gemini(Studio A·B)가 정리한다. 업무는 맡지 않는다(v0.7.2, 소유자 "리서치 자리는 Exa"). 휴가면 웹 검색을 하지 않는다(Gemini가 아는 범위로만 답함).',
    sprite: 'person',
    palette: { hair: '#3a3a3a', skin: '#efc8a6', shirt: '#4a7bd0', pants: '#2f3442', accent: '#e8eef8' },
  },
  {
    id: 'studioA',
    name: 'Studio A',
    role: 'Gemini · 평가(요청·사용자)·질문 답(키 A)',
    provider: 'Gemini API 무료 키 A',
    mode: 'api',
    home: 'planning',
    skills: ['design', 'prototype', 'research'],
    dailyCap: 5,
    note: '결과 3중 평가의 Gemini A(요청·사용자 관점), 대화 질문 답과 웹 조사 정리, 기획서 초안, 앱 지도 이름 붙이기. @StudioA.',
    sprite: 'person',
    palette: { hair: '#4d6bd6', skin: '#f0c9a8', shirt: '#f2b33d', pants: '#344067', accent: '#ffffff' },
  },
  {
    id: 'studioB',
    name: 'Studio B',
    role: 'Gemini · 평가(반대 심문)·질문 답(키 B)',
    provider: 'Gemini API 무료 키 B',
    mode: 'api',
    home: 'planning',
    skills: ['prototype', 'design', 'research'],
    dailyCap: 5,
    note: '결과 3중 평가의 Gemini B(반대 심문: 안 된 이유·증거 없는 주장을 찾음, 코드 품질·안전 포함). 그 밖에는 Studio A와 같은 일을 키 B로 한다. A가 한도에 걸리거나 휴가면 대신 답한다. @StudioB면 B가 먼저.',
    sprite: 'person',
    palette: { hair: '#6a3d8f', skin: '#d9a47e', shirt: '#4aa3d8', pants: '#33354a', accent: '#ffffff' },
  },
  {
    id: 'ci',
    name: '미노',
    role: '검수 · 구조도·앱 지도',
    provider: 'GitHub Actions',
    mode: 'ci',
    home: 'terminal',
    skills: ['qa'],
    dailyCap: null,
    note: 'GitHub Actions에서 PR 검사(typecheck·test·build)와 배포를 하고, 바뀐 곳 구조도(Archify)·앱 지도(floorplan)를 만든다. 스킬 넣기·옵시디언 노트도 여기서. 모델 호출 없음(앱 지도 부분 이름만 Gemini).',
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
  // 조사 업무: Gemini(Studio A·B)가 먼저, Claude는 마지막. 대화의 웹 조사는 Exa가 찾고 Gemini가 정리(업무 배정과 별개). Grok은 뺐다(2026-11-13)
  research: ['studioA', 'studioB', 'claude'],
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
