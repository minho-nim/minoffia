// Gemini 시안(v0.7.13): 기획 승인 전에 A·B 시안 두 장과 서로 평가를 나란히 보여 주고, 소유자가 하나를 고른다(승인 아님).
// SVG는 규칙대로 img로만 보여 준다(스크립트가 돌지 않음). 흐름은 그림 라이브러리 없이 단계 목록으로.
import { DESIGN_PART_LABEL, DESIGN_WEIGHTS, DRAW_STYLE_LABEL, flowSteps, type DesignDraft, type DesignPart } from '../domain/designDraft';

interface Props {
  drafts: DesignDraft[];
  pickedId: string | null;
  busy?: boolean;
  /** 아직 시안이 없을 때 그리기(없으면 버튼을 숨김: 로컬 데모·기획 승인 뒤) */
  onDraw?: () => void;
  /** 고르기(없으면 보기만) */
  onPick?: (draft: DesignDraft) => void;
}

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function DesignDrafts({ drafts, pickedId, busy, onDraw, onPick }: Props) {
  if (!drafts.length && !onDraw) return null;
  const sorted = [...drafts].sort((a, b) => a.who.localeCompare(b.who));
  return (
    <section className="design-drafts" aria-label="Gemini 시안">
      <p className="design-head">
        <b>화면 시안</b>
        <span className="muted small">
          {drafts.length ? 'Gemini A·B가 그리고 서로 평가했어요. 하나를 고르면 개발 AI에게 같이 넘어가요(고르지 않아도 개발은 돼요).' : 'Gemini A·B가 같은 기획서로 시안을 하나씩 그리고 서로 평가해요(1분 안팎, 무료).'}
        </span>
      </p>
      {!drafts.length && onDraw && (
        <button type="button" className="btn btn-small" disabled={busy} onClick={onDraw}>
          {busy ? '그리는 중…' : '시안 그리기(Gemini A·B)'}
        </button>
      )}
      {drafts.length > 0 && (
        <ul className="design-grid">
          {sorted.map((d) => {
            const picked = d.id === pickedId;
            const steps = flowSteps(d.flow);
            return (
              <li key={d.id} className={`design-card${picked ? ' is-picked' : ''}`}>
                <p className="design-who">
                  <b>Gemini {d.who}</b> <span className="muted small">· {DRAW_STYLE_LABEL[d.who]}</span>
                  {d.review && <span className="design-score">{d.review.total}점</span>}
                </p>
                <img className="design-svg" src={svgSrc(d.svg)} alt={`Gemini ${d.who} 화면 시안`} loading="lazy" />
                {d.note && <p className="small design-note">{d.note}</p>}
                {d.review ? (
                  <details className="small">
                    <summary>Gemini {d.review.by}가 본 평가 {d.review.total}점</summary>
                    <ul className="design-parts">
                      {(Object.keys(DESIGN_WEIGHTS) as DesignPart[]).map((k) => (
                        <li key={k}>
                          {DESIGN_PART_LABEL[k]} <span className="mono">{d.review!.parts[k]}/{DESIGN_WEIGHTS[k]}</span>
                        </li>
                      ))}
                    </ul>
                    {d.review.good.length > 0 && <p>좋은 점: {d.review.good.join(' / ')}</p>}
                    {d.review.fix.length > 0 && <p>고칠 점: {d.review.fix.join(' / ')}</p>}
                  </details>
                ) : (
                  <p className="muted small">상대 Gemini의 평가를 받지 못했어요.</p>
                )}
                {steps.length > 0 && (
                  <details className="small">
                    <summary>흐름 {steps.length}단계</summary>
                    <ol className="design-flow">
                      {steps.map((s, i) => (
                        <li key={i}>
                          {s.from} → {s.to}
                          {s.label && <span className="muted"> ({s.label})</span>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {onPick ? (
                  <button type="button" className={`btn btn-small${picked ? ' btn-primary' : ''}`} disabled={busy || picked} onClick={() => onPick(d)}>
                    {picked ? '✓ 고른 시안' : '이 시안으로'}
                  </button>
                ) : (
                  picked && <p className="small ok-text">✓ 고른 시안</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
