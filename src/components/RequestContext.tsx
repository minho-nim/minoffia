import { useState } from 'react';
import {
  LINK_KIND_LABEL,
  LINK_STATUS_LABEL,
  linkBlocker,
  linkInputError,
  MAX_CLARIFICATIONS,
  MAX_LINKS,
  type Clarification,
  type LinkRef,
} from '../domain/requestContext';
import type { Task } from '../domain/types';
import type { WorkflowView } from '../domain/workflow';
import type { WorkflowActions } from './WorkflowPanel';

interface Props {
  task: Task;
  view: WorkflowView;
  links: LinkRef[];
  clarifications: Clarification[];
  canReadLinks: boolean;
  actions: Pick<WorkflowActions, 'readLink' | 'deleteLink' | 'addClarification'>;
}

/** 진행 단계 1번의 링크 읽기와 GPT 확인 질문·답변 기록 */
export function RequestContext({ task, view, links, clarifications, canReadLinks, actions }: Props) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const addBlocked = linkBlocker(view, links.length, 'add');
  const deleteBlocked = linkBlocker(view, links.length, 'delete');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="wf-sub">
        <p className="small">
          <b>링크</b> <span className="muted">· 서버가 한 번 읽어 제목·본문을 남깁니다. 내부망 주소는 막습니다. {MAX_LINKS}개까지</span>
        </p>
        {links.length > 0 && (
          <ul className="link-list">
            {links.map((l) => (
              <li key={l.id} className={`link-item link-${l.status}`}>
                <p className="small link-head">
                  <span className={`pill pill-link-${l.status}`}>{LINK_STATUS_LABEL[l.status]}</span>
                  <span className="muted">{LINK_KIND_LABEL[l.kind]}</span>
                  {/* 막은 주소는 누를 수 없게 글자로만 보인다. */}
                  {l.status === 'blocked' ? (
                    <span className="link-url mono">{l.url}</span>
                  ) : (
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="link-url">
                      {l.title || l.url}
                    </a>
                  )}
                  {!deleteBlocked && (
                    <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(() => actions.deleteLink(l))}>
                      지우기
                    </button>
                  )}
                </p>
                {l.error && <p className="muted small">{l.error}</p>}
                {l.excerpt && (
                  <details>
                    <summary className="small">읽은 내용 보기 ({l.excerpt.length.toLocaleString()}자 · 신뢰할 수 없는 외부 내용)</summary>
                    <pre className="diff-view">{l.excerpt}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {addBlocked ? (
          links.length > 0 && <p className="muted small">{addBlocked}</p>
        ) : !canReadLinks ? (
          <p className="muted small">로컬 데모에서는 링크를 읽을 수 없습니다(Supabase에 연결된 사이트에서 씁니다).</p>
        ) : (
          <form
            className="wf-inline"
            onSubmit={(e) => {
              e.preventDefault();
              const err = linkInputError(url);
              setUrlError(err);
              if (err) return;
              void run(async () => {
                if (await actions.readLink(task, url)) setUrl('');
              });
            }}
          >
            <input
              id={`link-${task.id}`}
              type="url"
              inputMode="url"
              placeholder="https://… (웹페이지·GitHub 파일·이미지 주소)"
              value={url}
              maxLength={2000}
              aria-invalid={urlError ? true : undefined}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="btn btn-small" disabled={busy || !url.trim()}>
              {busy ? '읽는 중…' : '링크 읽기'}
            </button>
          </form>
        )}
        {urlError && <p className="task-error small">{urlError}</p>}
      </div>

      <div className="wf-sub">
        <p className="small">
          <b>확인 질문·답변</b> <span className="muted">· ChatGPT가 물어본 것과 답을 남깁니다(고칠 수 없는 기록)</span>
        </p>
        {clarifications.length > 0 && (
          <ol className="qa-list">
            {clarifications.map((c, i) => (
              <li key={c.id} className="small">
                <p>
                  <b>Q{i + 1}</b> {c.question} {c.specRevision > 0 && <span className="muted">(v{c.specRevision} 기준)</span>}
                </p>
                <p>
                  <b>A{i + 1}</b> {c.answer}
                </p>
              </li>
            ))}
          </ol>
        )}
        {clarifications.length < MAX_CLARIFICATIONS && (
          <form
            className="qa-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (await actions.addClarification(task, question, answer)) {
                  setQuestion('');
                  setAnswer('');
                }
              });
            }}
          >
            <input id={`q-${task.id}`} placeholder="ChatGPT의 질문" value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />
            <input id={`a-${task.id}`} placeholder="내 답" value={answer} maxLength={4000} onChange={(e) => setAnswer(e.target.value)} />
            <button type="submit" className="btn btn-small" disabled={busy || !question.trim() || !answer.trim()}>
              질문·답변 기록
            </button>
          </form>
        )}
      </div>
    </>
  );
}
