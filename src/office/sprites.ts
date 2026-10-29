import type { Agent } from '../domain/agents';
import { characterUrl } from './assets';

export const SPRITE_W = 10;
export const SPRITE_H = 14;

const PERSON_TOP = [
  '...hhhh...',
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '..sesses..',
  '..ssssss..',
  '...ssss...',
  '.ccaaaacc.',
  'cccccccccc',
  'cccccccccc',
  'sccccccccs',
  '.pppppppp.',
];
const PERSON_STAND = ['.ppp..ppp.', '.kkk..kkk.'];
const PERSON_WALK = ['ppp....ppp', 'kk......kk'];

const BOT_TOP = [
  '....aa....',
  '....hh....',
  '.hhhhhhhh.',
  '.hddddddh.',
  '.hdaddadh.',
  '.hddddddh.',
  '.hhhhhhhh.',
  '..hhhhhh..',
  '.cccccccc.',
  'cccaccccc.',
  'hccccccccc',
  '.cccccccc.',
];
const BOT_STAND = ['.hh....hh.', '.kk....kk.'];
const BOT_WALK = ['hh......hh', 'kk......kk'];

export type Frame = 'stand' | 'walk';

function rows(agent: Agent, frame: Frame): string[] {
  if (agent.sprite === 'bot') return [...BOT_TOP, ...(frame === 'walk' ? BOT_WALK : BOT_STAND)];
  return [...PERSON_TOP, ...(frame === 'walk' ? PERSON_WALK : PERSON_STAND)];
}

function colorMap(agent: Agent): Record<string, string> {
  const p = agent.palette;
  return {
    h: p.hair,
    s: p.skin,
    e: '#1d1620',
    c: p.shirt,
    a: p.accent,
    p: p.pants,
    k: '#241c18',
    d: '#1f2b33',
  };
}

const cache = new Map<string, string>();

/** 에이전트 스프라이트를 PNG data URL로 만든다. 1px 외곽선을 붙여 배경 위에서도 또렷하게 한다. */
export function spriteUrl(agent: Agent, frame: Frame): string {
  const key = `${agent.id}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W + 2;
  canvas.height = SPRITE_H + 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const grid = rows(agent, frame);
  const colors = colorMap(agent);
  const filled = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== '.';
  ctx.fillStyle = 'rgba(30, 18, 12, 0.85)';
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (!filled(x, y)) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!filled(x + dx, y + dy)) ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1);
      }
    }
  }
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const k = grid[y][x];
      if (k === '.') continue;
      ctx.fillStyle = colors[k] ?? '#ff00ff';
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export interface SpriteInfo {
  src: string;
  /** 사용자가 넣은 그림이면 true. 크기와 렌더링 방식이 달라진다. */
  art: boolean;
  /** 걷는 그림이 따로 있는지 */
  hasWalk: boolean;
}

/** 넣어둔 캐릭터 그림이 있으면 그것을, 없으면 코드로 그린 도트를 쓴다. */
export function spriteFor(agent: Agent, frame: Frame): SpriteInfo {
  const art = characterUrl(agent.id, frame);
  if (art) {
    return { src: art, art: true, hasWalk: characterUrl(agent.id, 'walk') !== characterUrl(agent.id, 'stand') };
  }
  return { src: spriteUrl(agent, frame), art: false, hasWalk: true };
}
