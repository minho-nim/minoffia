import { useState } from 'react';
import type { MyTurn, TurnStep } from '../domain/myTurn';

interface Props {
  items: MyTurn[];
  /** 업무 카드로 이동(step이 있으면 그 칸까지 내려간다, v0.4.86) */
  onOpen: (taskId: string, step?: TurnStep) => void;
  /** 목록에서 바로 승인(업무 카드와 같은 규칙). 없으면 버튼을 숨긴다 */
  onApprove?: (taskId: string, gate: 'A' | 'B') => Promise<boolean>;
}

const QUICK_LABEL = { A: '기획 승인', B: '결과 승인' } as const;

/** 업무 탭 맨 위 "내 차례": 내가 손대야 하는 일만 보인다(? = 승인·답·시작, ! = 막힘). */
export function MyTurnList({ items, onOpen, onApprove }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <section className="my-turn" aria-label="내 차례">
      <h3>
        내 차례 <span className="num num-turn">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted small">지금 내 차례인 일이 없어요. AI가 일하는 중이거나 쉬는 중이에요.</p>
      ) : (
        <ul>
          {items.map((m) => (
            <li key={`${m.taskId}:${m.word}:${m.alert ? '!' : '?'}`} className={m.alert ? 'is-alert' : undefined}>
              <span className="my-turn-mark">
                {m.word}[{m.alert ? '!' : '?'}]
              </span>
              <span className="my-turn-text">
                <b>{m.title}</b>
                <span className="muted small">{m.label}</span>
              </span>
              <span className="my-turn-actions">
                {m.quick && onApprove && (
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(m.taskId);
                      try {
                        await onApprove(m.taskId, m.quick!);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {QUICK_LABEL[m.quick]}
                  </button>
                )}
                <button type="button" className="btn btn-small btn-ghost" onClick={() => onOpen(m.taskId, m.step)}>
                  보기
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
