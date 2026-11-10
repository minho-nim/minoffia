import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AGENT_BY_ID, AGENTS, MODE_LABEL } from '../domain/agents';
import { nextStatuses } from '../domain/status';
import type { AgentId, Project, Task, TaskStatus } from '../domain/types';
import { PRIORITY_LABEL, STATUS_LABEL, WORK_TYPE_LABEL } from '../domain/types';
import { SIMPLE_LABEL } from '../domain/simpleState';

interface Props {
  task: Task;
  project: Project | undefined;
  /** 진행 단계 패널(A/E/B/배포 승인 흐름) */
  workflow: ReactNode;
  /** 이 업무 프로젝트의 구조도·앱 지도 버튼(v0.6.45) */
  views?: ReactNode;
  stageLabel: string;
  onStatus: (task: Task, to: TaskStatus) => void;
  /** 담당 바꾸기. 접수·차단 상태에서만 쓴다. */
  onAssign: (task: Task, to: AgentId) => void;
  onDelete: (task: Task) => void;
  /** 업무 취소(v0.6.50 소유자 "취소도 필요"): 남은 작업을 멈추고 기록은 남긴다 */
  onCancel?: (task: Task) => void;
  onCopy: (task: Task) => Promise<boolean>;
  /** 대화 탭에서 이 업무에 대해 묻기(v0.4.19) */
  onAsk?: (task: Task) => void;
  /** 담당 AI를 사무실에서 보기 */
  onShowAgent?: (task: Task) => void;
  /** 접힌 카드(v0.4.21): 한 줄 요약만 보이고 누르면 펼친다 */
  expanded?: boolean;
  onToggle?: (task: Task) => void;
  /** 이 업무의 내 차례 표시(기획? · 배포! 등) */
  /** 내 차례 표시. onJump가 있으면 눌러서 그 칸으로 간다(v0.4.86) */
  turn?: { word: string; alert?: boolean; onJump?: () => void };
  /** 상태 다섯 가지(v0.6.15): 있으면 카드 맨 앞에 이것을 보인다 */
  simple?: import('../domain/simpleState').SimpleState;
}

const STATUS_VERB: Record<TaskStatus, string> = {
  queued: '접수로 되돌리기',
  in_progress: '진행 시작',
  review: '검토 요청',
  blocked: '차단',
  done: '완료 승인',
};

export function TaskCard({ task, project, workflow, views, onStatus, onAssign, onDelete, onCancel, onCopy, onAsk, onShowAgent, expanded = true, onToggle, turn, simple }: Props) {
  const agent = AGENT_BY_ID[task.assignee];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [reassigning, setReassigning] = useState(false);
  // 진행 중인 일의 담당을 바꾸면 오피스에 없는 활동이 생긴다. 접수·차단 상태에서만 바꾼다.
  const canReassign = (task.status === 'queued' || task.status === 'blocked') && task.dispatch.state !== 'dispatching';

  // 위에 붙는 제목·진행 단계 줄의 높이를 CSS 변수로(진행 단계 줄이 제목 바로 아래에 붙게, v0.5.0)
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !expanded || typeof ResizeObserver === 'undefined') return;
    // 진행 단계는 접힌 <details> 안에 있다가 나중에 생길 수 있어, 카드 크기가 바뀔 때마다 다시 찾는다.
    const set = () => {
      const title = card.querySelector<HTMLElement>(':scope > .task-toggle');
      const steps = card.querySelector<HTMLElement>('.wf-head');
      if (title) card.style.setProperty('--task-title-h', `${title.offsetHeight}px`);
      if (steps) card.style.setProperty('--task-steps-h', `${steps.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(card);
    return () => ro.disconnect();
  }, [expanded]);

  return (
    <article ref={cardRef} id={`task-${task.id}`} className={`task-card status-${task.status}${expanded ? '' : ' is-folded'}`}>
      {onToggle ? (
        <button type="button" className="task-toggle" aria-expanded={expanded} onClick={() => onToggle(task)}>
          <span className="task-head">
            {task.stage === 'cancelled' ? <span className="pill pill-st-done">취소</span> : simple ? <span className={`pill pill-st-${simple}`}>{SIMPLE_LABEL[simple]}</span> : <span className={`pill pill-${task.status}`}>{STATUS_LABEL[task.status]}</span>}
            <span className="task-title">{task.title}</span>
            {turn && (
              <span
                className={`task-turn${turn.alert ? ' is-alert' : ''}${turn.onJump ? ' is-link' : ''}`}
                // 카드 열고 닫기 버튼 안이라 진짜 버튼을 둘 수 없어 눌림만 받는다(키보드는 내 차례 목록의 '보기'로).
                onClick={
                  turn.onJump
                    ? (e) => {
                        e.stopPropagation();
                        turn.onJump!();
                      }
                    : undefined
                }
                title={turn.onJump ? '눌러서 할 일 칸으로 가기' : undefined}
              >
                {turn.word}
                {turn.alert ? '!' : '?'}
              </span>
            )}
            <span className="task-chevron" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
          </span>
          <span className="task-sub">
            {/* v0.6.43: 단계는 맨 앞 상태 표시와 '지금 할 일'에 있어 여기서는 뺀다 */}
            {project?.name ?? '삭제됨'} · {agent.name}
            {task.sample && <span className="sample-tag">예시</span>}
          </span>
        </button>
      ) : (
        <header className="task-head">
          <span className={`pill pill-${task.status}`}>{STATUS_LABEL[task.status]}</span>
          <h3>{task.title}</h3>
          {task.sample && <span className="sample-tag">예시</span>}
        </header>
      )}
      {expanded && (
      <>
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

      {/* 덜 복잡하게(v0.6.41 소유자 "읽을 게 너무 많아"): 펼치면 '지금 할 일'(진행 단계 패널)이 맨 위. 같은 말이던 '진행 단계' 줄은 뺐다 */}
      <div className="wf-details">{workflow}</div>
      {views}
      <details className="task-more">
        <summary>⋯ 더보기(설명·담당 바꾸기·삭제 등)</summary>
      {/* 간단히(v0.4.22): 프로젝트·담당·단계는 위 요약 줄에 있으니 유형·방식만 한 줄로 */}
      <p className="task-meta-line">
        {WORK_TYPE_LABEL[task.type]} · {PRIORITY_LABEL[task.priority]} · {MODE_LABEL[agent.mode]}
        {onShowAgent && (
          <>
            {' · '}
            <button type="button" className="link-btn" onClick={() => onShowAgent(task)}>
              사무실에서 {agent.name} 보기
            </button>
          </>
        )}
      </p>
      {task.description && <p className="task-desc">{task.description}</p>}

      <div className="task-actions">
        {onAsk && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onAsk(task)}>
            대화로 묻기
          </button>
        )}
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
        {canReassign &&
          (reassigning ? (
            <span className="confirm confirm-neutral">
              누구에게?
              {AGENTS.filter((a) => a.id !== 'mina' && a.id !== task.assignee).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    setReassigning(false);
                    onAssign(task, a.id as AgentId);
                  }}
                >
                  {a.name}
                </button>
              ))}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setReassigning(false)}>
                취소
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setReassigning(true)}>
              담당 바꾸기
            </button>
          ))}
        {onCancel && task.status !== 'done' && task.stage !== 'cancelled' &&
          (confirmCancel ? (
            <span className="confirm">
              업무를 취소할까요? 남은 AI 작업을 멈추고 기록은 남겨요.
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  setConfirmCancel(false);
                  onCancel(task);
                }}
              >
                업무 취소
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmCancel(false)}>
                아니요
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmCancel(true)}>
              업무 취소
            </button>
          ))}
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

      </details>
      {onToggle && (
        <button type="button" className="btn btn-small btn-ghost task-fold" onClick={() => onToggle(task)}>
          접기 ▴
        </button>
      )}
      </>
      )}
    </article>
  );
}
