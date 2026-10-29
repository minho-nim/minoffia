import { useState, type ReactNode } from 'react';
import { AGENT_BY_ID, AGENTS, MODE_LABEL } from '../domain/agents';
import { nextStatuses } from '../domain/status';
import type { AgentId, Project, Task, TaskStatus } from '../domain/types';
import { PRIORITY_LABEL, STATUS_LABEL, WORK_TYPE_LABEL } from '../domain/types';

interface Props {
  task: Task;
  project: Project | undefined;
  /** 진행 단계 패널(A/E/B/C 승인 흐름) */
  workflow: ReactNode;
  stageLabel: string;
  onStatus: (task: Task, to: TaskStatus) => void;
  /** 담당 바꾸기. 접수·차단 상태에서만 쓴다. */
  onAssign: (task: Task, to: AgentId) => void;
  onDelete: (task: Task) => void;
  onCopy: (task: Task) => Promise<boolean>;
}

const STATUS_VERB: Record<TaskStatus, string> = {
  queued: '접수로 되돌리기',
  in_progress: '진행 시작',
  review: '검토 요청',
  blocked: '차단',
  done: '완료 승인',
};

export function TaskCard({ task, project, workflow, stageLabel, onStatus, onAssign, onDelete, onCopy }: Props) {
  const agent = AGENT_BY_ID[task.assignee];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  // 진행 중인 일의 담당을 바꾸면 오피스에 없는 활동이 생긴다. 접수·차단 상태에서만 바꾼다.
  const canReassign = (task.status === 'queued' || task.status === 'blocked') && task.dispatch.state !== 'dispatching';

  return (
    <article className={`task-card status-${task.status}`}>
      <header className="task-head">
        <span className={`pill pill-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        <h3>{task.title}</h3>
        {task.sample && <span className="sample-tag">예시</span>}
      </header>
      <dl className="task-meta">
        <div>
          <dt>담당</dt>
          <dd>
            {agent.name} <span className="muted">· {MODE_LABEL[agent.mode]}</span>
            {canReassign && (
              <select
                className="assign-select"
                aria-label="담당 바꾸기"
                value=""
                onChange={(e) => e.target.value && onAssign(task, e.target.value as AgentId)}
              >
                <option value="">담당 바꾸기</option>
                {AGENTS.filter((a) => a.id !== 'mina' && a.id !== task.assignee).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </dd>
        </div>
        <div>
          <dt>프로젝트</dt>
          <dd>{project?.name ?? '삭제됨'}</dd>
        </div>
        <div>
          <dt>유형</dt>
          <dd>
            {WORK_TYPE_LABEL[task.type]} · {PRIORITY_LABEL[task.priority]}
          </dd>
        </div>
      </dl>
      {task.description && <p className="task-desc">{task.description}</p>}
      <p className="route-reason">배정 근거: {task.routeReason}</p>

      {task.dispatch.error && (
        <p className="task-error" role="alert">
          {task.dispatch.error}
        </p>
      )}
      {task.dispatch.sessionUrl && (
        <p className="task-session">
          Claude 세션:{' '}
          <a href={task.dispatch.sessionUrl} target="_blank" rel="noreferrer">
            진행 상황 열기
          </a>
        </p>
      )}
      {task.dispatch.state === 'dispatching' && <p className="task-session">Claude Cloud에 전송 중…</p>}

      <div className="task-actions">
        {nextStatuses(task).map((to) => (
          <button key={to} type="button" className={`btn btn-small btn-${to}`} onClick={() => onStatus(task, to)}>
            {STATUS_VERB[to]}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={async () => {
            const ok = await onCopy(task);
            setCopied(ok ? 'ok' : 'fail');
            window.setTimeout(() => setCopied(null), 2500);
          }}
        >
          {copied === 'ok' ? '복사됨' : '지시서 복사'}
        </button>
        {confirmDelete ? (
          <span className="confirm">
            삭제할까요?
            <button type="button" className="btn btn-small btn-danger" onClick={() => onDelete(task)}>
              삭제
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmDelete(false)}>
              취소
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmDelete(true)}>
            삭제
          </button>
        )}
      </div>
      {copied === 'fail' && <p className="muted small">클립보드 접근이 막혀 아래 지시서 칸을 선택해 두었습니다. Ctrl+C로 복사하세요.</p>}

      <details className="wf-details" open={task.stage !== undefined && task.stage !== 'received' && task.stage !== 'completed'}>
        <summary>
          진행 단계 <span className="pill">{stageLabel}</span>
        </summary>
        {workflow}
      </details>
    </article>
  );
}
