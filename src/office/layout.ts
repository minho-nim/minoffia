import type { RoomId } from '../domain/types';

/**
 * 논리 좌표계. 참고 배경(1200×896)을 1/4로 줄인 크기와 같다.
 * 배경 이미지를 넣으면 이 좌표 그대로 이미지 위에 캐릭터가 선다.
 */
export const W = 300;
export const H = 224;
/** 가로 복도에서 걷는 높이(발 위치). */
export const HALL_Y = 113;

export interface Point {
  x: number;
  y: number;
}

export interface Seat extends Point {
  id: string;
  /** 이 자리 모니터(노트북). 누가 실제로 작업 중일 때만 켜진다. */
  monitor: Point;
  /** 배경 이미지 위에 불빛을 얹을 화면 영역. 모니터가 없는 자리는 없음. */
  glow?: { x: number; y: number; w: number; h: number };
}

export interface RoomDef {
  id: RoomId;
  label: string;
  tag: string;
  rect: { x: number; y: number; w: number; h: number };
  /** 방 안쪽 문 앞 → 복도 쪽 문 앞 */
  door: { inside: Point; outside: Point };
  /** 앞쪽은 이 방에 사는 에이전트 자리, 뒤쪽은 도우러 온 에이전트 자리. */
  seats: Seat[];
  idle: Point;
}

const seat = (room: RoomId, i: number, x: number, y: number, mx: number, my: number, glow?: Seat['glow']): Seat => ({
  id: `${room}-${i}`,
  x,
  y,
  monitor: { x: mx, y: my },
  glow,
});

export const ROOMS: RoomDef[] = [
  {
    id: 'research',
    label: '리서치실',
    tag: '#e0894a',
    rect: { x: 8, y: 6, w: 94, h: 84 },
    door: { inside: { x: 54, y: 84 }, outside: { x: 54, y: HALL_Y } },
    seats: [seat('research', 0, 54, 77, 50, 52), seat('research', 1, 85, 77, 80, 76)],
    idle: { x: 30, y: 80 },
  },
  {
    id: 'dev',
    label: '개발실',
    tag: '#4f8fe0',
    rect: { x: 108, y: 6, w: 92, h: 84 },
    door: { inside: { x: 150, y: 84 }, outside: { x: 150, y: HALL_Y } },
    seats: [
      seat('dev', 0, 130, 52, 123, 26, { x: 123, y: 26, w: 16, h: 6 }),
      seat('dev', 1, 174, 52, 163, 26, { x: 164, y: 26, w: 16, h: 6 }),
      seat('dev', 2, 130, 82, 123, 57, { x: 123, y: 57, w: 16, h: 6 }),
      seat('dev', 3, 174, 82, 163, 57, { x: 164, y: 57, w: 16, h: 6 }),
    ],
    idle: { x: 152, y: 66 },
  },
  {
    id: 'terminal',
    label: '터미널실 · CI',
    tag: '#8a939c',
    rect: { x: 205, y: 6, w: 87, h: 84 },
    door: { inside: { x: 250, y: 84 }, outside: { x: 250, y: HALL_Y } },
    seats: [
      seat('terminal', 0, 222, 67, 211, 66, { x: 210, y: 66, w: 19, h: 7 }),
      seat('terminal', 1, 274, 67, 260, 66, { x: 260, y: 66, w: 20, h: 8 }),
    ],
    idle: { x: 246, y: 58 },
  },
  {
    id: 'planning',
    label: '기획실',
    tag: '#e3b23c',
    rect: { x: 8, y: 129, w: 109, h: 86 },
    door: { inside: { x: 108, y: 166 }, outside: { x: 126, y: 166 } },
    seats: [
      seat('planning', 0, 59, 168, 55, 172),
      seat('planning', 1, 42, 181, 44, 176),
      seat('planning', 2, 77, 181, 64, 176),
      seat('planning', 3, 59, 199, 55, 182),
    ],
    idle: { x: 92, y: 202 },
  },
  {
    id: 'lounge',
    label: '휴게실',
    tag: '#5fae6e',
    rect: { x: 190, y: 129, w: 102, h: 86 },
    door: { inside: { x: 190, y: 166 }, outside: { x: 172, y: 166 } },
    seats: [],
    idle: { x: 240, y: 204 },
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, RoomDef>;

/** 휴게실 쉬는 자리. 소파 앞 3자리, 안락의자 2자리, 바닥 2자리. */
export const LOUNGE_SPOTS: Point[] = [
  { x: 231, y: 171 },
  { x: 244, y: 171 },
  { x: 257, y: 171 },
  { x: 218, y: 187 },
  { x: 283, y: 187 },
  { x: 265, y: 204 },
  { x: 205, y: 205 },
];

/** 복도 메모 보드 아래, 미나가 서는 자리. */
export const RECEPTION: Point = { x: 150, y: 196 };
/** 복도 메모 보드(HTML 오버레이) 위치. */
export const MEMO_BOARD = { x: 122, y: 143, w: 52, h: 34 };

export type Zone = RoomId | 'corridor';

export interface Spot extends Point {
  zone: Zone;
}

/** 방과 방 사이는 문 → 복도(가로 복도 경유) → 문 순서로 걷는다. */
export function pathBetween(from: Spot, to: Spot): Point[] {
  if (from.zone === to.zone) return [{ x: to.x, y: to.y }];
  const pts: Point[] = [];
  let start: Point = from;
  if (from.zone !== 'corridor') {
    const d = ROOM_BY_ID[from.zone].door;
    pts.push(d.inside, d.outside);
    start = d.outside;
  }
  let end: Point = to;
  const tail: Point[] = [];
  if (to.zone !== 'corridor') {
    const d = ROOM_BY_ID[to.zone].door;
    tail.push(d.outside, d.inside);
    end = d.outside;
  }
  // 복도 안에서는 가로 복도 높이로 올라갔다가 옆으로 이동한다.
  if (start.y !== HALL_Y || end.y !== HALL_Y) {
    pts.push({ x: start.x, y: HALL_Y }, { x: end.x, y: HALL_Y });
  }
  pts.push(...tail, { x: to.x, y: to.y });
  return pts;
}
