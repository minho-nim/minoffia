// 결과물 칸(v0.8.6 소유자 "PC 오른쪽 탭: 사무실·대시보드·결과물"): 최근 결과를 업무마다 한 장씩, 바뀐 점 3줄과 지금 상태.
// v0.8.16: 프로젝트별로 묶고, 한 저장소에 앱이 여럿이면(미니허브 → 미니어리·미니로그·허브) 앱별로 한 번 더 나눈다.
// 이미 가진 기록만(모델 0). 누르면 그 업무 카드로.
import type { Snapshot } from '../domain/types';
import { changeLines } from '../domain/approvalSummary';
import { deriveWorkflow } from '../domain/workflow';
import { ago } from '../domain/dashboard';
import { appsOf, byApp } from '../domain/resultGroups';

type Result = Snapshot['workflow']['results'][number];
type Task = Snapshot['tasks'][number];
type Row = { r: Result; t: Task; turn: boolean; state: string };

/** 프로젝트 하나에서 보일 결과 수 */
const PER_PROJECT = 8;

export function ResultsPane({ snap, onTask }: { snap: Snapshot; onTask: (id: string) => void }) {
  const latest = new Map<string, Result>();
  for (const r of snap.workflow.results) {
    const cur = latest.get(r.taskId);
    if (!cur || r.revision > cur.revision) latest.set(r.taskId, r);
  }
  const rows: Row[] = [...latest.values()]
    .map((r) => ({ r, t: snap.tasks.find((x) => x.id === r.taskId) }))
    .filter((x): x is { r: Result; t: Task } => Boolean(x.t) && (!x.t!.sample || snap.tasks.every((t) => t.sample)))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
    .map(({ r, t }) => {
      const v = deriveWorkflow(t, snap.workflow);
      return { r, t, turn: !v.cApproved, state: v.cApproved ? '배포 승인됨' : v.bApproved ? '배포 승인 차례' : '올리기 승인 차례' };
    });
  if (!rows.length) return <p className="muted small dash-empty">아직 받은 결과가 없어요.</p>;

  // 프로젝트별: 내 차례가 있는 프로젝트 먼저, 그다음 최근 결과 순
  const byProject = new Map<string, Row[]>();
  for (const x of rows) {
    const k = x.t.projectId ?? '';
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k)!.push(x);
  }
  const groups = [...byProject.entries()]
    .map(([id, items]) => ({ id, project: snap.projects.find((p) => p.id === id) ?? null, items, turns: items.filter((x) => x.turn).length }))
    .sort((a, b) => Number(b.turns > 0) - Number(a.turns > 0) || b.items[0].r.createdAt.localeCompare(a.items[0].r.createdAt));

  const card = ({ r, t, turn, state }: Row) => (
    <li key={r.id} className="dash-card">
      <button type="button" onClick={() => onTask(t.id)}>
        <span className="results-head">
          <b>{t.title}</b>
          <span className={`dash-pill${turn ? ' is-turn' : ''}`}>{state}</span>
        </span>
        <small className="muted">
          결과 {r.revision} · {ago(r.createdAt)}
          {t.prUrl ? ' · PR 있음' : ''}
        </small>
        <ul className="appr-changes">
          {changeLines(r.summary).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </button>
    </li>
  );

  return (
    <div className="results-groups">
      {groups.map((g, gi) => {
        const apps = appsOf(g.project?.description ?? '');
        const shown = g.items.slice(0, PER_PROJECT);
        const parts = byApp(apps, shown, (x) => ({ title: x.t.title, diff: x.r.diff }));
        return (
          <details key={g.id || 'none'} className="results-project" open={g.turns > 0 || gi === 0}>
            <summary>
              <b>{g.project?.name ?? '프로젝트 없음'}</b>
              <small className="muted">
                결과 {g.items.length}
                {apps.length ? ` · 앱 ${apps.map((a) => a.name).join('·')}` : ''}
              </small>
              {g.turns > 0 && <span className="dash-pill is-turn">내 차례 {g.turns}</span>}
            </summary>
            {parts.map((p) =>
              p.label ? (
                <section key={p.key || 'etc'} className="results-app">
                  <h4>
                    {p.label} <small className="muted">{p.items.length}</small>
                  </h4>
                  <ul className="results-pane">{p.items.map(card)}</ul>
                </section>
              ) : (
                <ul key="all" className="results-pane">
                  {p.items.map(card)}
                </ul>
              ),
            )}
            {g.items.length > shown.length && <p className="muted small">앞 {shown.length}개만 보여요. 나머지는 업무 탭에서.</p>}
          </details>
        );
      })}
    </div>
  );
}
