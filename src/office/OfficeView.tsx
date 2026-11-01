import { useEffect, useMemo, useRef, useState } from 'react';
import { AGENT_BY_ID, AGENTS } from '../domain/agents';
import type { AgentId, Task } from '../domain/types';
import type { AgentAssignment, WorkflowData } from '../domain/workflow-types';
import { STATUS_LABEL } from '../domain/types';
import { drawOffice } from './draw';
import { EXIT, H, MEMO_BOARD, pathBetween, ROOMS, W, type Point, type Spot } from './layout';
import { ACTIVITY_LABEL, buildScene } from './scene';
import { badgeFor } from './marks';
import { speechFor } from './speech';
import { spriteFor } from './sprites';
import { BACKGROUND_URL } from './assets';

interface Props {
  tasks: Task[];
  /** PM이 배정한 작업. 담당 AI 캐릭터 위치에 반영한다. */
  assignments?: AgentAssignment[];
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
  /** 승인·답을 기다리는 말풍선(업무 단계로만 정함). 없으면 말풍선 없이 표시만 */
  workflow?: WorkflowData;
  /** 말풍선이 있는 캐릭터를 누르면 그 업무 카드를 연다 */
  onOpenTask?: (taskId: string) => void;
  /** 휴가 중인 AI: 아래 문으로 나가 사라진다(v0.4.39) */
  leave?: AgentId[];
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

export function OfficeView({ tasks, assignments = [], selected, onSelect, workflow, onOpenTask, leave = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentRefs = useRef(new Map<AgentId, HTMLButtonElement>());
  const movers = useRef(new Map<AgentId, Mover>());
  const leaveKey = leave.join(',');
  // 휴가 중인 AI는 자리 대신 아래 출입문으로 간다(도착하면 사라짐).
  const scene = useMemo(
    () => buildScene(tasks, assignments).map((s) => (leaveKey.split(',').includes(s.agent) ? { ...s, spot: { ...EXIT, zone: 'corridor' as const }, activity: 'resting' as const } : s)),
    [tasks, assignments, leaveKey],
  );
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const speech = useMemo(() => (workflow ? speechFor(tasks, workflow) : new Map()), [tasks, workflow]);
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
  /** 대기열 메모 펼침(v0.4.33): '대기열 N'이나 '+N건 더'를 누르면 전체 목록, 업무를 누르면 업무 카드로 */
  const [memoOpen, setMemoOpen] = useState(false);
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

  // 오피스가 화면 밖이면 걷기를 멈춘다. 휴대폰에서 목록을 보다 올라와도 걷는 모습이 보인다.
  const visibleRef = useRef(true);
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      visibleRef.current = e.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // 동작 줄이기 설정이어도 이동 경로는 보여 준다(순간 이동하면 누가 어디로 갔는지 알 수 없다). 흔들림만 끈다.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = visibleRef.current ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      for (const s of sceneRef.current) {
        const m = movers.current.get(s.agent);
        const el = agentRefs.current.get(s.agent);
        if (!m || !el) continue;
        let walking = false;
        if (m.path.length) {
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
        // 휴가: 문에 닿으면 사라진다. 돌아오면 문에서 다시 보인다.
        const gone = leaveRef.current.includes(s.agent) && !walking && m.x === EXIT.x && m.y === EXIT.y;
        el.classList.toggle('is-away', gone);
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
        className={`memo-board${memoOpen ? ' is-open' : ''}`}
        style={{
          left: pct(MEMO_BOARD.x, W),
          top: pct(MEMO_BOARD.y, H),
          width: pct(MEMO_BOARD.w, W),
          height: memoOpen ? undefined : pct(MEMO_BOARD.h, H),
        }}
      >
        <button type="button" className="memo-head" aria-expanded={memoOpen} onClick={() => setMemoOpen((o) => !o)} disabled={!memos.length}>
          대기열 {memos.length}
        </button>
        <ul className="memo-list">
          {(memoOpen ? memos : memos.slice(0, 3)).map((t) => (
            <li key={t.id} className={`memo memo-${t.status}`}>
              <button type="button" className="memo-btn" onClick={() => onOpenTask?.(t.id)} title="업무 카드 보기">
                <span className="memo-mark">{t.status === 'blocked' ? '!' : t.status === 'review' ? '?' : '□'}</span>
                <span className="memo-text">{t.title}</span>
              </button>
            </li>
          ))}
          {!memoOpen && memos.length > 3 && (
            <li className="memo memo-more">
              <button type="button" className="memo-btn" onClick={() => setMemoOpen(true)}>
                +{memos.length - 3}건 더
              </button>
            </li>
          )}
          {memoOpen && (
            <li className="memo memo-more">
              <button type="button" className="memo-btn" onClick={() => setMemoOpen(false)}>
                접기
              </button>
            </li>
          )}
          {memos.length === 0 && <li className="memo memo-more">비어 있음</li>}
        </ul>
      </div>
      {AGENTS.map((a) => {
        const s = scene.find((x) => x.agent === a.id);
        if (!s) return null;
        const say = leave.includes(a.id) ? undefined : speech.get(a.id);
        const talking = say && say.kind !== 'busy';
        const sayTask = say ? tasks.find((t) => t.id === say.taskId) : undefined;
        const badge = say?.kind === 'busy' ? say.text : talking ? undefined : badgeFor(s);
        const isSel = selected === a.id;
        const label = `${a.name}, ${ACTIVITY_LABEL[s.activity]}${s.task ? `: ${s.task.title}` : ''}${say ? `. ${say.label}` : ''}`;
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
            onClick={() => {
              onSelect(a.id);
              if (talking) onOpenTask?.(say.taskId);
            }}
            aria-label={label}
            aria-pressed={isSel}
          >
            <img src={sprite.src} alt="" draggable={false} />
            {badge && !isSel && <span className="agent-badge">{badge}</span>}
            {talking && !isSel && (
              <span className="agent-speech" data-kind={say.kind}>
                {say.text}
              </span>
            )}
            {isSel && (
              // 누르면: 표시(단계[표시] 또는 [상태]) 이름 / 무슨 뜻인지 / 어느 업무인지
              <span className="bubble" role="status">
                <b>{say ? say.text : badge ?? `[${ACTIVITY_LABEL[s.activity]}]`}</b> {a.name}
                {say ? (
                  <>
                    <br />
                    {say.label}
                    {sayTask && (
                      <>
                        <br />
                        <span className="bubble-task">{sayTask.title}</span>
                      </>
                    )}
                  </>
                ) : (
                  s.task && (
                    <>
                      <br />
                      {badge && <>{ACTIVITY_LABEL[s.activity]} · </>}
                      <span className="bubble-task">{s.task.title}</span>
                      {s.activity === 'waiting' && s.open > 1 ? ` 외 ${s.open - 1}건` : ''}
                      {a.id === 'mina' && ` (${STATUS_LABEL[s.task.status]})`}
                    </>
                  )
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
