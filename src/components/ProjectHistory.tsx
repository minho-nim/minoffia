import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '../domain/devlog';
import { projectHistory } from '../domain/devlog';
import type { Snapshot } from '../domain/types';

interface Props {
  snap: Snapshot;
  projectId: string;
  /** 기간의 대화 기록(시간순) */
  loadChat: (fromIso: string, toIso: string) => Promise<ChatEntry[]>;
  onOpenTask?: (taskId: string) => void;
}

/** 대화 기록은 최근 90일만 읽는다 */
const DAYS = 90;
/** 처음에 보이는 날짜 수(더 보기로 늘림) */
const PAGE = 5;

/**
 * 프로젝트 '한 일 기록'(v0.4.74): 업무 기록(접수·기획서·승인·계획·결과·PR·배포)과 그 프로젝트 대화를
 * 날짜별로 최근 것부터 보여 준다. 처음 펼칠 때 대화 기록을 한 번 읽는다(AI 호출 없음).
 */
export function ProjectHistory({ snap, projectId, loadChat, onOpenTask }: Props) {
  const [chat, setChat] = useState<ChatEntry[] | null>(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(PAGE);
  // 부모가 매번 새 함수를 넘겨도 한 번만 읽는다.
  const load = useRef(loadChat);

  useEffect(() => {
    let alive = true;
    const to = new Date(Date.now() + 60_000).toISOString();
    const from = new Date(Date.now() - DAYS * 86400_000).toISOString();
    load.current(from, to)
      .then((c) => alive && setChat(c))
      .catch((e: Error) => {
        if (!alive) return;
        setChat([]);
        setError(`대화 기록을 읽지 못해 업무 기록만 보여요(${e.message}).`);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!chat) return <p className="muted small">기록을 읽는 중…</p>;
  const days = projectHistory(snap, chat, projectId);
  if (!days.length) return <p className="muted small">아직 기록이 없어요. 이 프로젝트로 요청하면 접수부터 배포까지 여기에 쌓여요.</p>;

  return (
    <div className="project-history">
      {error && <p className="muted small">{error}</p>}
      {days.slice(0, shown).map(({ day, items }) => (
        <section key={day} className="history-day">
          <h4>{day}</h4>
          <ul>
            {items.map((it, i) => (
              <li key={`${it.at}-${i}`} className={it.kind === 'chat' ? 'is-chat' : 'is-task'}>
                <span className="history-time">{it.time}</span>
                <span className="history-body">
                  {it.taskId && it.taskTitle && items[i - 1]?.taskId !== it.taskId && (
                    <button type="button" className="link-btn small history-task" onClick={() => onOpenTask?.(it.taskId!)} disabled={!onOpenTask}>
                      {it.taskTitle}
                    </button>
                  )}
                  {it.more ? (
                    <details>
                      <summary>{it.head}</summary>
                      <span className="history-more">{it.more}</span>
                    </details>
                  ) : (
                    <span>{it.head}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {days.length > shown && (
        <button type="button" className="link-btn small" onClick={() => setShown((n) => n + PAGE)}>
          이전 기록 더 보기 ({days.length - shown}일 남음)
        </button>
      )}
    </div>
  );
}
