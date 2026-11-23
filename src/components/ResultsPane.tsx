// 결과물 칸(v0.8.6 소유자 "PC 오른쪽 탭: 사무실·대시보드·결과물"): 최근 결과를 업무마다 한 장씩, 바뀐 점 3줄과 지금 상태.
// 이미 가진 기록만(모델 0). 누르면 그 업무 카드로.
import type { Snapshot } from '../domain/types';
import { changeLines } from '../domain/approvalSummary';
import { deriveWorkflow } from '../domain/workflow';
import { ago } from '../domain/dashboard';

export function ResultsPane({ snap, onTask }: { snap: Snapshot; onTask: (id: string) => void }) {
  const latest = new Map<string, Snapshot['workflow']['results'][number]>();
  for (const r of snap.workflow.results) {
    const cur = latest.get(r.taskId);
    if (!cur || r.revision > cur.revision) latest.set(r.taskId, r);
  }
  const rows = [...latest.values()]
    .map((r) => ({ r, t: snap.tasks.find((x) => x.id === r.taskId) }))
    .filter((x): x is { r: (typeof x)['r']; t: NonNullable<(typeof x)['t']> } => Boolean(x.t) && (!x.t!.sample || snap.tasks.every((t) => t.sample)))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
    .slice(0, 12);
  if (!rows.length) return <p className="muted small dash-empty">아직 받은 결과가 없어요.</p>;
  return (
    <ul className="results-pane">
      {rows.map(({ r, t }) => {
        const v = deriveWorkflow(t, snap.workflow);
        const state = v.cApproved ? '배포 승인됨' : v.bApproved ? '배포 승인 차례' : '올리기 승인 차례';
        return (
          <li key={r.id} className="dash-card">
            <button type="button" onClick={() => onTask(t.id)}>
              <span className="results-head">
                <b>{t.title}</b>
                <span className={`dash-pill${v.cApproved ? '' : ' is-turn'}`}>{state}</span>
              </span>
              <small className="muted">
                {snap.projects.find((p) => p.id === t.projectId)?.name ?? ''} · 결과 {r.revision} · {ago(r.createdAt)}
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
      })}
    </ul>
  );
}
