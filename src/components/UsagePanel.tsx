// 사용량(v0.7.84 소유자 "같은 기준의 사용량, 무슨 일 했는지, 일간·주간·월간 토글, 통계 보기 화면").
// 설정 탭에 두고, 에이전트 탭 칩은 App이 같은 줄(usageRows)을 받아 숫자만 쓴다. 계산은 domain/usageStats 하나.
import { useEffect, useMemo, useState } from 'react';
import type { OfficeStore } from '../data/store';
import type { Snapshot } from '../domain/types';
import type { Credits } from '../domain/searchCredits';
import { FREE_MONTHLY, leftOf } from '../domain/searchCredits';
import { AGENT_BY_ID } from '../domain/agents';
import { GEMINI_QUESTION_CAP } from '../domain/quota';
import {
  byProject,
  customRange,
  groupOf,
  kindsOf,
  WORK_GROUPS,
  type WorkGroup,
  dailyOf,
  daysOf,
  rangeIso,
  rangeOf,
  shortNum,
  SOURCE_LABEL,
  summarize,
  USAGE_AGENTS,
  usageText,
  type Period,
  type Range,
  type UsageAgentId,
  type UsageInput,
  type UsageRow,
} from '../domain/usageStats';
import { FormPopup } from './FormPopup';
import { kstDay } from '../domain/usage';

const PERIOD_KEY = 'usagePeriod';
export function readPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return v === 'week' || v === 'month' ? v : 'day';
  } catch {
    return 'day';
  }
}
export function savePeriod(p: Period) {
  try {
    localStorage.setItem(PERIOD_KEY, p);
  } catch {
    /* 기기 저장이 막혀도 화면은 그대로 */
  }
}

/** 기간의 기록을 읽어 계산 재료로 만든다(서버가 있으면 그 기간만 읽고, 없으면 스냅샷 최근 7일) */
/** tick: 사용 기록이 바뀐 신호(실시간, v0.7.97). actionsFresh: 바뀌면 Actions 10분 보관을 건너뛰고 새로 읽는다(통계 열기·새로 고침) */
export function useUsageInput(store: OfficeStore | null, snap: Snapshot, range: Range, tick = 0, actionsFresh = 0): UsageInput {
  const [remote, setRemote] = useState<(Pick<UsageInput, 'calls' | 'runs'> & { key: string }) | null>(null);
  const rangeKey = `${range.from}:${range.to}`;
  const fresh = `${range.from}:${range.to}:${tick}:${snap.aiCalls?.length ?? 0}:${snap.usage.length}:${snap.workflow.results.length}:${snap.searchToday?.tavily ?? 0}:${snap.searchToday?.firecrawl ?? 0}`;
  useEffect(() => {
    if (!store?.usageRange) return;
    let live = true;
    const { fromIso, toIso } = rangeIso(range);
    store
      .usageRange(fromIso, toIso)
      .then((x) => live && setRemote({ ...x, key: rangeKey }))
      .catch(() => live && setRemote(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, fresh]);
  // GitHub Actions(v0.7.93): GitHub API를 아끼려고 기간마다 10분 동안 다시 읽지 않는다(기록이 바뀌어도)
  const [actions, setActions] = useState<{ key: string; runs: NonNullable<UsageInput['actions']>; skipped: NonNullable<UsageInput['actionsSkipped']> } | null>(null);
  useEffect(() => {
    if (!store?.actionsUsage) return;
    const hit = actionsCache.get(rangeKey);
    if (hit && !actionsFresh && Date.now() - hit.at < 10 * 60_000) {
      setActions({ key: rangeKey, runs: hit.runs, skipped: hit.skipped });
      return;
    }
    let live = true;
    const { fromIso, toIso } = rangeIso(range);
    store
      .actionsUsage(fromIso, toIso)
      .then(({ runs, skipped }) => {
        actionsCache.set(rangeKey, { at: Date.now(), runs, skipped });
        if (live) setActions({ key: rangeKey, runs, skipped });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, rangeKey, actionsFresh]);
  return useMemo(() => {
    const latest = new Map<string, { revision: number; chars: number }>();
    for (const s of snap.workflow.specs) {
      const cur = latest.get(s.taskId);
      if (!cur || s.revision > cur.revision) latest.set(s.taskId, { revision: s.revision, chars: (s.finalPrompt ?? '').length });
    }
    const base = {
      results: snap.workflow.results.map((r) => ({ taskId: r.taskId, source: r.source, summary: r.summary, diff: r.diff, testLog: r.testLog, createdAt: r.createdAt })),
      tasks: snap.tasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, type: t.type })),
      projects: snap.projects.map((p) => ({ id: p.id, name: p.name, repo: p.repo })),
      actions: actions && actions.key === rangeKey ? actions.runs : [],
      actionsSkipped: actions && actions.key === rangeKey ? actions.skipped : [],
      promptChars: Object.fromEntries([...latest].map(([k, v]) => [k, v.chars])),
    };
    // 고른 기간의 기록이 도착하기 전에는 이전 기간 숫자 대신 스냅샷(최근 7일)으로 센다
    if (remote && remote.key === rangeKey) return { calls: remote.calls, runs: remote.runs, ...base };
    return {
      ...base,
      calls: (snap.aiCalls ?? []).map((c) => ({ provider: 'gemini', keySlot: c.keySlot, purpose: c.purpose, model: '', ok: c.ok, tokens: c.tokens ?? null, createdAt: c.createdAt })),
      runs: snap.usage.map((r) => ({ agent: r.agent, taskId: r.taskId, createdAt: r.createdAt })),
    };
  }, [remote, snap, rangeKey, actions]);
}
/** Actions를 못 읽은 저장소 안내(v0.7.94 소유자 "권한 같은 게 필요할 때"): 숫자가 왜 비는지와 고칠 곳 */
function SkippedNote({ skipped }: { skipped: { repo: string; why: string }[] }) {
  const byWhy = new Map<string, string[]>();
  for (const s of skipped) byWhy.set(s.why, [...(byWhy.get(s.why) ?? []), s.repo.replace(/^minho-nim\//, '')]);
  return (
    <div className="usage-skipped" role="note">
      <b>GitHub Actions를 못 읽은 저장소 {skipped.length}개</b>
      {[...byWhy].map(([why, repos]) => (
        <p key={why}>
          {repos.join(', ')} — {why}
        </p>
      ))}
    </div>
  );
}
const actionsCache = new Map<string, { at: number; runs: NonNullable<UsageInput['actions']>; skipped: NonNullable<UsageInput['actionsSkipped']> }>();

const CAP: Partial<Record<UsageAgentId, number>> = {
  // v0.7.98 Claude·Codex 하루 상한 삭제: 상한이 다시 생기면 막대가 돌아온다
  ...(AGENT_BY_ID.claude.dailyCap !== null ? { claude: AGENT_BY_ID.claude.dailyCap } : {}),
  ...(AGENT_BY_ID.codex.dailyCap !== null ? { codex: AGENT_BY_ID.codex.dailyCap } : {}),
  studioA: GEMINI_QUESTION_CAP,
  studioB: GEMINI_QUESTION_CAP,
};
/** 막대에 쓰는 '상한과 비교할 수': Studio는 질문(서버 상한 기준), 나머지는 횟수 */
const meterUsed = (row: UsageRow) => (row.id === 'studioA' || row.id === 'studioB' ? row.work.find((w) => w.key === 'question')?.n ?? 0 : row.n);

type Live = { tavily: Credits | null; firecrawl: Credits | null } | null;

export function UsagePanel({ rows, usageTick = 0, actionsSkipped = [], period, onPeriod, range, liveCredits, monthCredits, store, snap }: {
  rows: UsageRow[];
  usageTick?: number;
  /** Actions를 못 읽은 저장소(권한 등, v0.7.94) */
  actionsSkipped?: { repo: string; why: string }[];
  period: Period;
  onPeriod: (p: Period) => void;
  range: Range;
  liveCredits: Live;
  /** 이번 달 앱이 센 크레딧(서비스 숫자와 견주기) */
  monthCredits?: { tavily: number; firecrawl: number };
  store: OfficeStore;
  snap: Snapshot;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [stats, setStats] = useState(false);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="usage-panel">
      <div className="usage-head">
        <h3>사용량</h3>
        <div className="seg" role="group" aria-label="사용량 기간">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => onPeriod(p)}>
              {p === 'day' ? '일간' : p === 'week' ? '주간' : '월간'}
            </button>
          ))}
        </div>
      </div>
      <p className="usage-range">{range.label}</p>
      <ul className="usage-rows">
        {rows.map((row) => {
          const cap = period === 'day' ? CAP[row.id] : undefined;
          const used = meterUsed(row);
          const isOpen = open.has(row.id);
          const engine = row.id === 'search' ? 'tavily' : row.id === 'firecrawl' ? 'firecrawl' : null;
          const live = engine ? liveCredits?.[engine] ?? null : null;
          const appMonth = engine ? monthCredits?.[engine] ?? 0 : 0;
          return (
            <li key={row.id} className={cap && used >= cap ? 'is-full' : ''}>
              <button type="button" className="usage-row" aria-expanded={isOpen} onClick={() => toggle(row.id)}>
                <span className="usage-name">{row.name}</span>
                <span className={`usage-meter${cap ? '' : ' is-none'}`} aria-hidden="true">
                  <span style={{ width: `${cap ? Math.min(100, (used / cap) * 100) : 0}%` }} />
                </span>
                <span className="usage-num">{usageText(row)}</span>
                <span className="usage-tri" aria-hidden="true">
                  {isOpen ? '▼' : '▶'}
                </span>
              </button>
              {isOpen && (
                <div className="usage-detail">
                  {row.work.length ? (
                    <ul>
                      {row.work.map((w) => (
                        <li key={w.key}>
                          <span>{w.label}</span>
                          <span>
                            {w.n}회{row.unit === 'credit' ? ` · 크레딧 ${w.tokens}` : row.unit === 'minute' ? ` · ${w.tokens}분` : w.tokens || row.id.startsWith('studio') ? ` · ${row.source === 'est' ? '약 ' : ''}${shortNum(w.tokens)} 토큰` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">이 기간에 한 일이 없어요.</p>
                  )}
                  <p className="muted small">
                    {row.unit === 'minute' ? `GitHub 실행 기록. 한도(한 달 2,000분)에 드는 비공개 저장소 ${row.billed ?? 0}분, 공개 저장소는 무료` : row.unit === 'credit' ? '크레딧: 앱 기록(검색 1번 = Tavily 1, Firecrawl 찾기 2·본문 1, 실패해도 서비스에 닿은 요청은 셈)' : `토큰: ${SOURCE_LABEL[row.source]}`}{row.unit === 'minute' ? '' : ' · 횟수: 앱 기록'}
                    {cap ? ` · 오늘 상한 ${row.id.startsWith('studio') ? `질문 ${cap}회(키마다)` : `${cap}회`}` : ''}
                  </p>
                  {row.id === 'ci' && actionsSkipped.length > 0 && <SkippedNote skipped={actionsSkipped} />}
                  {engine && (
                    <p className="muted small">
                      이번 달 {live ? `서비스: 남은 ${leftOf(live).toLocaleString('ko-KR')}${live.remaining !== undefined && live.remaining > live.limit ? `(보너스 포함, 요금제 ${live.limit.toLocaleString('ko-KR')})` : ` / ${live.limit.toLocaleString('ko-KR')}`} · 사용 ${Math.max(live.used, appMonth).toLocaleString('ko-KR')}` : `서비스 숫자 없음 · 무료 ${FREE_MONTHLY[engine].toLocaleString('ko-KR')}`} · 앱 기록 {appMonth.toLocaleString('ko-KR')}
                      {live && live.used < appMonth ? ' — 서비스가 쓴 양을 알려 주지 않아(보너스 크레딧) 앱 기록으로 셉니다' : ''}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="usage-foot">
        <button type="button" className="usage-stats-btn" onClick={() => setStats(true)}>
          통계 보기 ▸
        </button>
      </p>
      {stats && (
        <FormPopup wide title="사용량 통계" onClose={() => setStats(false)}>
          <UsageStats store={store} snap={snap} tick={usageTick} />
        </FormPopup>
      )}
    </div>
  );
}

const COLOR: Record<UsageAgentId, string> = { claude: 'var(--viz-1)', codex: 'var(--viz-2)', studioA: 'var(--viz-3)', studioB: 'var(--viz-4)', search: 'var(--viz-5)', firecrawl: 'var(--viz-6)', ci: 'var(--viz-7)' };

const WD_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const AI_AGENTS = USAGE_AGENTS.filter((a) => a.id !== 'ci');

/** 통계 보기: 고른 기간의 날짜별 사용, 에이전트마다 한 일, 내 프로젝트별 */
function UsageStats({ store, snap, tick = 0 }: { store: OfficeStore; snap: Snapshot; tick?: number }) {
  // 통계를 열 때·새로 고침을 누를 때 Actions를 새로 읽는다(v0.7.97)
  const [actionsFresh, setActionsFresh] = useState(() => Date.now());
  // v0.7.93 소유자 "통계에 처음 들어갈 땐 주간·횟수"
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [offset, setOffset] = useState(0);
  const pick = (p: 'week' | 'month' | 'custom') => {
    setPeriod(p);
    setOffset(0);
  };
  // 캘린더로 고르기(v0.7.85): 처음엔 이번 달 1일 ~ 오늘
  const today = kstDay();
  const [from, setFrom] = useState(() => rangeOf('month').from);
  const [to, setTo] = useState(today);
  const [measure, setMeasure] = useState<'n' | 'amount'>('n');
  const [tip, setTip] = useState<string | null>(null);
  // 무슨 일에 썼나 보기(v0.7.92 소유자 "토글로 에이전트별 보기·업무별 보기")
  const [workView, setWorkView] = useState<'work' | 'agent'>('work');
  // 큰 갈래 안의 세부(v0.7.95 소유자 "설명은 따로 자세히 버튼 안에")
  const [workDetail, setWorkDetail] = useState(false);
  const range = useMemo(() => (period === 'custom' ? customRange(from, to) : rangeOf(period, new Date(), offset)), [period, offset, from, to]);
  const input = useUsageInput(store, snap, range, tick, actionsFresh);
  const rows = useMemo(() => summarize(input, range), [input, range]);
  // 날짜별 막대는 오늘까지만(이번 달·주의 남은 날은 빈 막대라 뺀다)
  // v0.7.95 소유자 "주간·월간은 1주·1달이 전부 보이게": 오늘 뒤 날짜도 빈 막대로 둔다
  const daily = useMemo(() => dailyOf(input, range), [input, range]);
  const kinds = useMemo(() => kindsOf(input, range), [input, range]);
  const projects = useMemo(() => byProject(input, range), [input, range]);
  // v0.7.97 소유자 "깃허브 액션만 너무 많아 다른 게 거의 안 떠": 큰 막대·무슨 일에 썼나는 AI 에이전트만, Actions는 아래 따로(축도 따로)
  const series = AI_AGENTS.filter((a) => measure === 'n' || a.unit === 'token');
  const val = (d: (typeof daily)[number], id: UsageAgentId) => (measure === 'n' ? d.rows[id].n : d.rows[id].amount);
  const fmt = (v: number) => (measure === 'n' ? `${v}` : shortNum(v));
  /** 횟수와 양을 함께(v0.7.90 소유자 "날짜별 횟수·토큰 다 표시"): 토큰 AI는 '3회 · 1.2k', 검색은 '3회 · 크레딧 3' */
  const both = (id: UsageAgentId, n: number, amount: number) => {
    const row = rows.find((r) => r.id === id)!;
    return row.unit === 'credit' ? `${n}회 · 크레딧 ${amount}` : row.unit === 'minute' ? `${n}회 · ${amount}분` : `${n}회 · ${row.source === 'est' && amount ? '약 ' : ''}${shortNum(amount)} 토큰`;
  };
  const total = rows.filter((r) => series.some((s) => s.id === r.id)).reduce((a, r) => a + (measure === 'n' ? r.n : r.amount), 0);
  const top = [...rows].filter((r) => series.some((s) => s.id === r.id)).sort((a, b) => (measure === 'n' ? b.n - a.n : b.amount - a.amount))[0];
  const busiest = daily.reduce<{ day: string; v: number }>((best, d) => {
    const v = series.reduce((a, s) => a + val(d, s.id), 0);
    return v > best.v ? { day: d.day, v } : best;
  }, { day: '', v: 0 });
  const dayLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  const crossMonth = range.from.slice(0, 7) !== range.to.slice(0, 7);
  // 날짜별 쌓은 막대
  const W = 640, H = 220, L = 42, R = 8, T = 10, B = 26;
  const totals = daily.map((d) => series.reduce((a, s) => a + val(d, s.id), 0));
  const rawMax = Math.max(1, ...totals);
  const step = measure === 'n' ? (rawMax > 40 ? 20 : rawMax > 20 ? 10 : 5) : rawMax > 200000 ? 100000 : rawMax > 60000 ? 25000 : 10000;
  const max = Math.ceil(rawMax / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const bw = (W - L - R) / Math.max(1, daily.length);
  const barW = Math.max(6, Math.min(22, bw * 0.6));
  const tipDay = tip ? daily.find((d) => d.day === tip) : undefined;
  const pmax = Math.max(1, ...projects.map((p) => p.claude + p.codex));
  // 무슨 일에 썼나(v0.7.91 소유자 "원래 디자인이 좋음"): 일 종류마다 막대 한 줄, 에이전트는 색으로 쌓는다(모든 에이전트)
  // 업무별(v0.7.95): 7개 큰 갈래로 묶는다. 줄은 횟수가 있는 갈래로 정해 토글을 바꿔도 줄 수·순서가 같게(v0.7.93), 세부는 '자세히'
  const workMap = new Map<string, { label: string; parts: { id: UsageAgentId; name: string; v: number }[]; total: number; subs: Map<string, number> }>();
  const order = new Map<string, number>();
  for (const k of kinds) {
    if (k.id === 'ci') continue;
    for (const x of k.kinds) {
      if (!x.n) continue;
      const g = groupOf(k.id, x.key, x.label);
      order.set(g, (order.get(g) ?? 0) + x.n);
      const line = workMap.get(g) ?? { label: g, parts: [], total: 0, subs: new Map<string, number>() };
      const v = measure === 'n' ? x.n : series.some((s) => s.id === k.id) ? x.tokens : 0;
      if (v) {
        const part = line.parts.find((p) => p.id === k.id);
        if (part) part.v += v;
        else line.parts.push({ id: k.id, name: k.name, v });
        const sub = `${x.label}(${k.name})`;
        line.subs.set(sub, (line.subs.get(sub) ?? 0) + v);
      }
      line.total += v;
      workMap.set(g, line);
    }
  }
  const work = [...workMap.values()].sort((a, b) => (order.get(b.label) ?? 0) - (order.get(a.label) ?? 0) || WORK_GROUPS.indexOf(a.label as WorkGroup) - WORK_GROUPS.indexOf(b.label as WorkGroup));
  const wmax = Math.max(1, ...work.map((w) => w.total));
  // 에이전트별: 모든 에이전트 줄을 늘 보인다(토큰 보기에서 토큰이 없는 Tavily·Firecrawl·Actions는 '—'). 아래 글은 큰 갈래, '자세히'면 세부
  const byAgent = kinds.filter((k) => k.id !== 'ci').map((k) => {
    const has = series.some((s) => s.id === k.id);
    const grouped = new Map<string, number>();
    for (const x of k.kinds) {
      const v = measure === 'n' ? x.n : x.tokens;
      if (has && v > 0) grouped.set(workDetail ? x.label : groupOf(k.id, x.key, x.label), (grouped.get(workDetail ? x.label : groupOf(k.id, x.key, x.label)) ?? 0) + v);
    }
    return { id: k.id, name: k.name, has, total: !has ? 0 : measure === 'n' ? k.n : k.amount, lines: [...grouped].map(([label, v]) => ({ label, v })).sort((p, q) => q.v - p.v) };
  });
  const amax = Math.max(1, ...byAgent.map((a) => a.total));
  // GitHub Actions 따로(v0.7.97): 날짜별 작은 막대(횟수, 축 따로)·검사·배포/정리·기타·한도 대상 분
  const ci = rows.find((r) => r.id === 'ci')!;
  const ciKinds = kinds.find((k) => k.id === 'ci')?.kinds ?? [];
  const ciGroups = (['검사·배포', '정리·기타'] as const).map((g) => {
    const xs = ciKinds.filter((x) => groupOf('ci', x.key, x.label) === g);
    return { g, n: xs.reduce((a, x) => a + x.n, 0), m: xs.reduce((a, x) => a + x.tokens, 0), xs };
  });
  const ciMax = Math.max(1, ...daily.map((d) => d.rows.ci.n));
  const ciStep = ciMax > 40 ? 20 : ciMax > 20 ? 10 : 5;
  const ciTop = Math.ceil(ciMax / ciStep) * ciStep;
  const CH = 110;
  const cy = (v: number) => T + (CH - T - B) * (1 - v / ciTop);
  return (
    <div className="viz usage-stats">
      <div className="usage-stats-ctrl">
        <div className="seg" role="group" aria-label="통계 기간">
          {(['week', 'month', 'custom'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => pick(p)}>
              {p === 'week' ? '주' : p === 'month' ? '월' : '직접'}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="usage-dates">
            <label>
              <span className="sr-only">시작일</span>
              <input id="usage-from" type="date" value={range.from} max={today} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <span aria-hidden="true">~</span>
            <label>
              <span className="sr-only">끝일</span>
              <input id="usage-to" type="date" value={range.to} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="usage-pager">
            <button type="button" aria-label="이전" onClick={() => setOffset((o) => o - 1)}>
              ◀
            </button>
            <b>{period === 'week' ? `${dayLabel(range.from)}(${WD_SHORT[new Date(`${range.from}T00:00:00Z`).getUTCDay()]}) ~ ${dayLabel(range.to)}(${WD_SHORT[new Date(`${range.to}T00:00:00Z`).getUTCDay()]})` : range.label}</b>
            <button type="button" aria-label="다음" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
              ▶
            </button>
          </div>
        )}
        <div className="seg" role="group" aria-label="무엇을 셀까">
          <button type="button" aria-pressed={measure === 'n'} onClick={() => setMeasure('n')}>
            횟수
          </button>
          <button type="button" aria-pressed={measure === 'amount'} onClick={() => setMeasure('amount')}>
            토큰
          </button>
        </div>
      </div>
      <div className="usage-figs">
        <div>
          <span>{measure === 'n' ? '사용 횟수 합계' : '토큰 합계'}</span>
          <b>{measure === 'n' ? total : shortNum(total)}</b>
        </div>
        <div>
          <span>가장 많이 쓴 AI</span>
          <b>{top && (measure === 'n' ? top.n : top.amount) ? top.name : '—'}</b>
        </div>
        <div>
          <span>가장 바빴던 날</span>
          <b>{busiest.day ? dayLabel(busiest.day) : '—'}</b>
        </div>
      </div>

      <section className="usage-chart">
        <h4>{measure === 'n' ? '날짜별 사용 횟수' : '날짜별 토큰'}</h4>
        <p className="muted small">막대를 누르면 그날 AI마다 횟수·토큰(검색은 크레딧)이 나와요.</p>
        <ul className="usage-legend">
          {AI_AGENTS.map((s) => (
            <li key={s.id} className={series.some((x) => x.id === s.id) ? '' : 'is-off'}>
              <i style={{ background: COLOR[s.id] }} />
              {s.name}
            </li>
          ))}
        </ul>
        <div className="usage-svg-wrap">
        <div className="usage-svg">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="날짜별 사용">
            {Array.from({ length: max / step + 1 }, (_, i) => i * step).map((v) => (
              <g key={v}>
                <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
                <text x={L - 6} y={y(v) + 4} textAnchor="end">
                  {fmt(v)}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const cx = L + bw * i + bw / 2;
              let acc = 0;
              const segs = series.map((s) => ({ s, v: val(d, s.id) })).filter((x) => x.v > 0);
              const every = Math.max(1, Math.ceil(daily.length / 10));
              const showDay = daily.length <= 7 || i % every === 0 || i === daily.length - 1;
              return (
                <g key={d.day}>
                  {segs.map(({ s, v }, j) => {
                    const y1 = y(acc + v), y0 = y(acc);
                    acc += v;
                    const h = Math.max(1, y0 - y1 - (j < segs.length - 1 ? 2 : 0));
                    return <rect key={s.id} x={cx - barW / 2} y={y0 - h} width={barW} height={h} rx={j === segs.length - 1 ? 3 : 0} fill={COLOR[s.id]} opacity={tip && tip !== d.day ? 0.45 : 1} />;
                  })}
                  {showDay && (
                    <text x={cx} y={H - 8} textAnchor="middle">
                      {crossMonth ? dayLabel(d.day) : Number(d.day.slice(8, 10))}
                    </text>
                  )}
                  <rect x={L + bw * i} y={T} width={bw} height={H - T - B} fill="transparent" onClick={() => setTip(tip === d.day ? null : d.day)}>
                    <title>{`${dayLabel(d.day)} ${AI_AGENTS.map((s) => `${s.name} ${both(s.id, d.rows[s.id].n, d.rows[s.id].amount)}`).join(', ')}`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        </div>
        {tipDay && (
          <div className="usage-tip" onClick={() => setTip(null)}>
            <b>{dayLabel(tipDay.day)} 하루 ✕</b>
            {AI_AGENTS.map((s) => (
              <span key={s.id}>
                <i style={{ background: COLOR[s.id] }} />
                {s.name} {both(s.id, tipDay.rows[s.id].n, tipDay.rows[s.id].amount)}
              </span>
            ))}
          </div>
        )}
        </div>
      </section>

      <section className="usage-chart">
        <div className="usage-chart-head">
          <h4>무슨 일에 썼나</h4>
          <div className="seg" role="group" aria-label="무슨 일에 썼나 보기">
            <button type="button" aria-pressed={workView === 'work'} onClick={() => setWorkView('work')}>
              업무별
            </button>
            <button type="button" aria-pressed={workView === 'agent'} onClick={() => setWorkView('agent')}>
              에이전트별
            </button>
          </div>
          <button type="button" className="usage-detail-btn" aria-pressed={workDetail} onClick={() => setWorkDetail((v) => !v)}>
            {workDetail ? '자세히 ▲' : '자세히 ▼'}
          </button>
        </div>
        {workView === 'agent' ? (
          <div className="usage-hbars">
            {byAgent.map((a) => (
              <div key={a.id} className="usage-hb-wrap">
                <div className={`usage-hb${a.total ? '' : ' is-zero'}`}>
                  <span>{a.name}</span>
                  <span className="bar">{a.total > 0 && <span style={{ width: `${(a.total / amax) * 100}%`, background: COLOR[a.id] }} />}</span>
                  <span className="v">{a.has ? fmt(a.total) : '—'}</span>
                </div>
                {a.lines.length > 0 && <p className="usage-hb-note">{a.lines.map((l) => `${l.label} ${fmt(l.v)}`).join(' · ')}</p>}
              </div>
            ))}
          </div>
        ) : (
          <>
        <ul className="usage-legend">
          {AI_AGENTS.map((s) => (
            <li key={s.id} className={series.some((x) => x.id === s.id) ? '' : 'is-off'}>
              <i style={{ background: COLOR[s.id] }} />
              {s.name}
            </li>
          ))}
        </ul>
        {work.length ? (
          <div className="usage-hbars">
            {work.map((w) => (
              <div key={w.label} className="usage-hb-wrap">
              <div className="usage-hb">
                <span title={w.label}>{w.label}</span>
                <span className="bar">
                  {w.parts.map((p) => (
                    <span key={p.id} style={{ width: `${(p.v / wmax) * 100}%`, background: COLOR[p.id] }} title={`${p.name} ${fmt(p.v)}`} />
                  ))}
                </span>
                <span className="v">{fmt(w.total)}</span>
              </div>
              {workDetail && w.subs.size > 0 && (
                <p className="usage-hb-note">
                  {[...w.subs]
                    .sort((p, q) => q[1] - p[1])
                    .map(([label, v]) => `${label} ${fmt(v)}`)
                    .join(' · ')}
                </p>
              )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">이 기간에 한 일이 없어요.</p>
        )}
          </>
        )}
      </section>

      <section className="usage-chart usage-ci">
        <div className="usage-chart-head">
          <h4>GitHub Actions</h4>
          <button type="button" className="usage-detail-btn" onClick={() => setActionsFresh(Date.now())}>
            새로 고침
          </button>
        </div>
        <p className="muted small">
          {ci.n}회 · {ci.amount}분 · 한도(한 달 2,000분)에 드는 비공개 저장소 {ci.billed ?? 0}분. 공개 저장소는 무료예요.
        </p>
        {(input.actionsSkipped ?? []).length > 0 && <SkippedNote skipped={input.actionsSkipped ?? []} />}
        <div className="usage-svg">
          <svg viewBox={`0 0 ${W} ${CH}`} role="img" aria-label="날짜별 Actions 실행 횟수">
            {[0, ciTop].map((v) => (
              <g key={v}>
                <line className="grid" x1={L} x2={W - R} y1={cy(v)} y2={cy(v)} />
                <text x={L - 6} y={cy(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const v = d.rows.ci.n;
              const cx = L + bw * i + bw / 2;
              const every = Math.max(1, Math.ceil(daily.length / 10));
              return (
                <g key={d.day}>
                  {v > 0 && <rect x={cx - barW / 2} y={cy(v)} width={barW} height={Math.max(1, cy(0) - cy(v))} rx={3} fill={COLOR.ci}><title>{`${dayLabel(d.day)} ${v}회 · ${d.rows.ci.amount}분`}</title></rect>}
                  {(daily.length <= 7 || i % every === 0 || i === daily.length - 1) && (
                    <text x={cx} y={CH - 8} textAnchor="middle">
                      {crossMonth ? dayLabel(d.day) : Number(d.day.slice(8, 10))}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="usage-hbars">
          {ciGroups.map((x) => (
            <div key={x.g} className="usage-hb-wrap">
              <div className={`usage-hb${x.n ? '' : ' is-zero'}`}>
                <span>{x.g}</span>
                <span className="bar">{x.n > 0 && <span style={{ width: `${(x.n / Math.max(1, ci.n)) * 100}%`, background: COLOR.ci }} />}</span>
                <span className="v">
                  {x.n}회 · {x.m}분
                </span>
              </div>
              {workDetail && x.xs.length > 0 && <p className="usage-hb-note">{x.xs.map((w) => `${w.label} ${w.n}회`).join(' · ')}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="usage-chart">
        <h4>어느 프로젝트에 썼나</h4>
        <p className="muted small">Claude·Codex를 많이 쓴 순서, 같으면 Actions·내 프로젝트 목록 순서(만들거나 지우면 같이 바뀜). Studio·검색은 프로젝트를 남기지 않아 빠져요.</p>
        <ul className="usage-legend">
          <li>
            <i style={{ background: COLOR.claude }} />
            Claude
          </li>
          <li>
            <i style={{ background: COLOR.codex }} />
            Codex
          </li>
        </ul>
        <div className="usage-hbars">
          {projects.map((p) => (
            <div key={p.id} className={`usage-hb${p.claude + p.codex ? '' : ' is-zero'}`}>
              <span title={p.name}>{p.name}</span>
              <span className="bar">
                {p.claude > 0 && <span style={{ width: `${(p.claude / pmax) * 100}%`, background: COLOR.claude }} title={`Claude ${p.claude}회`} />}
                {p.codex > 0 && <span style={{ width: `${(p.codex / pmax) * 100}%`, background: COLOR.codex }} title={`Codex ${p.codex}회`} />}
              </span>
              <span className="v">
                {p.claude + p.codex}회 · {p.tokens ? `약 ${shortNum(p.tokens)}` : '0'} 토큰{p.ci ? ` · Actions ${p.ci}` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <details className="usage-table">
        <summary>날짜별 표(횟수)</summary>
        <div className="usage-table-scroll">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                {AI_AGENTS.map((s) => (
                  <th key={s.id}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  {AI_AGENTS.map((s) => (
                    <td key={s.id}>{d.rows[s.id].n || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="muted small">
        {daysOf(range).length}일 · 기록 기준 한국 시각.{range.from < '2026-11-09' ? ' 11월 9일 전 Gemini 기록에는 토큰이 없어요.' : ''}
      </p>
    </div>
  );
}
