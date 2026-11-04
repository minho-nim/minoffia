// New Office(v0.6.0, 소유자 2026-11-04 확정 디자인 2장): 공간형(업무 기능별 공유 공간)·조직형(AI 조직 네트워크) 화면의 규칙.
// 그림 좌표는 확정 디자인(1024×572)의 사무실 영역 기준이고, 숫자·사람은 모두 실제 업무 데이터에서 계산한다(꾸며낸 데이터 없음).
import { AGENTS } from '../domain/agents';
import type { Agent } from '../domain/agents';
import type { AgentId, Task, WorkType } from '../domain/types';
import type { Stage } from '../domain/workflow-types';
import type { Activity, AgentScene } from './scene';

export type SpaceId = 'hub' | 'planning' | 'research' | 'development' | 'design' | 'quality' | 'deploy';

export interface SpaceDef {
  id: SpaceId;
  name: string;
  /** 쉬운 우리말 이름(보조 표시) */
  ko: string;
  /** 방 그림 위치(디자인 좌표) */
  img: { x: number; y: number; w: number; h: number };
  /** 정보 칸 위치(디자인 좌표, 왼쪽 위) */
  label: { x: number; y: number };
  /** 연결선이 닿는 점 */
  anchor: { x: number; y: number };
  /** 이 공간이 맡는 업무 유형(배포는 단계로 정함) */
  types: WorkType[];
}

/** 화면 영역(디자인 좌표). 높이는 기존 사무실과 같은 비율(300:224)이라 휴대폰의 줄어드는 사무실 동작을 그대로 쓴다. */
export const VIEW = { x: 115, y: 30, w: 750, h: 560 };

export const SPACES: SpaceDef[] = [
  { id: 'hub', name: 'MinLab Hub', ko: '중앙 허브', img: { x: 380, y: 202, w: 222, h: 166 }, label: { x: 420, y: 372 }, anchor: { x: 491, y: 290 }, types: [] },
  { id: 'planning', name: 'Planning', ko: '기획', img: { x: 186, y: 88, w: 180, h: 156 }, label: { x: 132, y: 66 }, anchor: { x: 330, y: 205 }, types: ['planning'] },
  { id: 'research', name: 'Research', ko: '조사', img: { x: 414, y: 52, w: 174, h: 158 }, label: { x: 357, y: 66 }, anchor: { x: 500, y: 200 }, types: ['research'] },
  { id: 'development', name: 'Development', ko: '개발', img: { x: 610, y: 106, w: 248, h: 192 }, label: { x: 681, y: 64 }, anchor: { x: 640, y: 250 }, types: ['dev'] },
  { id: 'design', name: 'Prototype & Design', ko: '견본·디자인', img: { x: 122, y: 296, w: 232, h: 176 }, label: { x: 128, y: 255 }, anchor: { x: 330, y: 370 }, types: ['design', 'prototype'] },
  { id: 'quality', name: 'Quality & CI', ko: '검수·CI', img: { x: 390, y: 380, w: 210, h: 160 }, label: { x: 530, y: 503 }, anchor: { x: 470, y: 400 }, types: ['qa'] },
  { id: 'deploy', name: 'Deployment & Operations', ko: '올리기·배포', img: { x: 640, y: 328, w: 206, h: 170 }, label: { x: 718, y: 494 }, anchor: { x: 660, y: 380 }, types: [] },
];

export const SPACE_BY_ID = Object.fromEntries(SPACES.map((s) => [s.id, s])) as Record<SpaceId, SpaceDef>;

/** 올리기·배포 공간이 맡는 단계 */
const DEPLOY_RUNNING: Stage[] = ['github_uploading', 'pr_review', 'deploying'];
const DEPLOY_WAITING: Stage[] = ['github_approval_pending', 'deployment_approval_pending'];

/** 업무가 지금 어느 공간의 일인지(규칙만). 올리기·배포 단계면 배포 공간, 아니면 업무 유형의 공간 */
export function spaceOfTask(t: Task): SpaceId {
  if (t.stage && (DEPLOY_RUNNING.includes(t.stage) || DEPLOY_WAITING.includes(t.stage))) return 'deploy';
  if (t.status === 'done' && t.prUrl) return 'deploy';
  return SPACES.find((s) => s.types.includes(t.type))?.id ?? 'hub';
}

/** AI의 소속(조직형): 등록된 AI의 역할·기본 방에서 정한다. 새 AI가 등록돼도 이 규칙으로 자리가 정해진다(모르면 허브). */
export function teamOf(a: Pick<Agent, 'id' | 'home' | 'role'>): SpaceId {
  if (a.home === 'planning' && /디자인|프로토|견본/.test(a.role)) return 'design';
  if (a.home === 'planning') return 'planning';
  if (a.home === 'research') return 'research';
  if (a.home === 'dev') return 'development';
  if (a.home === 'terminal') return 'quality';
  return 'hub';
}

const ZONE_TO_SPACE: Record<string, SpaceId> = { corridor: 'hub', research: 'research', dev: 'development', terminal: 'quality' };

/** 공간형에서 AI가 지금 있는 공간(기존 사무실 위치 규칙 buildScene을 그대로 따른다). 쉬는 AI는 소속 공간에 흐리게 */
export function spaceOfScene(s: AgentScene): SpaceId {
  const agent = AGENTS.find((a) => a.id === s.agent);
  const z = s.spot.zone;
  // 기존 사무실의 기획실은 기획과 견본·디자인을 같이 썼다. 지금 하는 일이 견본·디자인이면 그 공간으로
  if (z === 'planning') return s.task && (s.task.type === 'design' || s.task.type === 'prototype') ? 'design' : 'planning';
  if (z === 'lounge') return agent ? teamOf(agent) : 'hub';
  return ZONE_TO_SPACE[z] ?? 'hub';
}

export interface SpaceStats {
  /** 지금 이 공간에 있는 AI(휴가 제외) */
  present: AgentId[];
  running: Task[];
  waiting: Task[];
  blocked: Task[];
  done: number;
  /** 최근 움직인 업무(새것부터) */
  recent: Task[];
}

export function spaceStats(id: SpaceId, tasks: Task[], scene: AgentScene[], leave: AgentId[]): SpaceStats {
  const mine = tasks.filter((t) => spaceOfTask(t) === id);
  const open = mine.filter((t) => t.status !== 'done');
  return {
    present: scene.filter((s) => !leave.includes(s.agent) && spaceOfScene(s) === id).map((s) => s.agent),
    running: open.filter((t) => t.status === 'in_progress'),
    waiting: open.filter((t) => t.status === 'queued' || t.status === 'review'),
    blocked: open.filter((t) => t.status === 'blocked'),
    done: mine.length - open.length,
    recent: [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
  };
}

/** 지금 일하는 AI 수(작업 중·도와주는 중, 휴가 제외) */
export function activeCount(scene: AgentScene[], leave: AgentId[]): number {
  return scene.filter((s) => !leave.includes(s.agent) && (s.activity === 'working' || s.activity === 'helping')).length;
}

export function statusText(activity: Activity | undefined, onLeave: boolean): string {
  if (onLeave) return '휴가';
  switch (activity) {
    case 'working':
      return '작업 중';
    case 'helping':
      return '도와주는 중';
    case 'blocked':
      return '막힘';
    case 'review':
      return '검토 대기';
    case 'waiting':
      return '대기';
    default:
      return '쉬는 중';
  }
}

/** 조직형 노드 위치(디자인 좌표, 공간형과 같은 화면 영역 안) */
export const ORG_NODES: Record<SpaceId, { x: number; y: number; w: number; h: number }> = {
  planning: { x: 290, y: 150, w: 120, h: 110 },
  research: { x: 255, y: 285, w: 130, h: 110 },
  hub: { x: 440, y: 270, w: 140, h: 120 },
  development: { x: 655, y: 150, w: 130, h: 115 },
  design: { x: 640, y: 300, w: 200, h: 115 },
  quality: { x: 460, y: 455, w: 130, h: 115 },
  deploy: { x: 640, y: 440, w: 200, h: 130 },
};

/** 조직형 연결선: 허브에서 각 팀으로(배포는 검수 뒤라 연결선 없이 둔다, 디자인과 같음) */
export const ORG_LINKS: SpaceId[] = ['planning', 'research', 'development', 'design', 'quality'];
