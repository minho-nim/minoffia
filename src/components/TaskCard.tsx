import { useState } from 'react';
import { AGENT_BY_ID, MODE_LABEL } from '../domain/agents';
import { nextStatuses } from '../domain/status';
import type { Project, Task, TaskStatus } from '../domain/types';
import { PRIORITY_LABEL, STATUS_LABEL, WORK_TYPE_LABEL } from '../domain/types';

interface Props {
  task: Task;
  project: Project | undefined;
  /** null이면 실행 가능. 문자열이면 실행할 수 없는 이유. */
  dispatchBlocker: string | null;
  onStatus: (task: Task, to: TaskStatus) => void;
  onDelete: (task: Task) => void;
  onCopy: (task: Task) => Promise<boolean>;
  onDispatch: (task: Task, acknowledgeRetry: boolean) => Promise<void>;
}

const STATUS_VERB: Record<TaskStatus, string> = {
  queued: '접수로 되돌리기',
  in_progress: '진행 시작',
  review: '검토 요청',
  blocked: '차단',
  done: '완료 승인',
};

export function TaskCard({ task, project, dispatchBlocker, onStatus, onDelete, onCopy, onDispatch }: Props) {
  const agent = AGENT_BY_ID[task.assignee];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [ack, setAck] = useState(false);
  const [sending, setSending] = useState(false);
  const failed = task.dispatch.state === 'failed';
  const isClaude = task.assignee === 'claude';

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

      {isClaude && task.dispatch.state !== 'dispatched' && task.dispatch.state !== 'dispatching' && task.status !== 'done' && (
        <div className="dispatch">
          {failed && (
            <label className="check">
              <input id={`ack-${task.id}`} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Routines History에서 이전 실행이 없었음을 확인했습니다
            </label>
          )}
          <button
            type="button"
            className="btn btn-claude"
            disabled={Boolean(dispatchBlocker) || sending || (failed && !ack)}
            onClick={async () => {
              setSending(true);
              try {
                await onDispatch(task, failed && ack);
                setAck(false);
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? '전송 중' : failed ? 'Claude Cloud 다시 실행' : 'Claude Cloud 실제 실행'}
          </button>
          {dispatchBlocker && <p className="muted small">{dispatchBlocker}</p>}
        </div>
      )}
    </article>
  );
}
