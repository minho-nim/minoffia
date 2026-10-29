import { H, MEMO_BOARD, ROOM_BY_ID, ROOMS, W, type RoomDef } from './layout';

type Ctx = CanvasRenderingContext2D;

export interface DrawState {
  /** 실제 진행 중인 업무가 있는 자리 id */
  litSeats: Set<string>;
  /** 차단된 업무가 하나라도 있으면 터미널실 경고등이 켜진다. */
  alarm: boolean;
}

/** 터미널실 경고등 위치(참고 배경의 빨간 램프 자리) */
const ALARM = { x: 208, y: 46 };

const C = {
  frame: '#3b2416',
  trim: '#d8c49e',
  trimDark: '#a8916a',
  wallLine: '#2a180e',
  hall: '#e2cfa4',
  hallLine: '#cdb688',
  wood: '#a0693f',
  woodDark: '#764a2a',
  woodLight: '#b98252',
  screenOff: '#2b3542',
  screenOn: '#86e3d1',
  screenOn2: '#4fc3a9',
  monitor: '#1c2028',
  chair: '#2c3040',
  chairHi: '#454b60',
  leaf: '#3f8a4c',
  leafHi: '#66b06e',
  pot: '#e7e2d6',
  paper: '#f2ede1',
};

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function plant(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 7, 6, 4, C.pot);
  rect(ctx, x + 1, y + 10, 6, 1, '#b9b2a4');
  rect(ctx, x, y + 2, 8, 5, C.leaf);
  rect(ctx, x + 2, y, 4, 3, C.leaf);
  rect(ctx, x + 1, y + 2, 2, 2, C.leafHi);
  rect(ctx, x + 5, y + 1, 2, 2, C.leafHi);
}

function desk(ctx: Ctx, x: number, y: number, w: number, top = C.wood, edge = C.woodDark) {
  rect(ctx, x, y, w, 6, top);
  rect(ctx, x, y, w, 1, C.woodLight);
  rect(ctx, x, y + 6, w, 3, edge);
}

function monitor(ctx: Ctx, x: number, y: number, on: boolean) {
  rect(ctx, x, y, 8, 6, C.monitor);
  rect(ctx, x + 1, y + 1, 6, 4, on ? C.screenOn : C.screenOff);
  if (on) {
    rect(ctx, x + 1, y + 1, 4, 1, C.screenOn2);
    rect(ctx, x + 2, y + 3, 3, 1, C.screenOn2);
  }
  rect(ctx, x + 3, y + 6, 2, 1, C.monitor);
}

function laptop(ctx: Ctx, x: number, y: number, on: boolean) {
  rect(ctx, x, y, 7, 4, C.monitor);
  rect(ctx, x + 1, y + 1, 5, 2, on ? C.screenOn : C.screenOff);
  rect(ctx, x - 1, y + 4, 9, 1, '#8a929c');
}

function chair(ctx: Ctx, x: number, y: number, color = C.chair) {
  rect(ctx, x, y, 7, 4, color);
  rect(ctx, x, y, 7, 1, C.chairHi);
  rect(ctx, x + 3, y + 4, 1, 2, '#181a22');
}

function bookshelf(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rect(ctx, x, y, w, h, '#5c3a22');
  const books = ['#c0504d', '#4f81bd', '#9bbb59', '#e0b04a', '#8064a2', '#4bacc6', '#d9d9d9'];
  for (let row = y + 1; row + 4 <= y + h - 1; row += 5) {
    rect(ctx, x + 1, row, w - 2, 4, '#3a2414');
    for (let bx = x + 1, i = row; bx < x + w - 1; bx += 2, i++) {
      const short = (i * 7) % 3 === 0 ? 1 : 0;
      rect(ctx, bx, row + short, 1, 4 - short, books[i % books.length]);
    }
  }
}

function rug(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, border: string) {
  rect(ctx, x, y, w, h, border);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, base);
  for (let i = x + 4; i < x + w - 4; i += 4) {
    rect(ctx, i, y + 1, 2, 1, base);
    rect(ctx, i, y + h - 2, 2, 1, base);
  }
}

function planks(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, seam: string) {
  for (let yy = y; yy < y + h; yy += 4) {
    const row = (yy - y) / 4;
    rect(ctx, x, yy, w, Math.min(4, y + h - yy), row % 2 === 0 ? a : b);
    for (let xx = x + 5 + (row % 3) * 7; xx < x + w; xx += 21) rect(ctx, xx, yy, 1, 4, seam);
  }
}

function tiles(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, size: number, grout?: string) {
  for (let yy = y; yy < y + h; yy += size) {
    for (let xx = x; xx < x + w; xx += size) {
      const even = ((xx - x) / size + (yy - y) / size) % 2 === 0;
      rect(ctx, xx, yy, Math.min(size, x + w - xx), Math.min(size, y + h - yy), even ? a : b);
      if (grout) {
        rect(ctx, xx, yy, Math.min(size, x + w - xx), 1, grout);
        rect(ctx, xx, yy, 1, Math.min(size, y + h - yy), grout);
      }
    }
  }
}

function wallFace(ctx: Ctx, r: RoomDef['rect'], h: number, face: string, trim: string) {
  rect(ctx, r.x, r.y, r.w, h, face);
  rect(ctx, r.x, r.y + h - 1, r.w, 1, trim);
}

function hall(ctx: Ctx) {
  const bricks = (x: number, y: number, w: number, h: number) => {
    rect(ctx, x, y, w, h, C.hall);
    for (let yy = y; yy < y + h; yy += 5) {
      rect(ctx, x, yy, w, 1, C.hallLine);
      const off = ((yy - y) / 5) % 2 === 0 ? 0 : 6;
      for (let xx = x + off; xx < x + w; xx += 12) rect(ctx, xx, yy, 1, 5, C.hallLine);
    }
  };
  bricks(8, 94, 284, 34);
  bricks(118, 128, 62, 88);
  // 아래쪽 출입구
  rect(ctx, 118, 214, 62, 10, '#16100c');
  rect(ctx, 136, 202, 26, 12, C.trim);
  rect(ctx, 138, 204, 22, 10, C.hall);
  plant(ctx, 121, 206);
  plant(ctx, 169, 206);
  // 메모 보드
  const m = MEMO_BOARD;
  rect(ctx, m.x - 1, m.y - 1, m.w + 2, m.h + 2, '#5c3a22');
  rect(ctx, m.x, m.y, m.w, m.h, '#7a5230');
}

function research(ctx: Ctx, s: DrawState) {
  const r = ROOM_BY_ID.research;
  const { x, y, w, h } = r.rect;
  planks(ctx, x, y, w, h, '#8a5a3c', '#83543a', '#6e4630');
  wallFace(ctx, r.rect, 30, '#e6d6b4', '#8a6a48');
  bookshelf(ctx, x + 3, y + 6, 20, 24);
  bookshelf(ctx, x + 71, y + 6, 20, 24);
  rect(ctx, x + 26, y + 3, 24, 11, '#3b2a1c');
  rect(ctx, x + 27, y + 4, 22, 9, '#4b86a8');
  rect(ctx, x + 29, y + 6, 5, 3, '#6fae5e');
  rect(ctx, x + 37, y + 5, 4, 3, '#6fae5e');
  rect(ctx, x + 43, y + 7, 5, 4, '#6fae5e');
  rect(ctx, x + 53, y + 4, 16, 12, '#8d96a0');
  rect(ctx, x + 54, y + 5, 14, 10, '#f3f5f6');
  rect(ctx, x + 56, y + 11, 2, 3, '#4f81bd');
  rect(ctx, x + 59, y + 9, 2, 5, '#c0504d');
  rect(ctx, x + 62, y + 7, 2, 7, '#9bbb59');
  bookshelf(ctx, x + 1, y + 32, 6, 34);
  bookshelf(ctx, x + w - 7, y + 32, 6, 34);
  rug(ctx, x + 22, y + 38, 50, 30, '#7a4a32', '#c5904a');
  desk(ctx, x + 32, y + 42, 30);
  rect(ctx, x + 35, y + 43, 5, 3, C.paper);
  rect(ctx, x + 53, y + 43, 5, 4, C.paper);
  plant(ctx, x + 43, y + 36);
  r.seats.forEach((st) => laptop(ctx, st.monitor.x, st.monitor.y, s.litSeats.has(st.id)));
  desk(ctx, x + 10, y + 70, 22);
  bookshelf(ctx, x + 14, y + 66, 8, 5);
  desk(ctx, x + 64, y + 72, 30);
  chair(ctx, x + 72, y + 64, '#2f4a6a');
  rect(ctx, x + 84, y + 73, 5, 3, C.paper);
  plant(ctx, x + 2, y + 70);
}

function dev(ctx: Ctx, s: DrawState) {
  const r = ROOM_BY_ID.dev;
  const { x, y, w, h } = r.rect;
  tiles(ctx, x, y, w, h, '#2b3a58', '#34466a', 8);
  wallFace(ctx, r.rect, 18, '#c9d3de', '#8a97a6');
  rect(ctx, x + 31, y + 2, 30, 12, '#14181f');
  [[2, 12], [4, 16], [2, 9], [6, 14], [4, 10], [2, 18], [5, 11], [3, 15]].forEach(([ox, len], i) =>
    rect(ctx, x + 33 + ox, y + 3 + i * 1.3, Math.min(len, 24 - ox), 1, i % 2 ? '#4ade80' : '#2fa865'),
  );
  r.seats.forEach((st) => {
    const deskY = st.monitor.y + 6;
    desk(ctx, st.x - 15, deskY, 30);
    const on = s.litSeats.has(st.id);
    monitor(ctx, st.monitor.x, st.monitor.y, on);
    monitor(ctx, st.monitor.x + 9, st.monitor.y, on);
    rect(ctx, st.x + 8, deskY - 3, 3, 3, C.leaf);
    chair(ctx, st.x - 3, deskY + 10);
  });
  plant(ctx, x + 3, y + 10);
  plant(ctx, x + w - 11, y + 10);
  plant(ctx, x + 3, y + h - 13);
  plant(ctx, x + w - 11, y + h - 13);
}

function terminal(ctx: Ctx, s: DrawState) {
  const r = ROOM_BY_ID.terminal;
  const { x, y, w, h } = r.rect;
  tiles(ctx, x, y, w, h, '#7f878f', '#788088', 10, '#68707a');
  wallFace(ctx, r.rect, 8, '#3d434b', '#22262d');
  for (let i = 0; i < 5; i++) {
    const rx = x + 5 + i * 16;
    rect(ctx, rx, y + 4, 14, 32, '#1d2027');
    rect(ctx, rx + 1, y + 5, 12, 30, '#2a2f38');
    for (let ly = y + 8; ly < y + 34; ly += 5) {
      rect(ctx, rx + 2, ly, 7, 2, '#3a404a');
      rect(ctx, rx + 10, ly, 1, 1, (ly + i) % 3 === 0 ? '#e0b04a' : '#4ade80');
    }
  }
  rect(ctx, ALARM.x - 1, ALARM.y - 1, 4, 5, '#2a2a2a');
  rect(ctx, ALARM.x, ALARM.y, 2, 3, s.alarm ? '#ff4b3e' : '#5a2a28');
  rect(ctx, x + w - 18, y + 42, 12, 8, '#1d2027');
  rect(ctx, x + w - 16, y + 44, 8, 4, '#7f878f');
  r.seats.forEach((st) => {
    desk(ctx, st.x - 16, st.monitor.y + 6, 32, '#c9ced4', '#8e959d');
    const on = s.litSeats.has(st.id);
    monitor(ctx, st.monitor.x, st.monitor.y, on);
    monitor(ctx, st.monitor.x + 9, st.monitor.y, on);
    rect(ctx, st.monitor.x + 19, st.monitor.y - 1, 6, 7, '#3a404a');
    chair(ctx, st.x - 3, st.monitor.y - 6);
  });
}

function planning(ctx: Ctx, s: DrawState) {
  const r = ROOM_BY_ID.planning;
  const { x, y, w, h } = r.rect;
  tiles(ctx, x, y, w, h, '#e3ad42', '#d9a33b', 10, '#c79232');
  wallFace(ctx, r.rect, 24, '#d79f36', '#8a6224');
  // 이동식 코르크 보드, 화이트보드, 공지판
  rect(ctx, x + 4, y + 8, 22, 26, '#8d96a0');
  rect(ctx, x + 5, y + 9, 20, 24, '#efe8d8');
  [[7, 11, '#f6e27a'], [13, 12, '#9fd4f0'], [19, 11, '#f4a7b0'], [8, 19, '#9fd4f0'], [15, 20, '#f6e27a'], [10, 26, '#f4a7b0']].forEach(
    ([px, py, c]) => rect(ctx, x + (px as number), y + (py as number), 4, 4, c as string),
  );
  rect(ctx, x + 36, y + 4, 30, 15, '#6b5a40');
  rect(ctx, x + 37, y + 5, 28, 13, '#f3f5f6');
  rect(ctx, x + 40, y + 8, 8, 1, '#5b8bd9');
  rect(ctx, x + 50, y + 11, 10, 1, '#5fae6e');
  rect(ctx, x + 42, y + 14, 12, 1, '#d9575b');
  rect(ctx, x + 72, y + 5, 20, 11, '#6b5a40');
  rect(ctx, x + 73, y + 6, 18, 9, '#f3f5f6');
  for (let i = 0; i < 3; i++) rect(ctx, x + 75, y + 8 + i * 2, 12, 1, '#8d96a0');
  bookshelf(ctx, x + 72, y + 20, 18, 9);
  plant(ctx, x + 94, y + 18);
  rug(ctx, x + 26, y + 30, 64, 50, '#c88a2a', '#a86a1c');
  // 원탁
  rect(ctx, x + 36, y + 41, 26, 14, C.woodDark);
  rect(ctx, x + 34, y + 39, 30, 14, C.wood);
  rect(ctx, x + 37, y + 37, 24, 2, C.wood);
  rect(ctx, x + 36, y + 39, 26, 1, C.woodLight);
  plant(ctx, x + 45, y + 38);
  [[22, 44], [70, 44], [46, 30], [28, 60], [64, 60]].forEach(([cx, cy]) => chair(ctx, x + cx, y + cy, '#c4622d'));
  r.seats.forEach((st) => laptop(ctx, st.monitor.x, st.monitor.y, s.litSeats.has(st.id)));
  plant(ctx, x + 2, y + 42);
  plant(ctx, x + 2, y + h - 13);
  plant(ctx, x + w - 12, y + h - 13);
  desk(ctx, x + 18, y + h - 9, 72);
}

function lounge(ctx: Ctx) {
  const r = ROOM_BY_ID.lounge;
  const { x, y, w, h } = r.rect;
  tiles(ctx, x, y, w, h, '#6f8f68', '#678761', 12, '#5c7a56');
  wallFace(ctx, r.rect, 24, '#9fb58f', '#5d7a52');
  [36, 76].forEach((wx) => {
    rect(ctx, x + wx, y + 4, 16, 12, '#f2ede1');
    rect(ctx, x + wx + 1, y + 5, 14, 10, '#a9d8ee');
    rect(ctx, x + wx + 1, y + 11, 14, 4, '#86c17a');
    rect(ctx, x + wx, y + 4, 16, 3, '#e6dcc6');
  });
  rect(ctx, x + 55, y + 5, 18, 10, '#7a5230');
  rect(ctx, x + 56, y + 6, 16, 8, '#7fb7d8');
  rect(ctx, x + 56, y + 10, 16, 4, '#6fae5e');
  bookshelf(ctx, x + 20, y + 16, 10, 20);
  bookshelf(ctx, x + 88, y + 18, 12, 14);
  rug(ctx, x + 30, y + 40, 66, 28, '#7b9a68', '#a9c27f');
  // 소파
  rect(ctx, x + 44, y + 22, 40, 6, '#b5c487');
  rect(ctx, x + 44, y + 28, 40, 9, '#c7d59a');
  rect(ctx, x + 42, y + 24, 3, 13, '#9fae73');
  rect(ctx, x + 83, y + 24, 3, 13, '#9fae73');
  for (let i = 0; i < 3; i++) rect(ctx, x + 45 + i * 13, y + 30, 12, 1, '#dbe5b2');
  // 안락의자
  rect(ctx, x + 32, y + 42, 12, 15, '#b5c487');
  rect(ctx, x + 34, y + 44, 8, 11, '#c7d59a');
  rect(ctx, x + 97, y + 42, 12, 15, '#b5c487');
  rect(ctx, x + 99, y + 44, 8, 11, '#c7d59a');
  desk(ctx, x + 52, y + 48, 24);
  rect(ctx, x + 55, y + 47, 3, 2, C.paper);
  rect(ctx, x + 68, y + 47, 4, 3, '#c0504d');
  plant(ctx, x + 61, y + 42);
  plant(ctx, x + 4, y + 24);
  plant(ctx, x + w - 12, y + 24);
  plant(ctx, x + 4, y + h - 13);
  plant(ctx, x + w - 12, y + h - 13);
  desk(ctx, x + 44, y + h - 12, 38);
}

function frame(ctx: Ctx) {
  // 각 방 둘레의 두꺼운 벽과 밝은 몰딩
  for (const r of ROOMS) {
    const { x, y, w, h } = r.rect;
    ctx.strokeStyle = C.trim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.strokeStyle = C.wallLine;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }
  // 문: 벽을 지우고 복도 바닥으로 잇는다.
  const doors: [number, number, number, number][] = [
    [46, 87, 18, 8], // 리서치실
    [142, 87, 18, 8], // 개발실
    [242, 87, 18, 8], // 터미널실
    [114, 157, 6, 18], // 기획실
    [178, 157, 6, 18], // 휴게실
  ];
  doors.forEach(([dx, dy, dw, dh]) => rect(ctx, dx, dy, dw, dh, C.hall));
}

/** 배경 이미지가 있으면 그 위에, 없으면 코드로 그린 도트 배경 위에 상태를 표시한다. */
export function drawOffice(ctx: Ctx, state: DrawState, background?: HTMLImageElement | null) {
  const sx = ctx.canvas.width / W;
  const sy = ctx.canvas.height / H;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (background) {
    ctx.drawImage(background, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    // 이미지 모드: 실제 작업 중인 자리 모니터에만 불빛을 얹는다.
    for (const r of ROOMS) {
      for (const st of r.seats) {
        if (!st.glow || !state.litSeats.has(st.id)) continue;
        ctx.fillStyle = 'rgba(134, 227, 209, 0.5)';
        ctx.fillRect(st.glow.x, st.glow.y, st.glow.w, st.glow.h);
      }
    }
    if (state.alarm) {
      ctx.fillStyle = 'rgba(255, 75, 62, 0.75)';
      ctx.beginPath();
      ctx.arc(ALARM.x + 1, ALARM.y + 1.5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  rect(ctx, 0, 0, W, H, C.frame);
  rect(ctx, 2, 2, W - 4, 1, C.trimDark);
  rect(ctx, 2, H - 3, W - 4, 1, C.trimDark);
  hall(ctx);
  research(ctx, state);
  dev(ctx, state);
  terminal(ctx, state);
  planning(ctx, state);
  lounge(ctx);
  frame(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
