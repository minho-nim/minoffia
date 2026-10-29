import { AGENT_BY_ID, MODE_LABEL } from '../domain/agents';
import { remainingToday, runsToday } from '../domain/usage';
import type { AgentId, Task, UsageRun } from '../domain/types';
import { STATUS_LABEL } from '../domain/types';
import { ACTIVITY_LABEL, buildScene } from '../office/scene';
import { spriteFor } from '../office/sprites';

interface Props {
  agentId: AgentId;
  tasks: Task[];
  usage: UsageRun[];
  onOpenTask: (task: Task) => void;
}

export function AgentPanel({ agentId, tasks, usage, onOpenTask }: Props) {
  const a = AGENT_BY_ID[agentId];
  const scene = buildScene(tasks).find((s) => s.agent === agentId);
  const mine = tasks.filter((t) => t.assignee === agentId);
  const used = runsToday(usage, agentId);
  const left = remainingToday(usage, agentId);

  return (
    <div className="stack">
      <div className="agent-card">
        <img className={`agent-portrait${spriteFor(a, 'stand').art ? ' is-art' : ''}`} src={spriteFor(a, 'stand').src} alt="" />
        <div>
          <h3>{a.name}</h3>
          <p className="muted">
            {a.role} · {a.provider}
          </p>
          <p>
            <span className="pill">{MODE_LABEL[a.mode]}</span>{' '}
            {scene && <span className={`pill pill-act-${scene.activity}`}>{ACTIVITY_LABEL[scene.activity]}</span>}
          </p>
        </div>
      </div>
      <p>{a.note}</p>
      <p className="small">
        오늘 등록된 실행 <b className="num">{used}</b>
        {a.dailyCap !== null ? (
          <>
            {' '}
            / {a.dailyCap}회 · 남은 횟수 <b className="num">{left}</b>
          </>
        ) : (
          ' · 상한 없음'
        )}
        <br />
        <span className="muted">공급자의 잔여 토큰이 아니라 이 오피스에 기록된 실행 횟수입니다.</span>
      </p>
      <h4>맡은 업무 {mine.length}</h4>
      {mine.length === 0 ? (
        <p className="empty">맡은 업무가 없어 휴게실에서 쉬고 있습니다.</p>
      ) : (
        <ul className="mini-list">
          {mine.map((t) => (
            <li key={t.id}>
              <button type="button" className="link-btn" onClick={() => onOpenTask(t)}>
                <span className={`pill pill-${t.status}`}>{STATUS_LABEL[t.status]}</span> {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
