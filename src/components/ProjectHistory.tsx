import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '../domain/devlog';
import { projectStory, STEP_LABEL } from '../domain/projectHistory';
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
/** 처음에 보이는 업무 수(더 보기로 늘림) */
const PAGE = 5;

/**
 * 프로젝트 '한 일 기록'(v0.4.74, 읽기 쉽게 v0.4.75): 업무마다 접수부터 배포까지 단계 이름표와 한 줄로.
 * 최근에 움직인 업무가 위, 맨 위 업무만 펼쳐 둔다. 대화는 '대화도 보기'를 켜야 보인다(AI 호출 없음).
 */
export function ProjectHistory({ snap, projectId, loadChat, onOpenTask }: Props) {
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [withChat, setWithChat] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(PAGE);
  // 부모가 매번 새 함수를 넘겨도 한 번만 읽는다(대화도 보기를 처음 켤 때).
  const load = useRef(loadChat);

  useEffect(() => {
    if (!withChat || loaded) return;
    let alive = true;
    const to = new Date(Date.now() + 60_000).toISOString();
    const from = new Date(Date.now() - DAYS * 86400_000).toISOString();
    load
      .current(from, to)
      .then((c) => {
        if (!alive) return;
        setChat(c);
        setLoaded(true);
      })
      .catch((e: Error) => alive && setError(`대화 기록을 읽지 못했어요(${e.message}).`));
    return () => {
      alive = false;
    };
  }, [withChat, loaded]);

  const story = projectStory(snap, chat, projectId, withChat);
  return (
    <div className="project-history">
      <div className="history-summary">
        <span>
          업무 <b>{story.counts.total}</b> · 끝남 <b>{story.counts.done}</b> · 진행 <b>{story.counts.active}</b>
          {story.lastDay && <span className="muted"> · 최근 {story.lastDay.slice(5).replace('-', '/')}</span>}
        </span>
        <label className="history-chat-toggle">
          <input type="checkbox" checked={withChat} onChange={(e) => setWithChat(e.target.checked)} /> 대화도 보기
        </label>
      </div>
      {error && <p className="muted small">{error}</p>}
      {!story.tasks.length && <p className="muted small">아직 기록이 없어요. 이 프로젝트로 요청하면 접수부터 배포까지 여기에 쌓여요.</p>}
      {story.tasks.slice(0, shown).map((t, ti) => (
        <details key={t.taskId ?? 'loose'} className="history-task-card" open={ti === 0}>
          <summary>
            <span className="history-task-title">{t.title}</span>
            {t.statusLabel && <span className={`pill history-status is-${t.status}`}>{t.statusLabel}</span>}
            <span className="muted small history-last">{t.items.at(-1)?.day.slice(5).replace('-', '/')}</span>
          </summary>
          <ol className="history-steps">
            {t.items.map((it, i) => (
              <li key={`${it.at}-${i}`} className={`step-${it.step}${it.warn ? ' is-warn' : ''}`}>
                <span className="history-when">{i === 0 || t.items[i - 1].day !== it.day ? `${it.day.slice(5).replace('-', '/')} ` : ''}{it.time}</span>
                <span className="history-step">{STEP_LABEL[it.step]}</span>
                {it.detail ? (
                  <details className="history-line">
                    <summary>{it.line}</summary>
                    <span className="history-more">{it.detail}</span>
                  </details>
                ) : (
                  <span className="history-line">{it.line}</span>
                )}
              </li>
            ))}
          </ol>
          {t.taskId && onOpenTask && (
            <button type="button" className="link-btn small" onClick={() => onOpenTask(t.taskId!)}>
              업무 카드 보기 →
            </button>
          )}
        </details>
      ))}
      {story.tasks.length > shown && (
        <button type="button" className="link-btn small" onClick={() => setShown((n) => n + PAGE)}>
          이전 업무 더 보기 ({story.tasks.length - shown}개 남음)
        </button>
      )}
    </div>
  );
}
