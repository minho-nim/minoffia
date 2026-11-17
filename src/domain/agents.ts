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
    note: '대화창의 얼굴. 받은 말을 넘기고, 앱 상태 답·승인 알림·첫 배정은 규칙으로 한다(모델 호출 없음). 질문·판단은 근무 중인 Studio A·B(Gemini)의 답을, 웹 조사는 Tavily가 찾고 Firecrawl이 본문을 읽어 Gemini가 정리한 답을 받아 전한다.',
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
    id: 'search',
    name: 'Tavily',
    role: '웹 찾기',
    provider: 'Tavily 검색 API(카드 없는 무료 크레딧)',
    mode: 'api',
    home: 'research',
    skills: [],
    dailyCap: null,
    note: '웹 조사 1단계(v0.7.52): 대화에서 찾아봐야 하는 질문이 오면 서버가 Tavily로 웹 글 5개(링크·요약)를 찾는다. 2단계 본문은 Firecrawl, 3단계 정리는 Gemini(Studio A·B). 업무는 맡지 않는다. 휴가면 Firecrawl이 대신 찾는다.',
    sprite: 'person',
    palette: { hair: '#3a3a3a', skin: '#efc8a6', shirt: '#4a7bd0', pants: '#2f3442', accent: '#e8eef8' },
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    role: '본문 읽기',
    provider: 'Firecrawl API(카드 없는 무료 크레딧)',
    mode: 'api',
    home: 'research',
    skills: [],
    dailyCap: null,
    note: '웹 조사 2단계(v0.7.53, 소유자 "@Firecrawl도, 캐릭터도 배정", 그림은 미배정이던 클립보드 캐릭터): Tavily가 찾은 글 중 알짜 2개의 본문 전체를 광고·틀 빼고 읽어 Gemini에 넘긴다. Tavily가 안 되면 대신 찾고, @Firecrawl이면 먼저 찾는다. 휴가면 본문 없이 요약만으로 정리한다.',
    sprite: 'person',
    palette: { hair: '#5a2a14', skin: '#f0c49c', shirt: '#e8642c', pants: '#3a2a24', accent: '#ffd9a8' },
  },
  {
    id: 'studioA',
    name: 'Studio A',
    role: 'Gemini · 대화(질문 답·웹 조사 정리)·평가 A(키 A)',
    provider: 'Gemini API 무료 키 A',
    mode: 'api',
    home: 'planning',
    skills: ['design', 'prototype', 'research'],
    dailyCap: 5,
    note: '대화 담당(v0.7.64 키 나눠 쓰기): 질문 답·접수 판단·웹 조사 정리를 먼저 맡는다. 결과 3중 평가의 Gemini A(사용자 시나리오·회귀: 쓰는 순서대로 따라가 보고 기존 기능이 깨졌나 봄), 시안 A. 업무 쪽 일은 B가 막히면 대신한다. @StudioA.',
    sprite: 'person',
    palette: { hair: '#4d6bd6', skin: '#f0c9a8', shirt: '#f2b33d', pants: '#344067', accent: '#ffffff' },
  },
  {
    id: 'studioB',
    name: 'Studio B',
    role: 'Gemini · 업무(기획서 초안·화면 평가·위키)·평가 B(키 B)',
    provider: 'Gemini API 무료 키 B',
    mode: 'api',
    home: 'planning',
    skills: ['prototype', 'design', 'research'],
    dailyCap: 5,
    note: '업무 담당(v0.7.64 키 나눠 쓰기, 서로 다른 계정이라 무료 한도가 따로): 기획서 초안·PM 초안·사진 분석·디자인 기준·결과 화면 평가·위키를 먼저 맡는다. 결과 3중 평가의 Gemini B(반대 심문: 안 된 이유·증거 없는 주장을 찾음, 코드 품질·안전 포함), 시안 B. 대화 쪽 일은 A가 막히면 대신한다. @StudioB면 B가 먼저.',
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
  // 조사 업무: Gemini(Studio A·B)가 먼저, Claude는 마지막. 대화의 웹 조사는 Tavily가 찾고 Gemini가 정리(업무 배정과 별개). Grok은 뺐다(2026-11-13)
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
