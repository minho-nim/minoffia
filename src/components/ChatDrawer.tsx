// 대화 서랍(v0.8.1 소유자 "프로젝트별 채팅창 > 대화 구조, ☰나 왼쪽에서 끌어와 연다"):
// 맨 위 [새 채팅], 프로젝트 없는 채팅(챗봇 대화) 목록, 프로젝트마다 [업무 대화] + 그 프로젝트 대화들 + [새 대화].
// 프로젝트 이름 옆에는 확인된 상태만: 일하는 중(진행 업무 수)·내 차례(승인 기다림 수).
import { useEffect, useState } from 'react';
import type { ChatThreadInfo } from '../data/store';
import type { Project, Task } from '../domain/types';

export type ChatSel = { kind: 'bot'; threadId: string | null; projectId: string | null } | { kind: 'work'; projectId: string | null };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
};

export function ChatDrawer({
  open,
  onClose,
  sel,
  onPick,
  threads,
  onRemove,
  projects,
  tasks,
  turnsByProject,
  hasLegacy,
}: {
  open: boolean;
  onClose: () => void;
  sel: ChatSel;
  onPick: (s: ChatSel) => void;
  threads: ChatThreadInfo[] | null;
  onRemove: (id: string) => void;
  projects: Project[];
  tasks: Task[];
  turnsByProject: Map<string, number>;
  /** 예전 '기본' 대화창을 보일지 */
  hasLegacy: boolean;
}) {
  // 펼친 프로젝트: 고른 대화의 프로젝트는 늘 펼친다
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const selProject = sel.projectId;
  useEffect(() => {
    if (open && selProject) setExpanded((s) => (s.has(selProject) ? s : new Set(s).add(selProject)));
  }, [open, selProject]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const pick = (s: ChatSel) => {
    onPick(s);
    onClose();
  };
  const ids = new Set(projects.map((p) => p.id));
  const free = (threads ?? []).filter((t) => !t.projectId || !ids.has(t.projectId));
  const isBot = (id: string) => sel.kind === 'bot' && sel.threadId === id;
  const row = (t: ChatThreadInfo) => (
    <li key={t.id} className={`cd-item${isBot(t.id) ? ' is-on' : ''}`}>
      <button type="button" className="cd-link" aria-current={isBot(t.id) ? 'page' : undefined} onClick={() => pick({ kind: 'bot', threadId: t.id, projectId: t.projectId })}>
        <span className="cd-name">{t.title}</span>
        <small>{when(t.updatedAt)}</small>
      </button>
      <button type="button" className="cd-del" aria-label={`${t.title} 지우기`} onClick={() => onRemove(t.id)}>
        ×
      </button>
    </li>
  );
  return (
    <div className={`cd-wrap${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <button type="button" className="cd-scrim" aria-label="대화 목록 닫기" tabIndex={open ? 0 : -1} onClick={onClose} />
      <nav className="cd" aria-label="대화 목록">
        <div className="cd-top">
          <b>대화</b>
          <button type="button" className="cd-x" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <button type="button" className="cd-new" onClick={() => pick({ kind: 'bot', threadId: null, projectId: null })}>
          + 새 채팅
        </button>
        <h3 className="cd-h">채팅</h3>
        {threads === null ? (
          <p className="cd-empty">불러오는 중…</p>
        ) : free.length === 0 ? (
          <p className="cd-empty">아직 채팅이 없어요.</p>
        ) : (
          <ul className="cd-list">{free.map(row)}</ul>
        )}
        <h3 className="cd-h">프로젝트</h3>
        <ul className="cd-list">
          {projects.map((p) => {
            const working = tasks.filter((t) => t.projectId === p.id && t.status === 'in_progress').length;
            const turn = turnsByProject.get(p.id) ?? 0;
            const on = expanded.has(p.id);
            const mine = (threads ?? []).filter((t) => t.projectId === p.id);
            const workOn = sel.kind === 'work' && sel.projectId === p.id;
            return (
              <li key={p.id} className="cd-project">
                <button
                  type="button"
                  className="cd-link cd-phead"
                  aria-expanded={on}
                  onClick={() => setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  })}
                >
                  <span className="cd-name">{p.name}</span>
                  <span className="cd-caret" aria-hidden>{on ? '⌄' : '›'}</span>
                  {working > 0 && <span className="cd-busy" title={`일하는 중 ${working}`} aria-label={`일하는 중 ${working}`} />}
                  {turn > 0 && <span className="cd-turn" title={`내 차례 ${turn}`}>{turn}</span>}
                </button>
                {on && (
                  <ul className="cd-sub">
                    <li className={`cd-item${workOn ? ' is-on' : ''}`}>
                      <button type="button" className="cd-link" aria-current={workOn ? 'page' : undefined} onClick={() => pick({ kind: 'work', projectId: p.id })}>
                        <span className="cd-name">업무 대화</span>
                        {turn > 0 && <small className="cd-turn-text">내 차례 {turn}</small>}
                      </button>
                    </li>
                    {mine.map(row)}
                    <li>
                      <button type="button" className="cd-link cd-subnew" onClick={() => pick({ kind: 'bot', threadId: null, projectId: p.id })}>
                        + 이 프로젝트에서 새 대화
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {hasLegacy && (
          <button type="button" className={`cd-legacy${sel.kind === 'work' && sel.projectId === null ? ' is-on' : ''}`} onClick={() => pick({ kind: 'work', projectId: null })}>
            예전 기본 대화 보기
          </button>
        )}
      </nav>
    </div>
  );
}
