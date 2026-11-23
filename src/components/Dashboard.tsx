// 대시보드(v0.8.6 소유자 "중요한 순, 원 그래프가 나으면"): 한 화면에서 지금 할 일 → 일하는 중 → 오늘 사용량 → 업무 상태 → 서비스 → 프로젝트.
// 이미 가진 기록만(새 데이터·모델 0). 누르면 그 업무로 간다. 비율은 원 그래프, 한도는 막대.
import type { Project, Snapshot } from '../domain/types';
import type { MyTurn } from '../domain/myTurn';
import type { UsageRow } from '../domain/usageStats';
import type { KeyStatus } from '../data/store';
import { ago, dashboard } from '../domain/dashboard';
import { KeyStatusList } from './KeyStatusList';

type Seg = { label: string; n: number; color: string };

/** 원 그래프(도넛). 0이면 빈 원 */
export function Donut({ segs, center, sub, size = 120 }: { segs: Seg[]; center: string; sub: string; size?: number }) {
  const total = segs.reduce((a, s) => a + s.n, 0);
  const r = 15.9155;
  let off = 25;
  return (
    <figure className="dash-donut">
      <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label={`${sub} ${center}: ${segs.map((s) => `${s.label} ${s.n}`).join(', ')}`}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        {total > 0 &&
          segs
            .filter((s) => s.n > 0)
            .map((s) => {
              const pct = (100 * s.n) / total;
              const el = <circle key={s.label} cx="21" cy="21" r={r} fill="none" stroke={s.color} strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={off} />;
              off -= pct;
              return el;
            })}
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="dash-donut-n">
          {center}
        </text>
      </svg>
      <figcaption>
        <b>{sub}</b>
        <ul>
          {segs.map((s) => (
            <li key={s.label}>
              <i style={{ background: s.color }} aria-hidden />
              {s.label} <span>{s.n}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

const AI_COLOR: Record<string, string> = { claude: 'var(--claude)', codex: 'var(--ink)', studioA: 'var(--info)', studioB: 'var(--violet)', search: 'var(--ok)', firecrawl: 'var(--warn)' };

export function Dashboard({
  snap,
  turns,
  today,
  credits,
  ordered,
  keyStatus,
  onTask,
  onWork,
  onUsage,
}: {
  snap: Snapshot;
  turns: MyTurn[];
  /** 오늘 사용량 줄 */
  today: UsageRow[];
  /** 이번 달 검색 크레딧(Tavily·Firecrawl) */
  credits: { tavily: { used: number; limit: number } | null; firecrawl: { used: number; limit: number } | null } | null;
  ordered: Project[];
  keyStatus?: () => Promise<KeyStatus[]>;
  onTask: (id: string) => void;
  onWork: (projectId: string) => void;
  onUsage: () => void;
}) {
  const d = dashboard(snap.tasks, snap.workflow, turns, ordered);
  const nameOf = (pid: string) => snap.projects.find((p) => p.id === pid)?.name ?? '';
  const ai = today.filter((r) => r.id !== 'ci');
  const actions = today.find((r) => r.id === 'ci');
  const kpis = [
    { label: '내 차례', n: d.turns.length, sub: d.alerts ? `막힘 ${d.alerts}` : '승인 기다림', tone: d.alerts ? 'bad' : 'turn' },
    { label: '실패·막힘', n: d.blocked.length + d.alerts, sub: '먼저 보기', tone: d.blocked.length + d.alerts ? 'bad' : 'ok' },
    { label: '일하는 중', n: d.working.length, sub: [...new Set(d.working.map((t) => t.assignee))].join(' · ') || '없음', tone: 'run' },
    { label: '이번 주 배포', n: d.deploysWeek, sub: d.lastDeploy ? `마지막 ${ago(d.lastDeploy)}` : '없음', tone: 'ok' },
  ];
  return (
    <div className="dash">
      <div className="dash-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`dash-card dash-kpi is-${k.tone}`}>
            <span>{k.label}</span>
            <b>{k.n}</b>
            <small>{k.sub}</small>
          </div>
        ))}
      </div>

      <section className="dash-card">
        <h3>지금 할 일</h3>
        {d.turns.length === 0 && d.blocked.length === 0 ? (
          <p className="muted small">지금 할 일이 없어요.</p>
        ) : (
          <ul className="dash-rows">
            {d.turns.slice(0, 8).map((t) => (
              <li key={`${t.taskId}-${t.word}`}>
                <button type="button" onClick={() => onTask(t.taskId)}>
                  <span className={`dash-pill${t.alert ? ' is-bad' : ' is-turn'}`}>{t.word}</span>
                  <span className="dash-name">
                    {nameOf(snap.tasks.find((x) => x.id === t.taskId)?.projectId ?? '')} · {t.title}
                  </span>
                  <small>{t.label}</small>
                </button>
              </li>
            ))}
            {d.blocked
              .filter((t) => !d.turns.some((x) => x.taskId === t.id))
              .slice(0, 4)
              .map((t) => (
                <li key={`b-${t.id}`}>
                  <button type="button" onClick={() => onTask(t.id)}>
                    <span className="dash-pill is-bad">{t.dispatch?.state === 'failed' ? '맡기기 실패' : '막힘'}</span>
                    <span className="dash-name">
                      {nameOf(t.projectId)} · {t.title}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="dash-card">
        <h3>일하는 중</h3>
        {d.working.length === 0 ? (
          <p className="muted small">지금 일하는 AI가 없어요.</p>
        ) : (
          <ul className="dash-rows">
            {d.working.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onTask(t.id)}>
                  <span className="cd-busy" aria-hidden />
                  <span className="dash-name">
                    {t.assignee} · {nameOf(t.projectId)} · {t.title}
                  </span>
                  <small>{ago(t.dispatch?.at ?? t.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="dash-two">
        <section className="dash-card">
          <h3>
            오늘 사용량{' '}
            <button type="button" className="link-btn small" onClick={onUsage}>
              통계 →
            </button>
          </h3>
          <Donut size={110} sub="AI 사용 횟수" center={String(ai.reduce((a, r) => a + r.n, 0))} segs={ai.map((r) => ({ label: r.name, n: r.n, color: AI_COLOR[r.id] ?? 'var(--muted)' }))} />
          <div className="dash-bars">
            {credits?.tavily && <Bar label="Tavily(이번 달)" used={credits.tavily.used} limit={credits.tavily.limit} />}
            {credits?.firecrawl && <Bar label="Firecrawl(이번 달)" used={credits.firecrawl.used} limit={credits.firecrawl.limit} />}
            {actions && <p className="small muted">GitHub Actions 오늘 {actions.n}번 · {actions.amount}분</p>}
          </div>
        </section>
        <section className="dash-card">
          <h3>업무 상태</h3>
          <Donut
            size={110}
            sub="열린 업무"
            center={String(d.status.reduce((a, s) => a + s.n, 0))}
            segs={d.status.map((s) => ({ label: s.label, n: s.n, color: s.key === 'blocked' ? 'var(--danger)' : s.key === 'in_progress' ? 'var(--accent)' : s.key === 'review' ? 'var(--info)' : 'var(--line)' }))}
          />
          <p className="small muted">이번 주 배포 승인 {d.doneWeek}개</p>
        </section>
      </div>

      {keyStatus && (
        <section className="dash-card">
          <h3>서비스 상태</h3>
          <KeyStatusList load={keyStatus} />
          {(snap.leave ?? []).length > 0 && <p className="small muted">휴가 중: {(snap.leave ?? []).join(', ')}</p>}
        </section>
      )}

      <section className="dash-card">
        <h3>프로젝트</h3>
        <table className="dash-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>내 차례</th>
              <th>진행</th>
              <th>마지막 배포</th>
            </tr>
          </thead>
          <tbody>
            {d.projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <button type="button" className="link-btn" onClick={() => onWork(p.id)}>
                    {p.name}
                  </button>
                </td>
                <td className={p.turn ? 'is-turn' : ''}>{p.turn}</td>
                <td>{p.working}</td>
                <td>{ago(p.lastDeploy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((100 * used) / limit)) : 0;
  return (
    <div className="dash-bar">
      <span>{label}</span>
      <span className="dash-bar-track" aria-hidden>
        <i style={{ width: `${pct}%` }} className={pct >= 90 ? 'is-bad' : pct >= 70 ? 'is-warn' : ''} />
      </span>
      <small>
        {used}/{limit}
      </small>
    </div>
  );
}
