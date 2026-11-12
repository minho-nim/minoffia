// 관계 지도 화면(v0.6.71): 줄 보기(기본) / 그물 보기. floorplan처럼 점 무늬 바탕 + 흰 카드 + 설명 칸.
// 그물 보기는 옵시디언처럼 점을 끌면 이어진 점이 따라오고 놓으면 제자리로 돌아간다(움직이는 동안만 계산).
import { useEffect, useMemo, useRef, useState } from 'react';
import { toSkillView } from '../domain/skills';
import { relLevel, relNet, type RelEdge, type RelGo, type RelInput, type RelNode, type RelOpen } from '../domain/relation';

/** 그물 보기 점 종류: 색(앱 토큰)·이름·크기 */
export type NetStyle = Record<string, { color: string; name: string; size: number }>;
const REL_STYLE: NetStyle = {
  proj: { color: '--accent', name: '프로젝트', size: 7 },
  hub: { color: '--ink', name: '기본 스킬 묶음', size: 12 },
  cat: { color: '--muted', name: '스킬 분류', size: 9 },
  skill: { color: '--info', name: '스킬', size: 5 },
  mcp: { color: '--warn', name: 'MCP', size: 6 },
};

export function RelationMap({ input, focus, focusName }: { input: RelInput; focus?: string; focusName?: string }) {
  const [view, setView] = useState<'line' | 'net'>('line');
  const net = useMemo(() => relNet(input), [input]);
  return (
    <div className="rel">
      <div className="rel-top">
        <span className="small muted">프로젝트 {input.projects.length} · 스킬 {input.skills.length}</span>
        <div className="seg" role="group" aria-label="보기 방식">
          {(['line', 'net'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'line' ? '줄' : '그물'}
            </button>
          ))}
        </div>
      </div>
      {view === 'line' ? <LineView input={input} focus={focus} focusName={focusName} /> : <NetView spec={net} style={REL_STYLE} focus={focus ? `p:${focus}` : undefined} />}
    </div>
  );
}

// ── 줄 보기 ──
function LineView({ input, focus, focusName }: { input: RelInput; focus?: string; focusName?: string }) {
  const startPath: RelGo[] = focus ? [{ t: 'one', p: focus }] : [];
  const [path, setPath] = useState<RelGo[]>(startPath);
  const [sel, setSel] = useState<string | null>(null);
  const [kind, setKind] = useState<'skill' | 'mcp' | 'both'>('skill');
  const [open, setOpen] = useState<RelOpen>({ common: false, cats: [] });
  const here = path[path.length - 1] ?? null;
  const level = useMemo(() => relLevel(input, here, kind, open), [input, here, kind, open]);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const name = (g: RelGo) => (g.t === 'cat' ? g.c : g.t === 'mcp' ? 'MCP' : g.t === 'proj' ? '프로젝트' : input.projects.find((p) => p.id === g.p)?.name ?? '');
  const go = (g: RelGo) => {
    setPath((p) => [...p, g]);
    setSel(null);
    setOpen({ common: false, cats: [] });
  };
  const back = (i: number) => {
    setPath((p) => p.slice(0, i));
    setSel(null);
    setOpen({ common: false, cats: [] });
  };
  const press = (n: RelNode) => {
    if (n.toggle) {
      setOpen((o) => (n.toggle === 'common' ? { ...o, common: !o.common } : { ...o, cats: o.cats.includes(n.toggle!.slice(4)) ? o.cats.filter((c) => c !== n.toggle!.slice(4)) : [...o.cats, n.toggle!.slice(4)] }));
      setSel(null);
    } else if (n.go && !(n.selFirst && sel !== n.id)) go(n.go);
    else setSel((s) => (s === n.id ? null : n.id));
  };
  const crumbs = [focus ? focusName ?? '' : '전체', ...path.slice(focus ? 1 : 0).map(name)];
  const selNode = level.rows.flat().find((n) => n.id === sel);
  const showKind = here && (here.t === 'proj' || here.t === 'one');

  return (
    <div className="rel-main">
      <div className="rel-stage">
        <div className="rel-bar">
          <div className="crumb">
            {crumbs.map((c, i) =>
              i < crumbs.length - 1 ? (
                <span key={i}>
                  <button type="button" className="link-btn" onClick={() => back(focus ? i + 1 : i)}>
                    {c}
                  </button>{' '}
                  ›{' '}
                </span>
              ) : (
                <b key={i}>{c}</b>
              ),
            )}
          </div>
          {showKind && (
            <div className="btns" role="group" aria-label="아래 줄">
              {(['skill', 'mcp', 'both'] as const).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setSel(null); }}>
                  {k === 'skill' ? '스킬' : k === 'mcp' ? 'MCP' : '둘 다'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rel-graph" ref={wrap}>
          <LineSvg rows={level.rows} edges={level.edges} sel={sel} width={width} onPress={press} />
        </div>
      </div>
      <aside className="rel-side">
        {selNode ? (
          <div className="rel-info">
            <b>{selNode.label}</b>
            {selNode.sub && <span className="small muted">{selNode.sub}</span>}
            <span className="small muted">이어진 선만 진하게 보여요. 다시 누르면 풀려요.{selNode.go ? ' 한 번 더 누르면 안으로 들어가요.' : ''}</span>
          </div>
        ) : null}
        <p className="small muted">{level.hint}</p>
        <div className="rel-legend small muted">
          <span><i className="k-group" />묶음</span>
          <span><i className="k-proj" />프로젝트</span>
          <span><i className="k-skill" />스킬</span>
          <span><i className="k-mcp" />MCP</span>
          <span>점선 = 분류 경계</span>
        </div>
      </aside>
    </div>
  );
}

export function LineSvg({ rows, edges, sel, width, onPress }: { rows: RelNode[][]; edges: RelEdge[]; sel: string | null; width: number; onPress: (n: RelNode) => void }) {
  // 한 줄이 화면보다 길면 세로로 놓는다(옆으로 밀지 않게)
  const longest = Math.max(1, ...rows.map((r) => r.length * 140));
  const vertical = width < 560 || longest > width - 20;
  const BW = vertical ? 118 : 128, BH = 42, GAP = 12, SEPG = 18, ROWG = vertical ? 40 : 92, TOP = vertical ? 10 : 46, LEFT = vertical ? 54 : 10;
  const pos = new Map<string, { x: number; y: number; w: number; h: number; n: RelNode }>();
  const seps: { ri: number; at: number }[] = [];
  let maxLen = 0;
  rows.forEach((r, ri) => {
    let x = 0;
    let prev: string | null = null;
    for (const n of r) {
      if (prev !== null && n.group !== prev) {
        seps.push({ ri, at: x + SEPG / 2 - GAP / 2 });
        x += SEPG;
      }
      const w = n.small ? BW * 0.88 : BW, h = n.small ? BH * 0.86 : BH;
      pos.set(n.id, { x, y: ri * ((vertical ? BW : BH) + ROWG), w, h, n });
      x += (vertical ? h : w) + GAP;
      prev = n.group;
    }
    maxLen = Math.max(maxLen, x);
  });
  rows.forEach((r) => {
    if (!r.length) return;
    const last = pos.get(r[r.length - 1].id)!;
    const len = last.x + (vertical ? last.h : last.w);
    const off = (maxLen - GAP - len) / 2;
    r.forEach((n) => (pos.get(n.id)!.x += off));
  });
  const cross = rows.length * ((vertical ? BW : BH) + ROWG) - ROWG;
  const W = vertical ? cross + LEFT + 10 : Math.max(maxLen, 300) + 20;
  const H = vertical ? Math.max(maxLen, 200) + 20 : cross + 10 + TOP;
  const box = (id: string) => {
    const p = pos.get(id)!;
    return vertical ? { x: p.y + LEFT, y: p.x + 10, w: p.n.small ? BW * 0.88 : BW, h: p.h } : { x: p.x + 10, y: p.y + TOP, w: p.w, h: p.h };
  };
  const on = (e: RelEdge) => !sel || e[0] === sel || e[1] === sel;
  const linked = new Set(sel ? edges.filter(on).flatMap((e) => [e[0], e[1]]) : []);
  const shown = edges.filter((e) => e[3] !== 'q').length;
  return (
    <svg className={`rel-svg${!sel && shown > 30 ? ' dense' : ''}`} viewBox={`0 0 ${W} ${H}`} width={vertical && W > width - 24 ? Math.max(width - 24, 240) : Math.max(W, Math.min(width - 24, W * 1.5))} role="img" aria-label="관계 지도">
      {seps
        .filter((s) => s.ri === rows.length - 1 || !vertical)
        .map((s, i) =>
          vertical ? (
            <line key={i} className="rel-sep" x1={LEFT + s.ri * (BW + ROWG) - 6} x2={LEFT + s.ri * (BW + ROWG) + BW + 6} y1={s.at + 10} y2={s.at + 10} />
          ) : (
            <line key={i} className="rel-sep" x1={s.at + 10} x2={s.at + 10} y1={TOP + s.ri * (BH + ROWG) - 8} y2={TOP + s.ri * (BH + ROWG) + BH + 8} />
          ),
        )}
      {edges.map((e, i) => {
        if (!pos.has(e[0]) || !pos.has(e[1])) return null;
        if (e[3] === 'q' && !(sel && on(e))) return null;
        const a = box(e[0]), b = box(e[1]);
        const same = pos.get(e[0])!.y === pos.get(e[1])!.y;
        const d = same
          ? vertical
            ? `M${a.x},${a.y + a.h / 2} C${a.x - 40},${a.y + a.h / 2} ${b.x - 40},${b.y + b.h / 2} ${b.x},${b.y + b.h / 2}`
            : `M${a.x + a.w / 2},${a.y} C${a.x + a.w / 2},${a.y - 34} ${b.x + b.w / 2},${b.y - 34} ${b.x + b.w / 2},${b.y}`
          : vertical
            ? `M${a.x + a.w},${a.y + a.h / 2} L${b.x},${b.y + b.h / 2}`
            : `M${a.x + a.w / 2},${a.y + a.h} L${b.x + b.w / 2},${b.y}`;
        return <path key={i} className={`rel-edge${on(e) ? (sel ? ' hot' : '') : ' faded'}`} strokeWidth={Math.min(1 + e[2] * 0.4, 4.5)} d={d} />;
      })}
      {[...pos.keys()].map((id) => {
        const b = box(id), n = pos.get(id)!.n;
        const faded = sel && id !== sel && !linked.has(id);
        return (
          <g
            key={id}
            className={`rel-node k-${n.kind}${id === sel ? ' sel' : ''}${faded ? ' faded' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`${n.label}${n.sub ? ` ${n.sub}` : ''}`}
            onClick={() => onPress(n)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onPress(n);
              }
            }}
          >
            <rect className="rel-card" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
            <rect className="rel-bar-k" x={b.x + 5} y={b.y + 7} width={3} height={b.h - 14} rx={1.5} />
            <text x={b.x + b.w / 2 + 2} y={b.y + (n.sub ? b.h / 2 - 2 : b.h / 2 + 4)} textAnchor="middle" fontSize={n.small ? 10.5 : vertical ? 11 : 12} fontWeight={n.kind === 'group' ? 700 : 500}>
              {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
            </text>
            {n.sub && (
              <text className="rel-sub" x={b.x + b.w / 2 + 2} y={b.y + b.h / 2 + 12} textAnchor="middle" fontSize={9.5}>
                {n.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── 그물 보기 ──
type NetNode = { id: string; label: string; type: string; desc: string; state?: string; x: number; y: number; vx: number; vy: number; r: number; deg: number; fx: number | null; fy: number | null };
type NetLink = { s: NetNode; t: NetNode; label?: string };
function step(nodes: NetNode[], links: NetLink[]): number {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d2 = Math.max(dx * dx + dy * dy, 30), f = Math.min(12000 / d2, 40), d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
  for (const L of links) {
    const dx = L.t.x - L.s.x, dy = L.t.y - L.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = ((d - (80 + (L.s.r + L.t.r) * 2.6)) / d) * 0.05;
    L.s.vx += dx * f; L.s.vy += dy * f; L.t.vx -= dx * f; L.t.vy -= dy * f;
  }
  let e = 0;
  for (const n of nodes) {
    if (n.fx != null && n.fy != null) {
      n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0;
      continue;
    }
    n.vx = (n.vx - n.x * 0.004) * 0.82;
    n.vy = (n.vy - n.y * 0.004) * 0.82;
    n.x += n.vx; n.y += n.vy;
    e += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return e / Math.max(nodes.length, 1);
}

/** 그물 보기(관계 지도·사무실 지도가 같이 쓴다) */
export function NetView({ spec, style, focus }: { spec: { nodes: { id: string; label: string; type: string; desc: string; state?: string }[]; links: ([string, string] | [string, string, string])[] }; style: NetStyle; focus?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [selId, setSelId] = useState<string | null>(focus ?? null);
  const g = useMemo(() => {
    const byId = new Map<string, NetNode>();
    const nodes = spec.nodes.map((d, i) => {
      const n: NetNode = { ...d, x: Math.cos(i * 2.4) * (60 + i * 6), y: Math.sin(i * 2.4) * (60 + i * 6), vx: 0, vy: 0, r: 6, deg: 0, fx: null, fy: null };
      byId.set(d.id, n);
      return n;
    });
    const links: NetLink[] = spec.links.filter(([a, b]) => byId.has(a) && byId.has(b)).map(([a, b, label]) => ({ s: byId.get(a)!, t: byId.get(b)!, label }));
    links.forEach((L) => { L.s.deg++; L.t.deg++; });
    nodes.forEach((n) => (n.r = (style[n.type]?.size ?? 6) + Math.min(Math.sqrt(n.deg) * 1.6, 8)));
    for (let k = 0; k < 420; k++) step(nodes, links);
    return { nodes, links, byId, view: { scale: 1, tx: 0, ty: 0 } };
  }, [spec]);
  const selRef = useRef(selId);
  selRef.current = selId;

  const paint = () => {
    const c = cv.current, el = box.current;
    if (!c || !el) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1, v = g.view, css = getComputedStyle(el);
    const tok = (k: string) => css.getPropertyValue(k).trim();
    const ink = tok('--ink'), muted = tok('--muted'), accent = tok('--accent'), surface = tok('--surface'), font = css.fontFamily;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty);
    const sel = selRef.current ? g.byId.get(selRef.current) ?? null : null;
    const near = new Set<NetNode>(sel ? [sel, ...g.links.filter((L) => L.s === sel || L.t === sel).map((L) => (L.s === sel ? L.t : L.s))] : []);
    for (const L of g.links) {
      const hot = !!sel && (L.s === sel || L.t === sel);
      ctx.strokeStyle = hot ? accent : muted;
      ctx.globalAlpha = hot ? 0.95 : sel ? 0.12 : 0.4;
      ctx.lineWidth = (hot ? 1.6 : 1) / v.scale;
      ctx.beginPath(); ctx.moveTo(L.s.x, L.s.y); ctx.lineTo(L.t.x, L.t.y); ctx.stroke();
      if (L.label && hot) {
        ctx.globalAlpha = 1; ctx.font = `${10.5 / v.scale}px ${font}`; ctx.fillStyle = hot ? ink : muted; ctx.textAlign = 'center';
        ctx.fillText(L.label, (L.s.x + L.t.x) / 2, (L.s.y + L.t.y) / 2 - 3 / v.scale);
      }
    }
    ctx.globalAlpha = 1;
    for (const n of g.nodes) {
      const dim = !!sel && !near.has(n);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      const col = tok(style[n.type]?.color ?? '--muted');
      ctx.fillStyle = n === sel ? col : surface; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = (n.type === 'hub' || n.type === 'cat' ? 2.2 : 1.6) / v.scale; ctx.stroke();
      if (!dim && (n.r >= 11 || (sel && near.has(n)) || v.scale > 1.6 || g.nodes.length < 20)) {
        ctx.font = `${n.r >= 11 ? 600 : 400} ${(n.r >= 11 ? 12.5 : 11) / v.scale}px ${font}`;
        ctx.fillStyle = ink; ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + n.r + 13 / v.scale);
      }
      ctx.globalAlpha = 1;
    }
  };
  const fit = () => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), xs = g.nodes.map((n) => n.x), ys = g.nodes.map((n) => n.y);
    if (!xs.length) return;
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40;
    const s = Math.min(r.width / (maxX - minX), r.height / (maxY - minY), 1.6);
    Object.assign(g.view, { scale: s, tx: r.width / 2 - ((minX + maxX) / 2) * s, ty: r.height / 2 - ((minY + maxY) / 2) * s });
    paint();
  };
  // 움직이는 동안만 계산(멈추면 쉰다). 움직임 줄이기면 한 번에 자리를 잡는다
  const running = useRef(false);
  const animate = () => {
    if (running.current) return;
    running.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const loop = () => {
      let e = 0;
      for (let k = 0; k < (reduce ? 30 : 1); k++) e = step(g.nodes, g.links);
      paint();
      if (e > 0.02 || g.nodes.some((n) => n.fx != null)) requestAnimationFrame(loop);
      else running.current = false;
    };
    requestAnimationFrame(loop);
  };
  useEffect(() => {
    const el = box.current, c = cv.current;
    if (!el || !c) return;
    const size = () => {
      const r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, r.width * dpr);
      c.height = Math.max(1, r.height * dpr);
      paint();
    };
    size();
    fit();
    if (focus) {
      // focus는 이미 'p:<id>'(v0.6.88: 'p:p:<id>'로 찾아 가운데로 못 옮기던 것)
      const n = g.byId.get(focus);
      const r = el.getBoundingClientRect();
      if (n) Object.assign(g.view, { tx: r.width / 2 - n.x * g.view.scale, ty: r.height / 2 - n.y * g.view.scale });
      paint();
    }
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, [g]);
  useEffect(paint, [selId]);

  // 끌기·누르기·확대
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ node?: NetNode; last: { x: number; y: number } } | null>(null);
  const moved = useRef(false);
  const pinch = useRef(0);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: { x: number; y: number }) => ({ x: (p.x - g.view.tx) / g.view.scale, y: (p.y - g.view.ty) / g.view.scale });
  const hit = (p: { x: number; y: number }) => {
    const w = world(p);
    let best: NetNode | null = null, bd = Infinity;
    for (const n of g.nodes) {
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d < Math.max(n.r + 6, 16 / g.view.scale) && d < bd) { bd = d; best = n; }
    }
    return best;
  };
  const zoomAt = (sx: number, sy: number, k: number) => {
    const s = Math.min(Math.max(g.view.scale * k, 0.3), 4), w = world({ x: sx, y: sy });
    Object.assign(g.view, { scale: s, tx: sx - w.x * s, ty: sy - w.y * s });
    paint();
  };
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  }, [g]);
  const sel = selId ? g.byId.get(selId) : null;
  const nb = sel ? g.links.filter((L) => L.s === sel || L.t === sel).map((L) => (L.s === sel ? L.t : L.s)) : [];
  const center = () => { const r = box.current!.getBoundingClientRect(); return [r.width / 2, r.height / 2] as const; };

  return (
    <div className="rel-main">
      <div className="rel-stage">
        <div className="rel-net" ref={box}>
          <canvas
            ref={cv}
            aria-label="그물 지도"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = local(e);
              ptrs.current.set(e.pointerId, p);
              moved.current = false;
              if (ptrs.current.size === 2) {
                const [a, b] = [...ptrs.current.values()];
                pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
                drag.current = null;
                return;
              }
              const n = hit(p);
              if (n) { n.fx = n.x; n.fy = n.y; }
              drag.current = { node: n ?? undefined, last: p };
            }}
            onPointerMove={(e) => {
              if (!ptrs.current.has(e.pointerId)) return;
              const p = local(e);
              ptrs.current.set(e.pointerId, p);
              if (ptrs.current.size === 2) {
                const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch.current) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.current);
                pinch.current = d;
                moved.current = true;
                return;
              }
              const dr = drag.current;
              if (!dr) return;
              const dx = p.x - dr.last.x, dy = p.y - dr.last.y;
              if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
              if (dr.node) { dr.node.fx! += dx / g.view.scale; dr.node.fy! += dy / g.view.scale; animate(); }
              else { g.view.tx += dx; g.view.ty += dy; paint(); }
              dr.last = p;
            }}
            onPointerUp={(e) => end(e.pointerId)}
            onPointerCancel={(e) => end(e.pointerId)}
          />
          <div className="rel-zoom">
            <button type="button" aria-label="축소" onClick={() => zoomAt(...center(), 1 / 1.3)}>−</button>
            <button type="button" aria-label="전체 보기" onClick={fit}>⤢</button>
            <button type="button" aria-label="확대" onClick={() => zoomAt(...center(), 1.3)}>+</button>
          </div>
        </div>
      </div>
      <aside className="rel-side">
        {sel ? (
          <div className="rel-info">
            <b>{sel.label}</b>
            <span className="small muted">{style[sel.type]?.name ?? ''}{sel.state ? ` · ${sel.state}` : ''}</span>
            {sel.desc && <span className="small">{sel.desc}</span>}
            <div className="rel-nb">
              {nb.map((m) => (
                <button key={m.id} type="button" onClick={() => setSelId(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="small muted">점을 누르면 이어진 것만 진하게, 여기 설명이 나와요. 점을 끌면 이어진 점이 따라오고 놓으면 제자리로 돌아가요. 빈 곳을 끌면 화면 이동, 두 손가락이나 +/−로 확대.</p>
        )}
        <div className="rel-legend small muted">
          {Object.entries(style).filter(([t]) => g.nodes.some((n) => n.type === t)).map(([t, st]) => (
            <span key={t}>
              <i style={{ borderColor: `var(${st.color})` }} />
              {st.name}
            </span>
          ))}
        </div>
      </aside>
    </div>
  );

  function end(id: number) {
    ptrs.current.delete(id);
    const dr = drag.current;
    if (dr?.node) { dr.node.fx = dr.node.fy = null; animate(); }
    if (dr && !moved.current) setSelId(dr.node ? (selRef.current === dr.node.id ? null : dr.node.id) : null);
    drag.current = null;
    if (ptrs.current.size < 2) pinch.current = 0;
  }
}

/** 스킬 목록·상태를 (서버에 저장된 것부터) 읽어 관계 지도를 그린다 */
export function RelationLoader({ load, projects, focus }: {
  load: () => Promise<{ files: import('../domain/skills').SkillFile[]; map: import('../domain/skills').SkillMapData; mcp: Record<string, string[]> }>;
  projects: { id: string; name: string }[];
  focus?: string;
}) {
  const [input, setInput] = useState<RelInput | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    load().then(
      (d) => setInput({ skills: d.files.map(toSkillView), projects, map: d.map, mcp: d.mcp }),
      (e) => setError((e as Error).message || '관계 지도를 읽지 못했어요.'),
    );
  }, []);
  if (error) return <p className="task-error small rel-pad">{error}</p>;
  if (!input) return <p className="muted small rel-pad">관계 지도를 불러오는 중…</p>;
  return <RelationMap input={input} focus={focus && projects.some((p) => p.id === focus) ? focus : undefined} focusName={projects.find((p) => p.id === focus)?.name} />;
}
