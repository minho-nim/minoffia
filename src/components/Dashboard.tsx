// 대시보드(v0.8.6 소유자 "중요한 순, 원 그래프가 나으면"): 한 화면에서 지금 할 일 → 일하는 중 → 오늘 사용량 → 업무 상태 → 서비스 → 프로젝트.
// 이미 가진 기록만(새 데이터·모델 0). 누르면 그 업무로 간다. 비율은 원 그래프, 한도는 막대.
import type { Project, Snapshot } from '../domain/types';
import type { MyTurn } from '../domain/myTurn';
import type { UsageRow } from '../domain/usageStats';
import type { KeyStatus } from '../data/store';
import { ago, dashboard, deltaText, monthCalendar, routines, stale, weekCompare } from '../domain/dashboard';
import { KeyStatusList } from './KeyStatusList';

type Seg = { label: string; n: number; color: string };

/**
 * 바깥 지표 칸(v0.8.7 소유자 "나중에 블로그·유튜브 자동화를 넣고 대시보드를 확장"): 자동화가 늘면 이 모양으로 칸만 더한다.
 * 숫자 · 전날(지난주) 대비 · 기준 시각(오래되면 '갱신 필요') · 누르면 열 곳. 확인한 값만 넣는다(추정은 넣지 않음).
 */
export interface MetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  /** '전일 대비 +120' 같은 한 줄 */
  delta?: string;
  /** 이 숫자를 확인한 시각 */
  at: string | null;
  /** 이보다 오래되면 갱신 필요(기본 하루) */
  staleMs?: number;
  onOpen?: () => void;
}

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
  loadedAt,
  onRefresh,
  actions,
  brain,
  metrics = [],
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
  /** 화면 기록을 읽은 시각(기준 시각) */
  loadedAt?: string | null;
  onRefresh?: () => void;
  /** GitHub Actions 실행(자동 작업) */
  actions?: { repo: string; workflow: string; ok: boolean; createdAt: string }[];
  /** 세컨드 브레인(옵시디언) */
  /** 바깥 지표(블로그·유튜브 자동화 등, 없으면 안 보임) */
  metrics?: MetricCard[];
  brain?: { at: string | null; tasks: number; chats: number | null; wikis: number; busy: boolean; msg: string; onSend?: () => void };
}) {
  const d = dashboard(snap.tasks, snap.workflow, turns, ordered);
  const nameOf = (pid: string) => snap.projects.find((p) => p.id === pid)?.name ?? '';
  const ai = today.filter((r) => r.id !== 'ci');
  const ciToday = today.find((r) => r.id === 'ci');
  const deployDates = snap.workflow.deployments.filter((x) => x.ok).map((x) => x.createdAt);
  const deployWeek = weekCompare(deployDates);
  const createdWeek = weekCompare(snap.tasks.filter((t) => !t.sample).map((t) => t.createdAt));
  const cal = monthCalendar(snap.tasks, snap.workflow.deployments);
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const jobs = routines(actions ?? [], brain?.at ?? null);
  const old = stale(loadedAt ?? null);
  const kpis = [
    { label: '내 차례', n: d.turns.length, sub: d.alerts ? `막힘 ${d.alerts}` : '승인 기다림', tone: d.alerts ? 'bad' : 'turn' },
    { label: '실패·막힘', n: d.blocked.length + d.alerts, sub: '먼저 보기', tone: d.blocked.length + d.alerts ? 'bad' : 'ok' },
    { label: '일하는 중', n: d.working.length, sub: [...new Set(d.working.map((t) => t.assignee))].join(' · ') || '없음', tone: 'run' },
    { label: '이번 주 배포', n: d.deploysWeek, sub: `${deltaText(deployWeek)}${d.lastDeploy ? ` · 마지막 ${ago(d.lastDeploy)}` : ''}`, tone: 'ok' },
  ];
  return (
    <div className="dash">
      {/* 기준 시각(v0.8.7 소유자 사진 "갱신 필요 · 10.28 기준"): 확인한 시각만, 오래되면 갱신 필요 */}
      <p className={`dash-stamp${old ? ' is-stale' : ''}`}>
        {loadedAt ? `${new Date(loadedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준` : '기준 시각 모름'}
        {old && ' · 갱신 필요'}
        {onRefresh && (
          <button type="button" className="link-btn small" onClick={onRefresh}>
            새로 고침
          </button>
        )}
      </p>
      {metrics.length > 0 && (
        <div className="dash-kpis">
          {metrics.map((m) => {
            const late = stale(m.at, Date.now(), m.staleMs ?? 86400_000);
            return (
              <button key={m.id} type="button" className="dash-card dash-kpi dash-metric" onClick={m.onOpen} disabled={!m.onOpen}>
                <span>{m.label}</span>
                <b>
                  {typeof m.value === 'number' ? m.value.toLocaleString('ko-KR') : m.value}
                  {m.unit && <small> {m.unit}</small>}
                </b>
                {m.delta && <small>{m.delta}</small>}
                <small className={late ? 'is-stale' : ''}>
                  {late ? '갱신 필요 · ' : ''}
                  {m.at ? `${m.at.slice(5, 10).replace('-', '.')} 기준` : '확인 전'}
                </small>
              </button>
            );
          })}
        </div>
      )}
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

      <section className="dash-card">
        <h3>자동 작업</h3>
        <ul className="dash-jobs">
          {jobs.slice(0, 8).map((j) => (
            <li key={j.name}>
              <span className={`dash-dot ${j.ok === false ? 'is-bad' : j.note ? 'is-warn' : j.ok ? 'is-ok' : ''}`} aria-hidden />
              <span className="dash-name">{j.name}</span>
              <small>
                {j.at ? ago(j.at) : '기록 없음'}
                {j.note ? ` · ${j.note}` : j.ok ? ' · 완료' : ''}
              </small>
            </li>
          ))}
        </ul>
        {!actions && <p className="small muted">GitHub Actions 기록은 통계를 한 번 열면 함께 보여요.</p>}
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
            {ciToday && <p className="small muted">GitHub Actions 오늘 {ciToday.n}번 · {ciToday.amount}분</p>}
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

      <section className="dash-card">
        <h3>
          이번 달 활동 <small className="muted">접수 {createdWeek.now}건 이번 주 · {deltaText(createdWeek)}</small>
        </h3>
        <table className="dash-cal" aria-label="이번 달 날마다 접수·배포">
          <thead>
            <tr>
              {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
                <th key={w}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cal.map((week, i) => (
              <tr key={i}>
                {week.map((c, j) => {
                  const n = c.created + c.deployed;
                  return (
                    <td key={j} className={`${c.inMonth ? '' : 'is-out'}${c.day === todayKst ? ' is-today' : ''}`} title={c.inMonth ? `${c.day} 접수 ${c.created} · 배포 ${c.deployed}` : undefined}>
                      {c.inMonth && <i className={`lv-${Math.min(3, n)}${c.deployed ? ' has-deploy' : ''}`}>{Number(c.day.slice(8))}</i>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">진할수록 그날 일이 많아요. 테두리는 배포한 날.</p>
      </section>

      {brain && (
        <section className="dash-card">
          <h3>
            세컨드 브레인(옵시디언)
            {brain.onSend && (
              <button type="button" className="btn btn-small" disabled={brain.busy} onClick={brain.onSend}>
                {brain.busy ? '보내는 중…' : '지금 보내기'}
              </button>
            )}
          </h3>
          <p className="dash-brain">
            업무 <b>{brain.tasks}</b> · 채팅 <b>{brain.chats ?? '-'}</b> · 프로젝트 <b>{brain.wikis}</b>
          </p>
          <small className="muted">{brain.at ? `마지막 보냄 ${ago(brain.at)}` : '아직 안 보냄'}{brain.msg ? ` · ${brain.msg}` : ''}</small>
        </section>
      )}

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
