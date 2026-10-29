import { useEffect, useMemo, useRef, useState } from 'react';
import { AGENT_BY_ID, AGENTS } from '../domain/agents';
import type { AgentId, Task } from '../domain/types';
import { STATUS_LABEL } from '../domain/types';
import { drawOffice } from './draw';
import { H, MEMO_BOARD, pathBetween, ROOMS, W, type Point, type Spot } from './layout';
import { ACTIVITY_LABEL, buildScene, type AgentScene } from './scene';
import { spriteFor } from './sprites';
import { BACKGROUND_URL } from './assets';

interface Props {
  tasks: Task[];
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
}

interface Mover {
  x: number;
  y: number;
  zone: Spot['zone'];
  path: Point[];
  target: Spot | null;
}

const SPEED = 22; // 논리 픽셀/초. 천천히 걷는다.
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

const BADGE: Partial<Record<AgentScene['activity'], string>> = {
  working: '…',
  helping: '+',
  blocked: '!',
  review: '?',
};

export function OfficeView({ tasks, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentRefs = useRef(new Map<AgentId, HTMLButtonElement>());
  const movers = useRef(new Map<AgentId, Mover>());
  const scene = useMemo(() => buildScene(tasks), [tasks]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const memos = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'queued' || t.status === 'blocked' || t.status === 'review')
        .sort((a, b) => (a.status === 'blocked' ? -1 : 0) - (b.status === 'blocked' ? -1 : 0)),
    [tasks],
  );

  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!BACKGROUND_URL) return;
    const img = new Image();
    img.onload = () => setBg(img);
    img.src = BACKGROUND_URL;
  }, []);

  // 배경: 실제 작업 중인 자리만 모니터가 켜진다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // 코드로 그린 배경은 4배로 그려 화면에서 또렷하게 확대한다.
    const width = bg ? bg.naturalWidth : W * 4;
    const height = bg ? bg.naturalHeight : H * 4;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawOffice(
      ctx,
      {
        litSeats: new Set(scene.map((s) => s.seatId).filter((id): id is string => Boolean(id))),
        alarm: tasks.some((t) => t.status === 'blocked'),
      },
      bg,
    );
  }, [scene, tasks, bg]);

  // 목표 자리가 바뀌면 문과 복도를 거쳐 걷는 경로를 만든다.
  useEffect(() => {
    for (const s of scene) {
      const m = movers.current.get(s.agent);
      if (!m) {
        movers.current.set(s.agent, { x: s.spot.x, y: s.spot.y, zone: s.spot.zone, path: [], target: s.spot });
        continue;
      }
      const t = m.target;
      if (t && t.x === s.spot.x && t.y === s.spot.y && t.zone === s.spot.zone) continue;
      m.path = pathBetween({ x: m.x, y: m.y, zone: m.zone }, s.spot);
      m.target = s.spot;
    }
  }, [scene]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const s of sceneRef.current) {
        const m = movers.current.get(s.agent);
        const el = agentRefs.current.get(s.agent);
        if (!m || !el) continue;
        let walking = false;
        if (m.path.length) {
          if (reduce) {
            const end = m.path[m.path.length - 1];
            m.x = end.x;
            m.y = end.y;
            m.path = [];
          } else {
            let budget = SPEED * dt;
            while (budget > 0 && m.path.length) {
              const p = m.path[0];
              const dx = p.x - m.x;
              const dy = p.y - m.y;
              const d = Math.hypot(dx, dy);
              if (d <= budget) {
                m.x = p.x;
                m.y = p.y;
                m.path.shift();
                budget -= d;
              } else {
                m.x += (dx / d) * budget;
                m.y += (dy / d) * budget;
                budget = 0;
              }
            }
            walking = m.path.length > 0;
          }
          if (!m.path.length && m.target) m.zone = m.target.zone;
        }
        // 실제로 작업 중일 때만 살짝 흔들린다.
        const busy = !walking && !reduce && (s.activity === 'working' || s.activity === 'helping');
        const sway = busy && Math.floor(now / 600) % 2 === 0 ? 0.5 : 0;
        const agent = AGENT_BY_ID[s.agent];
        const step = walking && Math.floor(now / 320) % 2 === 0;
        const sprite = spriteFor(agent, step ? 'walk' : 'stand');
        // 걷는 그림이 없으면 아주 작게만 들썩인다.
        const bob = walking && !sprite.hasWalk && step ? -0.6 : 0;
        el.style.left = pct(m.x + sway, W);
        el.style.top = pct(m.y + bob, H);
        el.style.zIndex = String(10 + Math.round(m.y));
        if (el.dataset.src !== sprite.src) {
          el.dataset.src = sprite.src;
          const img = el.querySelector('img');
          if (img) img.src = sprite.src;
        }
        el.dataset.walking = walking ? 'true' : 'false';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="office" aria-label="도트 오피스">
      <canvas ref={canvasRef} width={W} height={H} className="office-bg" aria-hidden="true" />
      {ROOMS.map((r) => (
        <span
          key={r.id}
          className="room-tag"
          style={{ left: pct(r.rect.x + 2, W), top: pct(r.rect.y + 2, H), background: r.tag }}
        >
          {r.label}
        </span>
      ))}
      <div
        className="memo-board"
        style={{
          left: pct(MEMO_BOARD.x, W),
          top: pct(MEMO_BOARD.y, H),
          width: pct(MEMO_BOARD.w, W),
          height: pct(MEMO_BOARD.h, H),
        }}
      >
        <div className="memo-head">대기열 {memos.length}</div>
        <ul className="memo-list">
          {memos.slice(0, 3).map((t) => (
            <li key={t.id} className={`memo memo-${t.status}`}>
              <span className="memo-mark">{t.status === 'blocked' ? '!' : t.status === 'review' ? '?' : '□'}</span>
              <span className="memo-text">{t.title}</span>
            </li>
          ))}
          {memos.length > 3 && <li className="memo memo-more">+{memos.length - 3}건 더</li>}
          {memos.length === 0 && <li className="memo memo-more">비어 있음</li>}
        </ul>
      </div>
      {AGENTS.map((a) => {
        const s = scene.find((x) => x.agent === a.id);
        if (!s) return null;
        const badge = BADGE[s.activity];
        const isSel = selected === a.id;
        const label = `${a.name}, ${ACTIVITY_LABEL[s.activity]}${s.task ? `: ${s.task.title}` : ''}`;
        const sprite = spriteFor(a, 'stand');
        return (
          <button
            key={a.id}
            type="button"
            className={`agent${isSel ? ' is-selected' : ''}${sprite.art ? ' is-art' : ''}`}
            data-activity={s.activity}
            ref={(el) => {
              if (!el) {
                agentRefs.current.delete(a.id);
                return;
              }
              // 위치는 애니메이션 루프가 직접 갱신한다. 처음 한 번만 자리를 잡아 둔다.
              if (!el.style.left) {
                el.style.left = pct(s.spot.x, W);
                el.style.top = pct(s.spot.y, H);
              }
              agentRefs.current.set(a.id, el);
            }}
            onClick={() => onSelect(a.id)}
            aria-label={label}
            aria-pressed={isSel}
          >
            <img src={sprite.src} alt="" draggable={false} />
            {badge && !isSel && <span className="agent-badge">{badge}</span>}
            {isSel && (
              <span className="bubble" role="status">
                <b>[{ACTIVITY_LABEL[s.activity]}]</b> {a.name}
                {s.task && (
                  <>
                    <br />
                    {s.task.title}
                    {s.activity === 'waiting' && s.open > 1 ? ` 외 ${s.open - 1}건` : ''}
                    {a.id === 'mina' && ` (${STATUS_LABEL[s.task.status]})`}
                  </>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
