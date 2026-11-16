// 승인 카드 요약(v0.7.23): "승인하면" 한 줄·상태 칩·시안 그림·바뀐 파일 막대. 대화창 카드와 업무 카드에 같은 모양으로.
// 규칙만(모델 호출 없음). SVG 시안은 규칙대로 img로만 보여 준다.
import { svgSrc } from './DesignDrafts';
import { useEffect, useState } from 'react';
import { afterApprove, fileBars, prChips, resultChips, type Chip } from '../domain/approvalSummary';
import { DRAW_STYLE_LABEL, pickedDraft, type DesignDraft } from '../domain/designDraft';
import type { WorkflowView } from '../domain/workflow';
import type { Task } from '../domain/types';
import type { PrCheck, ResultReview } from '../domain/workflow-types';
import type { DesignPick } from '../domain/designDraft';


export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <ul className="appr-chips" aria-label="상태">
      {chips.map((c) => (
        <li key={c.label} className={`appr-chip is-${c.tone}`}>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export function FileBars({ diff }: { diff: string }) {
  const f = fileBars(diff);
  if (!f.files) return null;
  return (
    <div className="appr-files">
      <p className="small muted">
        파일 {f.files}개 · <span className="appr-add">+{f.add}</span> <span className="appr-del">−{f.del}</span>줄
      </p>
      <ul aria-label="바뀐 파일">
        {f.bars.map((b) => (
          <li key={b.path}>
            <span className="appr-path mono" title={b.path}>
              {b.path.split('/').pop()}
            </span>
            <span className="appr-bar" aria-label={`더한 줄 ${b.add}, 지운 줄 ${b.del}`}>
              <i className="is-add" style={{ width: `${b.addPct / 2}%` }} />
              <i className="is-del" style={{ width: `${b.delPct / 2}%` }} />
            </span>
            <span className="appr-n mono">
              +{b.add} −{b.del}
            </span>
          </li>
        ))}
      </ul>
      {f.more > 0 && <p className="small muted">그 밖에 {f.more}개</p>}
    </div>
  );
}

/** 이 업무의 지금 승인 차례(A·B·C). 없으면 null */
export function approvalGate(view: WorkflowView): 'A' | 'B' | 'C' | null {
  if (view.spec && !view.aApproved && view.stage === 'development_approval_pending') return 'A';
  if (view.result && view.aApproved && !view.bApproved && (view.stage === 'github_approval_pending' || view.stage === 'result_review')) return 'B';
  if (view.result && view.bApproved && !view.cApproved && view.stage === 'deployment_approval_pending') return 'C';
  return null;
}

interface Props {
  task: Task;
  view: WorkflowView;
  /** 이 업무의 시안·고른 시안·평가와 최신 PR 확인 */
  data: { designDrafts?: DesignDraft[]; designPicks?: DesignPick[]; reviews?: ResultReview[]; prCheck: PrCheck | null };
  gate: 'A' | 'B' | 'C';
  repo?: boolean;
  /** 결과 승인 때 바뀐 파일 막대를 펼침 */
  showFiles?: boolean;
  /** 시안 바꾸기(기획 승인 전) */
  onPick?: (d: DesignDraft) => void;
  busy?: boolean;
  /** 결과 화면 사진(결과 스크린샷·미노가 찍은 화면). 없으면 안 보임(v0.7.25) */
  loadShots?: () => Promise<ShotImage[]>;
  /** 그림을 짚어서 수정(시안·결과 화면) */
  onPoint?: (img: ShotImage & { what: string }) => void;
}

export interface ShotImage {
  src: string;
  name: string;
}

/** 결과 화면 사진 한 줄(불러오는 동안은 비워 둔다) */
function ResultShots({ load, onPoint, draft }: { load: () => Promise<ShotImage[]>; onPoint?: Props['onPoint']; draft?: DesignDraft | null }) {
  const [shots, setShots] = useState<ShotImage[] | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setShots(s), () => alive && setShots([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!shots?.length) return null;
  // v0.7.39 소유자 "결과 화면 비교": 기획 때 고른 시안이 있으면 결과 화면 왼쪽에 나란히(시안 ↔ 실제 결과)
  return (
    <ul className={`appr-drafts appr-shots${draft ? ' is-compare' : ''}`} aria-label={draft ? '고른 시안과 결과 화면' : '결과 화면'}>
      {draft && (
        <li className="is-picked">
          <img src={svgSrc(draft.svg)} alt={`고른 시안 ${draft.who}`} loading="lazy" />
          <span className="small">고른 시안 {draft.who} · {DRAW_STYLE_LABEL[draft.who]}</span>
        </li>
      )}
      {shots.slice(0, draft ? 1 : 2).map((s) => (
        <li key={s.src}>
          <img src={s.src} alt={s.name} loading="lazy" />
          <span className="small">{draft ? `실제 결과 · ${s.name}` : s.name}</span>
          {onPoint && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => onPoint({ ...s, what: '결과 화면' })}>
              짚어서 수정
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ApprovalSummary({ task, view, data, gate, repo, showFiles, onPick, busy, loadShots, onPoint }: Props) {
  if (gate === 'A') {
    const rev = view.spec?.revision ?? 0;
    const drafts = (data.designDrafts ?? []).filter((d) => d.taskId === task.id && d.specRevision === rev).sort((a, b) => a.who.localeCompare(b.who));
    const picked = pickedDraft(drafts, data.designPicks ?? [], task.id, rev);
    return (
      <div className="appr">
        <p className="appr-after">{afterApprove('A', { repo, picked: picked ? picked.who : null })}</p>
        {drafts.length > 0 && (
          <ul className="appr-drafts" aria-label="시안">
            {drafts.map((d) => {
              const on = d.id === picked?.id;
              return (
                <li key={d.id} className={on ? 'is-picked' : ''}>
                  <img src={svgSrc(d.svg)} alt={`시안 ${d.who}`} loading="lazy" />
                  <span className="small">
                    {d.who} · {DRAW_STYLE_LABEL[d.who]}
                    {d.review ? ` · ${d.review.total}점` : ''}
                    {on ? ' · 고름' : ''}
                  </span>
                  {onPoint && (
                    <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => onPoint({ src: svgSrc(d.svg), name: d.who, what: 'Gemini 시안' })}>
                      짚어서 수정
                    </button>
                  )}
                  {!on && onPick && (
                    <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => onPick(d)}>
                      시안 {d.who}로
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  if (gate === 'B' && view.result) {
    const review = (data.reviews ?? []).find((r) => r.taskId === task.id && r.resultRevision === view.result!.revision) ?? null;
    const rev = view.spec?.revision ?? 0;
    const draft = pickedDraft((data.designDrafts ?? []).filter((d) => d.taskId === task.id && d.specRevision === rev), data.designPicks ?? [], task.id, rev);
    return (
      <div className="appr">
        <Chips chips={resultChips(view.result, review)} />
        {review?.screen && review.screen.problems.length > 0 && (
          <ul className="appr-screen small" aria-label="화면에서 고칠 곳">
            {review.screen.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {loadShots && <ResultShots key={view.result.revision} load={loadShots} onPoint={onPoint} draft={draft} />}
        <p className="appr-after">{afterApprove('B')}</p>
        {showFiles && <FileBars diff={view.result.diff} />}
      </div>
    );
  }
  return (
    <div className="appr">
      <Chips chips={prChips(data.prCheck)} />
      <p className="appr-after">{afterApprove('C')}</p>
    </div>
  );
}
