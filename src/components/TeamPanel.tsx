import { useState } from 'react';
import { AGENT_BY_ID } from '../domain/agents';
import { LEAVE_AGENTS, type AgentId, type Snapshot } from '../domain/types';
import { spriteFor } from '../office/sprites';

/**
 * 팀 관리 탭(v0.4.40, 소유자 2026-11-01): 근무 칸 · 가운데 옮기기 버튼 · 휴가 칸.
 * 카드를 눌러 체크한 뒤 가운데 버튼으로 옮기거나, 카드를 끌어 반대 칸에 놓는다.
 * 화면 크기와 상관없이 늘 좌우(좁으면 카드만 작게, v0.4.41).
 * 휴가인 AI는 사무실 아래 출입문으로 나가고, 새 배정·PM 계획에서 빠져 규칙대로 다른 AI가 맡는다.
 */
export function TeamPanel({ snap, onSetLeave }: { snap: Snapshot; onSetLeave: (agent: AgentId, onLeave: boolean) => void }) {
  const leave = snap.leave ?? [];
  const [picked, setPicked] = useState<Set<AgentId>>(() => new Set());
  const [over, setOver] = useState<'work' | 'leave' | null>(null);
  const working = LEAVE_AGENTS.filter((id) => !leave.includes(id));
  const away = LEAVE_AGENTS.filter((id) => leave.includes(id));
  const pickedWork = working.filter((id) => picked.has(id));
  const pickedAway = away.filter((id) => picked.has(id));

  const toggle = (id: AgentId) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const move = (ids: AgentId[], toLeave: boolean) => {
    ids.forEach((id) => onSetLeave(id, toLeave));
    setPicked((cur) => new Set([...cur].filter((id) => !ids.includes(id))));
  };

  const card = (id: AgentId) => {
    const a = AGENT_BY_ID[id];
    const isAway = leave.includes(id);
    const sprite = spriteFor(a, 'stand');
    const open = snap.tasks.filter((t) => t.assignee === id && t.status !== 'done').length;
    const on = picked.has(id);
    return (
      <li key={id}>
        <label
          className={`team-card${isAway ? ' is-away' : ''}${on ? ' is-picked' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <input type="checkbox" checked={on} onChange={() => toggle(id)} aria-label={`${a.name} 고르기`} />
          <img className={sprite.art ? 'is-art' : undefined} src={sprite.src} alt="" draggable={false} />
          <span className="team-name">
            <b>{a.name}</b>
            <span className="muted small">{a.role}</span>
            {isAway && open > 0 && <span className="muted small">진행 중 {open}건은 그대로</span>}
          </span>
        </label>
      </li>
    );
  };

  const column = (kind: 'work' | 'leave', ids: AgentId[]) => (
    <section
      className={`team-col team-col-${kind}${over === kind ? ' is-over' : ''}`}
      aria-label={kind === 'work' ? '근무' : '휴가'}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(kind);
      }}
      onDragLeave={() => setOver((o) => (o === kind ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData('text/plain') as AgentId;
        if (!LEAVE_AGENTS.includes(id)) return;
        const toLeave = kind === 'leave';
        if (leave.includes(id) !== toLeave) move([id], toLeave);
      }}
    >
      <h3>
        {kind === 'work' ? '근무' : '휴가'} <span className="num num-count">{ids.length}</span>
      </h3>
      {ids.length ? (
        <ul className="team-list">{ids.map(card)}</ul>
      ) : (
        <p className="team-empty muted small">{kind === 'work' ? '모두 휴가 중이에요' : '여기로 옮기면 휴가예요'}</p>
      )}
    </section>
  );

  return (
    <section className="team-panel" aria-label="팀 관리">
      <p className="muted small">
        카드를 눌러 고른 뒤 가운데 버튼으로 옮기거나, 끌어서 반대 칸에 놓으세요. 휴가인 AI는 새 업무와 PM 계획에서 빠지고 일할 수 있는 다른 AI가 맡아요(진행 중인 업무는 그대로). 미니엉과
        CI 봇은 늘 근무해요.
      </p>
      <div className="team-board">
        {column('work', working)}
        <div className="team-moves" role="group" aria-label="옮기기">
          <button type="button" className="btn btn-small" disabled={!pickedWork.length} onClick={() => move(pickedWork, true)} title="고른 AI를 휴가로" aria-label="고른 AI를 휴가로">
            →
          </button>
          <button type="button" className="btn btn-small" disabled={!pickedAway.length} onClick={() => move(pickedAway, false)} title="고른 AI를 근무로" aria-label="고른 AI를 근무로">
            ←
          </button>
        </div>
        {column('leave', away)}
      </div>
    </section>
  );
}
