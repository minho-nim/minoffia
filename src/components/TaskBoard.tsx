// 업무 보드 보기(v0.6.54, Vibe Kanban 착안, 소유자 "다른 오케스트레이션 아이디어"): 같은 업무를 상태 칸 넷으로 한눈에.
// 칸 나누기는 목록의 다섯 상태(simpleState)를 그대로 쓴다(규칙만). 카드를 누르면 목록 보기로 돌아가 그 업무를 펼친다.
import { useState } from 'react';
import type { Project, Task } from '../domain/types';
import type { SimpleState } from '../domain/simpleState';
import { AGENT_BY_ID } from '../domain/agents';

const COLUMNS: { key: string; label: string; states: SimpleState[] }[] = [
  { key: 'turn', label: '내 차례', states: ['turn'] },
  { key: 'working', label: '진행 중', states: ['working'] },
  { key: 'stuck', label: '멈춤·실패', states: ['stalled', 'failed'] },
  { key: 'done', label: '끝남', states: ['done'] },
];
/** 끝남 칸은 최근 것만(오래된 끝난 업무가 보드를 길게 만들지 않게) */
const DONE_LIMIT = 8;

export function TaskBoard({ tasks, states, projects, onOpen }: { tasks: Task[]; states: Map<string, SimpleState>; projects: Map<string, Project>; onOpen: (task: Task) => void }) {
  // 칸 접고 펴기(v0.6.72 소유자 "보드가 먼저 보이고 접고 열게"): 처음엔 업무가 있는 칸만 펼치고 '끝남'은 접어 둔다
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  return (
    <div className="task-board" role="list" aria-label="업무 보드">
      {COLUMNS.map((col) => {
        const all = tasks
          .filter((t) => col.states.includes(states.get(t.id) ?? 'working'))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const shown = col.key === 'done' ? all.slice(0, DONE_LIMIT) : all;
        const closed = folded[col.key] ?? (all.length === 0 || col.key === 'done');
        return (
          <section key={col.key} className={`board-col board-${col.key}${all.length === 0 ? ' is-empty' : ''}${closed ? ' is-closed' : ''}`} role="listitem" aria-label={`${col.label} ${all.length}개`}>
            <h4>
              <button type="button" className="board-fold" aria-expanded={!closed} onClick={() => setFolded((f) => ({ ...f, [col.key]: !closed }))}>
                <span className="fold-tri" aria-hidden="true">{closed ? '▶' : '▼'}</span> {col.label} <span className="num num-count">{all.length}</span>
              </button>
            </h4>
            {closed ? null : shown.length === 0 ? (
              <p className="muted small">없음</p>
            ) : (
              shown.map((t) => (
                <button key={t.id} type="button" className={`board-card st-${states.get(t.id)}`} onClick={() => onOpen(t)}>
                  <span className="board-title">{t.title}</span>
                  <span className="board-meta">
                    {projects.get(t.projectId)?.name ?? ''} · {t.stage === 'cancelled' ? '취소' : (AGENT_BY_ID[t.assignee]?.name ?? t.assignee)}
                  </span>
                </button>
              ))
            )}
            {!closed && all.length > shown.length && <p className="muted small">외 {all.length - shown.length}개(목록 보기의 '전체'에서)</p>}
          </section>
        );
      })}
    </div>
  );
}
