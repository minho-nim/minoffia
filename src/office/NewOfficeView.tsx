// New Office 화면(v0.6.0, 소유자 2026-11-04 확정 디자인): 공간형(업무 기능별 공유 공간)·조직형(AI 조직 네트워크).
// 방 그림은 확정 디자인에서 잘라 낸 원본(src/assets/office-new), 글자·숫자·사람·연결선은 실제 데이터로 그린다.
// 업무 데이터·승인 흐름은 기존 화면과 같은 것을 쓰고, 이 파일은 보여 주기만 한다.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_BY_ID, AGENTS } from '../domain/agents';
import type { AgentId, Task } from '../domain/types';
import type { AgentAssignment } from '../domain/workflow-types';
import { loadNewView, saveNewView, type NewView } from '../domain/uiMode';
import { buildScene } from './scene';
import { activeCount, ORG_LINKS, ORG_NODES, SPACES, SPACE_BY_ID, spaceOfScene, spaceStats, statusText, teamOf, VIEW, type SpaceId } from './newOffice';
import planningImg from '../assets/office-new/planning.webp';
import researchImg from '../assets/office-new/research.webp';
import developmentImg from '../assets/office-new/development.webp';
import hubImg from '../assets/office-new/hub.webp';
import designImg from '../assets/office-new/design.webp';
import qualityImg from '../assets/office-new/quality.webp';
import deployImg from '../assets/office-new/deploy.webp';

const ROOM_IMG: Record<SpaceId, string> = { planning: planningImg, research: researchImg, development: developmentImg, hub: hubImg, design: designImg, quality: qualityImg, deploy: deployImg };

/** 조직형 아이콘(디자인의 동그라미 아이콘, 글자로). 새 AI는 이름 첫 글자 */
const ICON: Partial<Record<AgentId, { bg: string; fg: string; t: string }>> = {
  mina: { bg: '#6d5fd8', fg: '#fff', t: '미' },
  claude: { bg: '#d97757', fg: '#fff', t: 'C' },
  codex: { bg: '#0f1a1f', fg: '#7fe0b8', t: '◎' },
  grok: { bg: '#0b0b0d', fg: '#fff', t: '/' },
  studioA: { bg: 'linear-gradient(135deg,#7cc8f8,#c48af8)', fg: '#1d1d2e', t: 'A' },
  studioB: { bg: 'linear-gradient(135deg,#f8d36a,#f2956b)', fg: '#2a1a10', t: 'B' },
  ci: { bg: '#f2f2f2', fg: '#c0392b', t: 'CI' },
};

const pctX = (x: number) => `${((x - VIEW.x) / VIEW.w) * 100}%`;
const pctY = (y: number) => `${((y - VIEW.y) / VIEW.h) * 100}%`;
const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  left: pctX(r.x),
  top: pctY(r.y),
  width: `${(r.w / VIEW.w) * 100}%`,
  height: `${(r.h / VIEW.h) * 100}%`,
});

/**
 * 캐릭터 그림(v0.6.1, 소유자 캐릭터 아트 v3.6): src/assets/office-new/characters/<AI id>.webp 가 있으면 그 그림,
 * 없으면 글자 동그라미. 새 그림은 파일만 넣으면 붙는다(scripts가 아니라 같은 이름 규칙).
 */
const ART = import.meta.glob('../assets/office-new/characters/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const artOf = (id: string): string | undefined => ART[`../assets/office-new/characters/${id}.webp`];

function Avatar({ id, dim = false, size }: { id: AgentId; dim?: boolean; size?: string }) {
  const a = AGENT_BY_ID[id];
  const art = artOf(id);
  const icon = ICON[id] ?? { bg: '#3a4352', fg: '#fff', t: (a?.name ?? '?').slice(0, 1) };
  const sz = size ? { width: size, height: size } : {};
  if (art)
    return <span className={`no-avatar is-art${dim ? ' is-dim' : ''}`} style={{ backgroundImage: `url(${art})`, ...sz }} aria-hidden="true" />;
  return (
    <span className={`no-avatar${dim ? ' is-dim' : ''}`} style={{ background: icon.bg, color: icon.fg, ...sz }} aria-hidden="true">
      {icon.t}
    </span>
  );
}

/** 공간형 방 안에 서 있는 캐릭터(그림이 있으면 전신, 없으면 동그라미) */
function Figure({ id, dim }: { id: AgentId; dim: boolean }) {
  const art = artOf(id);
  if (!art) return <Avatar id={id} dim={dim} />;
  return <img className={`no-figure${dim ? ' is-dim' : ''}`} src={art} alt="" draggable={false} />;
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}

type Sel = { kind: 'space'; id: SpaceId } | { kind: 'agent'; id: AgentId } | null;

interface Props {
  tasks: Task[];
  assignments?: AgentAssignment[];
  leave?: AgentId[];
  /** 내가 손댈 일 수(승인·답 대기) */
  pending: number;
  /** 에이전트 탭의 자세한 화면 열기(기존 기능) */
  onSelectAgent: (id: AgentId) => void;
  onOpenTask: (taskId: string) => void;
  /** 위쪽 막대에서 공간형·조직형을 고를 때(없으면 사무실 안의 전환 버튼) */
  view?: NewView;
  /** 넓은 화면에서 상세 칸을 사무실 오른쪽에 늘 붙여 둔다(New 화면 전체 배치) */
  docked?: boolean;
}

export function NewOfficeView({ tasks, assignments = [], leave = [], pending, onSelectAgent, onOpenTask, view: viewProp, docked = false }: Props) {
  const [ownView, setView] = useState<NewView>(() => loadNewView());
  const view = viewProp ?? ownView;
  const [sel, setSel] = useState<Sel>(null);
  const scene = useMemo(() => buildScene(tasks, assignments), [tasks, assignments]);
  const sceneOf = useMemo(() => new Map(scene.map((s) => [s.agent, s])), [scene]);
  const stats = useMemo(() => Object.fromEntries(SPACES.map((s) => [s.id, spaceStats(s.id, tasks, scene, leave)])) as Record<SpaceId, ReturnType<typeof spaceStats>>, [tasks, scene, leave]);
  const pick = (v: NewView) => {
    setView(v);
    saveNewView(v);
  };

  // 확대·축소·이동(휴대폰은 두 손가락, 컴퓨터는 Ctrl+휠·끌기·버튼)
  const rootRef = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const zRef = useRef(z);
  zRef.current = z;
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; s: number; x: number; y: number; cx: number; cy: number; px: number; py: number } | null>(null);
  const moved = useRef(false);
  const clampZ = (s: number, x: number, y: number) => {
    const el = rootRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const ns = Math.min(3, Math.max(1, s));
    return { s: ns, x: Math.min(0, Math.max(w - w * ns, x)), y: Math.min(0, Math.max(h - h * ns, y)) };
  };
  const zoomAt = (s: number, cx: number, cy: number) => {
    const c = zRef.current;
    const ns = Math.min(3, Math.max(1, s));
    setZ(clampZ(ns, cx - ((cx - c.x) * ns) / c.s, cy - ((cy - c.y) * ns) / c.s));
  };
  // 휴대폰처럼 좁으면 처음부터 조금 크게(허브 가운데), 무리하게 작게 보이지 않게
  useEffect(() => {
    const el = rootRef.current;
    if (!el || el.clientWidth >= 600) return;
    const s = 1.5;
    setZ(clampZ(s, el.clientWidth / 2 - (el.clientWidth / 2) * s, el.clientHeight / 2 - (el.clientHeight / 2) * s));
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zRef.current.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const local = (e: RPointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startGesture = () => {
    const [a, b] = [...pts.current.values()];
    const c = zRef.current;
    gesture.current = b
      ? { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: c.s, x: c.x, y: c.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, px: 0, py: 0 }
      : { d: 0, s: c.s, x: c.x, y: c.y, cx: 0, cy: 0, px: a.x, py: a.y };
  };
  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('.no-tools')) return;
    pts.current.set(e.pointerId, local(e));
    if (pts.current.size === 1) moved.current = false;
    startGesture();
  };
  const onMove = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId) || !gesture.current) return;
    pts.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const [a, b] = [...pts.current.values()];
    if (b && g.d) {
      const ns = Math.min(3, Math.max(1, (g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d));
      setZ(clampZ(ns, g.cx - ((g.cx - g.x) * ns) / g.s, g.cy - ((g.cy - g.y) * ns) / g.s));
      moved.current = true;
    } else if (!b && zRef.current.s > 1) {
      const dx = a.x - g.px;
      const dy = a.y - g.py;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
      if (moved.current) setZ(clampZ(g.s, g.x + dx, g.y + dy));
    }
  };
  const onUp = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size) startGesture();
    else gesture.current = null;
  };

  // 휴대폰은 아래에서 올라오는 시트, 넓은 화면은 사무실 오른쪽 칸
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1039px)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(max-width: 1039px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const choose = (next: Sel) => {
    if (moved.current) return; // 끌기·확대 뒤의 손 떼기는 고르기가 아니다
    setSel((cur) => (cur && next && cur.kind === next.kind && cur.id === next.id ? null : next));
  };
  const open = (id: string) => {
    setSel(null);
    onOpenTask(id);
  };

  const onLeave = (id: AgentId) => leave.includes(id);

  const dock = docked && !narrow;
  const shown: Sel = sel ?? (dock ? { kind: 'space', id: 'hub' } : null);
  const detail = shown && (
    <section className={`no-detail${narrow ? ' is-sheet' : ''}${dock ? ' is-docked' : ''}`} role={dock ? 'region' : 'dialog'} aria-label={shown.kind === 'space' ? SPACE_BY_ID[shown.id].name : AGENT_BY_ID[shown.id]?.name}>
      {sel && (
        <button type="button" className="no-close" onClick={() => setSel(null)} aria-label="닫기">
          ×
        </button>
      )}
      {shown.kind === 'space' ? (
        <SpaceDetail id={shown.id} st={stats[shown.id]} leave={leave} onAgent={(id) => setSel({ kind: 'agent', id })} onOpen={open} />
      ) : (
        <AgentDetail id={shown.id} tasks={tasks} activity={sceneOf.get(shown.id)?.activity} away={onLeave(shown.id)} onOpen={open} onMore={() => onSelectAgent(shown.id)} />
      )}
    </section>
  );

  const layer: CSSProperties = { transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` };
  const canvas = (
    <div className="office office-new" ref={rootRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: z.s > 1 ? 'none' : 'pan-y' }}>
      <div className="no-layer" style={layer}>
        {view === 'space' ? (
          <SpaceScene stats={stats} sceneSpaces={scene.filter((s) => !onLeave(s.agent)).map((s) => ({ id: s.agent, space: spaceOfScene(s), resting: s.activity === 'resting' }))} sel={sel} choose={choose} />
        ) : (
          <OrgScene stats={stats} tasks={tasks} active={activeCount(scene, leave)} pending={pending} leave={leave} sceneOf={sceneOf} sel={sel} choose={choose} />
        )}
      </div>
      <div className="no-tools">
        {!viewProp && <div className="no-switch" role="tablist" aria-label="New Office 보기">
          <button type="button" role="tab" aria-selected={view === 'space'} onClick={() => pick('space')}>
            공간형
          </button>
          <button type="button" role="tab" aria-selected={view === 'org'} onClick={() => pick('org')}>
            조직형
          </button>
        </div>}
        <div className="no-zoom">
          <button type="button" onClick={() => zoomAt(z.s * 1.25, (rootRef.current?.clientWidth ?? 0) / 2, (rootRef.current?.clientHeight ?? 0) / 2)} aria-label="확대">
            +
          </button>
          <button type="button" onClick={() => zoomAt(z.s / 1.25, (rootRef.current?.clientWidth ?? 0) / 2, (rootRef.current?.clientHeight ?? 0) / 2)} aria-label="축소">
            −
          </button>
          <button type="button" onClick={() => setZ({ s: 1, x: 0, y: 0 })} aria-label="전체 보기">
            ⤢
          </button>
        </div>
      </div>
      {detail && !dock && (narrow ? createPortal(<><div className="no-sheet-backdrop" onClick={() => setSel(null)} aria-hidden="true" />{detail}</>, document.body) : detail)}
    </div>
  );
  return dock ? (
    <div className="nx-office">
      {canvas}
      {detail}
    </div>
  ) : (
    canvas
  );
}

function SpaceScene({
  stats,
  sceneSpaces,
  sel,
  choose,
}: {
  stats: Record<SpaceId, ReturnType<typeof spaceStats>>;
  sceneSpaces: { id: AgentId; space: SpaceId; resting: boolean }[];
  sel: Sel;
  choose: (s: Sel) => void;
}) {
  const hub = SPACE_BY_ID.hub.anchor;
  return (
    <>
      <svg className="no-links" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="none" aria-hidden="true">
        {SPACES.filter((s) => s.id !== 'hub').map((s) => (
          <line key={s.id} x1={hub.x} y1={hub.y} x2={s.anchor.x} y2={s.anchor.y} className={stats[s.id].running.length ? 'is-live' : ''} />
        ))}
      </svg>
      {SPACES.map((s) => {
        const st = stats[s.id];
        const here = sceneSpaces.filter((a) => a.space === s.id);
        const on = sel?.kind === 'space' && sel.id === s.id;
        return (
          <div key={s.id}>
            <button type="button" className={`no-room${on ? ' is-on' : ''}`} style={box(s.img)} onClick={() => choose({ kind: 'space', id: s.id })} aria-label={`${s.name} 공간 보기`}>
              <img src={ROOM_IMG[s.id]} alt="" draggable={false} />
              {here.length > 0 && (
                <span className="no-people">
                  {here.map((a) => (
                    <span key={a.id} title={AGENT_BY_ID[a.id]?.name}>
                      <Figure id={a.id} dim={a.resting} />
                    </span>
                  ))}
                </span>
              )}
            </button>
            {s.id !== 'hub' && (
              <button type="button" className={`no-label${on ? ' is-on' : ''}${st.blocked.length ? ' has-alert' : ''}`} style={{ left: pctX(s.label.x), top: pctY(s.label.y) }} onClick={() => choose({ kind: 'space', id: s.id })}>
                <b>{s.name}</b>
                <span className="no-nums">
                  <span>
                    AI 인원<i>{st.present.length}</i>
                  </span>
                  <span>
                    진행 중<i>{st.running.length}</i>
                  </span>
                  <span>
                    대기<i>{st.waiting.length}</i>
                  </span>
                  <span>
                    완료<i>{st.done}</i>
                  </span>
                  {st.blocked.length > 0 && (
                    <span className="is-alert">
                      막힘<i>{st.blocked.length}</i>
                    </span>
                  )}
                </span>
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function OrgScene({
  stats,
  tasks,
  active,
  pending,
  leave,
  sceneOf,
  sel,
  choose,
}: {
  stats: Record<SpaceId, ReturnType<typeof spaceStats>>;
  tasks: Task[];
  active: number;
  pending: number;
  leave: AgentId[];
  sceneOf: Map<AgentId, ReturnType<typeof buildScene>[number]>;
  sel: Sel;
  choose: (s: Sel) => void;
}) {
  const center = (id: SpaceId) => ({ x: ORG_NODES[id].x + ORG_NODES[id].w / 2, y: ORG_NODES[id].y + ORG_NODES[id].h / 2 });
  const hub = center('hub');
  const cards: [string, string | number][] = [
    ['Total AI', AGENTS.length],
    ['Active AI', active],
    ['Tasks in Progress', tasks.filter((t) => t.status === 'in_progress').length],
    ['Pending Approvals', pending],
  ];
  const deploy = stats.deploy;
  return (
    <>
      <div className="no-cards" style={box({ x: VIEW.x + 14, y: VIEW.y + 52, w: VIEW.w - 28, h: 62 })}>
        {cards.map(([k, v]) => (
          <div key={k} className="no-card">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <p className="no-org-title" style={{ left: pctX(VIEW.x + 18), top: pctY(VIEW.y + 128) }}>
        AI 조직 네트워크
      </p>
      <svg className="no-links is-org" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="none" aria-hidden="true">
        {ORG_LINKS.map((id) => {
          const c = center(id);
          const mx = (hub.x + c.x) / 2;
          return <path key={id} d={`M ${hub.x} ${hub.y} C ${mx} ${hub.y}, ${mx} ${c.y}, ${c.x} ${c.y}`} className={stats[id].running.length ? 'is-live' : ''} />;
        })}
      </svg>
      {(Object.keys(ORG_NODES) as SpaceId[]).map((id) => {
        const members = AGENTS.filter((a) => teamOf(a) === id);
        const on = sel?.kind === 'space' && sel.id === id;
        return (
          <div key={id} className={`no-node${on ? ' is-on' : ''}${id === 'hub' ? ' is-hub' : ''}`} style={box(ORG_NODES[id])}>
            <button type="button" className="no-node-name" onClick={() => choose({ kind: 'space', id })}>
              {id === 'hub' ? 'Central Hub' : SPACE_BY_ID[id].name}
            </button>
            <div className="no-node-people">
              {members.map((a) => (
                <button type="button" key={a.id} className={`no-member${sel?.kind === 'agent' && sel.id === a.id ? ' is-on' : ''}`} onClick={() => choose({ kind: 'agent', id: a.id })} title={`${a.name} · ${statusText(sceneOf.get(a.id)?.activity, leave.includes(a.id))}`}>
                  <Avatar id={a.id} dim={leave.includes(a.id)} />
                  <span>{a.name.replace(/\s*\(.*\)/, '')}</span>
                </button>
              ))}
              {id === 'deploy' && (
                <span className="no-deploy" title="올리기·배포 단계의 업무(실제 기록)">
                  <span>
                    대기<i>{deploy.waiting.length + deploy.blocked.length}</i>
                  </span>
                  <span>
                    진행<i>{deploy.running.length}</i>
                  </span>
                  <span>
                    완료<i>{deploy.done}</i>
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="no-dir" style={box({ x: VIEW.x + 14, y: 408, w: 285, h: VIEW.y + VIEW.h - 408 - 10 })}>
        <p>AI 디렉터리</p>
        <table>
          <thead>
            <tr>
              <th>AI 이름</th>
              <th>역할</th>
              <th>팀</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={a.id} onClick={() => choose({ kind: 'agent', id: a.id })} className={sel?.kind === 'agent' && sel.id === a.id ? 'is-on' : ''}>
                <td>
                  <Avatar id={a.id} dim={leave.includes(a.id)} />
                  {a.name.replace(/\s*\(.*\)/, '')}
                </td>
                <td>{a.role}</td>
                <td>{SPACE_BY_ID[teamOf(a)].name}</td>
                <td>{statusText(sceneOf.get(a.id)?.activity, leave.includes(a.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TaskList({ items, onOpen }: { items: Task[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="no-tasks">
      {items.slice(0, 5).map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onOpen(t.id)}>
            › {t.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SpaceDetail({ id, st, leave, onAgent, onOpen }: { id: SpaceId; st: ReturnType<typeof spaceStats>; leave: AgentId[]; onAgent: (id: AgentId) => void; onOpen: (id: string) => void }) {
  const s = SPACE_BY_ID[id];
  const team = AGENTS.filter((a) => teamOf(a) === id);
  return (
    <>
      <h3>
        {s.name} <small>{s.ko}</small>
      </h3>
      {team.length > 0 && (
        <div className="no-row">
          <span>팀</span>
          <span className="no-team">
            {team.map((a) => (
              <button type="button" key={a.id} onClick={() => onAgent(a.id)} title={a.name}>
                <Avatar id={a.id} dim={leave.includes(a.id)} />
              </button>
            ))}
          </span>
        </div>
      )}
      <div className="no-row">
        <span>지금 있는 AI</span>
        <b className="no-pill">{st.present.length}</b>
      </div>
      {st.present.length > 0 && <p className="no-sub">{st.present.map((a) => AGENT_BY_ID[a]?.name).join(', ')}</p>}
      <div className="no-group">
        <p>진행 중 ({st.running.length})</p>
        <TaskList items={st.running} onOpen={onOpen} />
      </div>
      <div className="no-group is-alert">
        <p>막힘 ({st.blocked.length})</p>
        <TaskList items={st.blocked} onOpen={onOpen} />
      </div>
      <div className="no-group is-wait">
        <p>대기 ({st.waiting.length})</p>
        <TaskList items={st.waiting} onOpen={onOpen} />
      </div>
      <div className="no-group is-done">
        <p>완료 ({st.done})</p>
      </div>
      {st.recent.length > 0 && (
        <div className="no-recent">
          <p>최근 활동</p>
          {st.recent.map((t) => (
            <button type="button" key={t.id} onClick={() => onOpen(t.id)}>
              <Avatar id={t.assignee} />
              <span>
                <b>{AGENT_BY_ID[t.assignee]?.name ?? t.assignee}</b> <small>{ago(t.updatedAt)}</small>
                <br />
                {t.title}
              </span>
            </button>
          ))}
        </div>
      )}
      {id === 'hub' && <p className="no-sub">미니엉이 요청을 접수하고 각 공간으로 나눕니다. 업무 요청은 대화 메뉴에서 합니다.</p>}
    </>
  );
}

function AgentDetail({ id, tasks, activity, away, onOpen, onMore }: { id: AgentId; tasks: Task[]; activity: ReturnType<typeof buildScene>[number]['activity'] | undefined; away: boolean; onOpen: (id: string) => void; onMore: () => void }) {
  const a = AGENT_BY_ID[id];
  if (!a) return null;
  const mine = tasks.filter((t) => t.assignee === id && t.status !== 'done');
  const st = statusText(activity, away);
  return (
    <>
      <h3>AI 상태</h3>
      <div className="no-who">
        <Avatar id={id} dim={away} size="2.4em" />
        <b>{a.name}</b>
      </div>
      <div className="no-row">
        <span>역할</span>
        <span>{a.role}</span>
      </div>
      <div className="no-row">
        <span>소속 팀</span>
        <span>{SPACE_BY_ID[teamOf(a)].name}</span>
      </div>
      <div className="no-row">
        <span>현재 상태</span>
        <span className={`no-state is-${away ? 'leave' : activity ?? 'resting'}`}>{st}</span>
      </div>
      <div className="no-row">
        <span>하루 상한</span>
        <span>{a.dailyCap === null ? '없음' : `${a.dailyCap}회`}</span>
      </div>
      <div className="no-group">
        <p>담당 업무 ({mine.length})</p>
        <TaskList items={mine} onOpen={onOpen} />
      </div>
      <button type="button" className="no-more" onClick={onMore}>
        에이전트 탭에서 자세히
      </button>
    </>
  );
}
