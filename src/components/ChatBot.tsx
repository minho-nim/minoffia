// 챗봇 모드(v0.7.99 소유자 "챗봇형: GPT·Claude에 일반적으로 물어보듯이, 지난 대화는 서버에, 상한 없이").
// v0.8.1 소유자 "기본·챗봇 합치고, 대화 중 업무가 될 것 같으면 업무로 접수 제안": 앱 상태 질문은 미니엉이 규칙으로(모델 0),
// 개발 요청으로 보이면 답 아래 [업무로 접수] 카드(프로젝트 고르기) → 그 프로젝트 업무 대화로 넘겨 평소처럼 접수한다.
// 어느 대화를 열지는 왼쪽 서랍(ChatDrawer)이 정한다. 프로젝트에 묶인 대화는 그 프로젝트 정보·위키를 참고해 답한다.
// 업무 접수 판단 없이 Gemini(Studio A, 안 되면 B)와 대화한다. 앞 대화 30번을 기억하고, 답은 굵게·목록·표·코드로 그린다.
// 지난 대화는 서버(chat_threads)에 두고, 답마다 ChatGPT·Claude에서 이어 묻기(그 앱이 열림, 답은 돌아오지 않음).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChatThread, ChatThreadInfo, ChatTurn, OfficeStore } from '../data/store';
import type { Snapshot } from '../domain/types';
import { triage } from '../domain/triage';
import { projectContext } from '../domain/aiRoute';
import { needsResearch } from '../domain/research';
import { parseMarkdown, type Inline } from '../domain/markdown';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const titleOf = (q: string) => (q.replace(/\s+/g, ' ').trim().slice(0, 40) || '새 대화');
/** 'gemini-3.5-flash' → 'Flash', 'gemini-3.1-flash-lite' → 'Lite 3.1' */
export const modelLabel = (m?: string) => (!m ? '' : /flash-lite/.test(m) ? (/3\.5/.test(m) ? 'Lite' : `Lite ${/(\d+\.\d+)/.exec(m)?.[1] ?? ''}`.trim()) : /flash/.test(m) ? 'Flash' : /pro/.test(m) ? 'Pro' : m);

function Inl({ v }: { v: Inline[] }) {
  return (
    <>
      {v.map((x, i) =>
        x.t === 'b' ? (
          <strong key={i}>{x.v}</strong>
        ) : x.t === 'i' ? (
          <em key={i}>{x.v}</em>
        ) : x.t === 'code' ? (
          <code key={i}>{x.v}</code>
        ) : x.t === 'link' ? (
          <a key={i} href={x.href} target="_blank" rel="noreferrer noopener">
            {x.v}
          </a>
        ) : (
          <Fragment key={i}>{x.v}</Fragment>
        ),
      )}
    </>
  );
}

/** 마크다운 답 그리기(HTML은 그리지 않음) */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <div className="md">
      {blocks.map((b, i): ReactNode => {
        if (b.t === 'p') return <p key={i}><Inl v={b.v} /></p>;
        if (b.t === 'h') return b.level <= 2 ? <h4 key={i}><Inl v={b.v} /></h4> : <h5 key={i}><Inl v={b.v} /></h5>;
        if (b.t === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inl v={it} /></li>)}</ul>;
        if (b.t === 'ol') return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inl v={it} /></li>)}</ol>;
        if (b.t === 'quote') return <blockquote key={i}><Inl v={b.v} /></blockquote>;
        if (b.t === 'hr') return <hr key={i} />;
        if (b.t === 'table')
          return (
            <div key={i} className="md-table">
              <table>
                <thead>
                  <tr>{b.head.map((c, j) => <th key={j}><Inl v={c} /></th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k}><Inl v={c} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <div key={i} className="md-code">
            <div className="md-code-head">
              <span>{b.lang || '코드'}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(b.v).then(() => {
                    setCopied(i);
                    window.setTimeout(() => setCopied(null), 1500);
                  }).catch(() => undefined);
                }}
              >
                {copied === i ? '복사함' : '복사'}
              </button>
            </div>
            <pre>
              <code>{b.v}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}

type Ask = OfficeStore['askGemini'];

const fresh = (projectId: string | null): ChatThread => ({ id: newId(), title: '새 대화', messages: [], updatedAt: new Date().toISOString(), projectId });

export function ChatBot({
  store,
  ask,
  canAsk,
  snap,
  threadId,
  projectId,
  onSaved,
  onTitle,
  onLoaded,
  onToTask,
}: {
  store: OfficeStore;
  ask: Ask;
  canAsk: boolean;
  snap: Snapshot;
  /** 열 대화(null이면 새 대화) */
  threadId: string | null;
  /** 새 대화를 묶을 프로젝트(null이면 프로젝트 없는 채팅) */
  projectId: string | null;
  onSaved?: (info: ChatThreadInfo) => void;
  onTitle?: (title: string) => void;
  /** 지난 대화를 불러왔을 때(묶인 프로젝트를 머리에 보이게) */
  onLoaded?: (info: ChatThreadInfo) => void;
  /** 업무로 접수: 그 프로젝트 업무 대화로 글을 넘긴다 */
  onToTask?: (text: string, projectId: string) => void;
}) {
  const [thread, setThread] = useState<ChatThread>(() => fresh(projectId));
  const [loading, setLoading] = useState(Boolean(threadId));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const threads = store.chatThreads;
  const project = snap.projects.find((p) => p.id === thread.projectId) ?? null;

  useEffect(() => {
    if (!threadId || !threads) return setLoading(false);
    let live = true;
    void threads
      .get(threadId)
      .then((t) => {
        if (live && t) {
          setThread(t);
          onLoaded?.({ id: t.id, title: t.title, updatedAt: t.updatedAt, projectId: t.projectId ?? null });
        }
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [threadId, threads]);
  useEffect(() => {
    onTitle?.(thread.title);
  }, [thread.title, onTitle]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, live]);

  const save = async (t: ChatThread) => {
    if (!threads || !t.messages.length) return;
    try {
      await threads.save(t);
      onSaved?.({ id: t.id, title: t.title, updatedAt: new Date().toISOString(), projectId: t.projectId ?? null });
    } catch (e) {
      setError(`대화를 저장하지 못했어요: ${(e as Error).message}`);
    }
  };
  const update = (t: ChatThread) => {
    setThread(t);
    void save(t);
  };

  const send = async (q: string, base: ChatTurn[], slot?: 1 | 2) => {
    if (!q.trim() || busy) return;
    setError('');
    const text = q.trim();
    const userTurn: ChatTurn = { role: 'user', text, at: new Date().toISOString() };
    const messages = [...base, userTurn];
    const title = base.length ? thread.title : titleOf(text);
    const t = triage(text, snap);
    // 앱 상태 질문("오늘 뭐 했어?")은 규칙 답(모델 0)
    if (t.kind === 'status') {
      update({ ...thread, title, messages: [...messages, { role: 'model', text: t.answer, at: new Date().toISOString(), by: 'office' }] });
      return;
    }
    setBusy(true);
    setLive('');
    setThread((x) => ({ ...x, title, messages }));
    // 개발 요청으로 보이면 답 아래 접수 제안(프로젝트 대화면 그 프로젝트, 아니면 글에 든 프로젝트 → 나머지)
    const suggest: ChatTurn['suggest'] | undefined =
      t.kind === 'request' && onToTask && snap.projects.length
        ? { state: 'open', candidates: project ? [project.id] : t.candidates.map((p) => p.id) }
        : undefined;
    try {
      const history = base.filter((m) => m.by !== 'office').slice(-60).map((m) => ({ role: m.role, text: m.text }));
      const got = await ask(text, history, [], (soFar) => setLive(soFar), {
        chat: true,
        research: needsResearch(text),
        ...(slot ? { slot } : {}),
        ...(project ? { project: projectContext(project, snap.tasks) } : {}),
      });
      const helpers = got.engine ? [`${got.engine} 검색`, ...(got.pages ? [`Firecrawl 본문 ${got.pages}`] : [])] : undefined;
      const answer: ChatTurn = {
        role: 'model',
        text: got.answer,
        at: new Date().toISOString(),
        by: got.keySlot === 2 ? 'B' : 'A',
        ...(got.model ? { model: got.model } : {}),
        ...(helpers ? { helpers } : {}),
        ...(suggest ? { suggest } : {}),
      };
      update({ ...thread, title, messages: [...messages, answer], updatedAt: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message || 'Gemini가 답하지 못했어요. 잠시 뒤 다시 보내 주세요.');
      // 답을 못 받아도 접수 제안은 남긴다(개발 요청이면 답이 없어도 접수할 수 있게)
      const tail: ChatTurn[] = suggest ? [{ role: 'model', text: '답을 받지 못했어요.', at: new Date().toISOString(), by: 'office', suggest }] : [];
      update({ ...thread, title, messages: [...messages, ...tail] });
    } finally {
      setBusy(false);
      setLive('');
    }
  };

  const submit = () => {
    const q = input;
    setInput('');
    void send(q, thread.messages);
  };
  /** 마지막 질문을 다시(같은 키 또는 다른 키로) */
  const retry = (slot?: 1 | 2) => {
    const ms = thread.messages;
    const lastUser = [...ms].map((m, i) => ({ m, i })).reverse().find((x) => x.m.role === 'user');
    if (!lastUser) return;
    void send(lastUser.m.text, ms.slice(0, lastUser.i), slot);
  };
  const handoff = (where: 'chatgpt' | 'claude', q: string) => {
    const url = where === 'chatgpt' ? `https://chatgpt.com/?q=${encodeURIComponent(q)}` : `https://claude.ai/new?q=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener');
  };
  const setSuggest = (i: number, next: NonNullable<ChatTurn['suggest']>) => {
    update({ ...thread, messages: thread.messages.map((m, j) => (j === i ? { ...m, suggest: next } : m)) });
  };

  const lastIndex = thread.messages.length - 1;
  return (
    <section className="chatbot" aria-label={project ? `${project.name} 대화` : '채팅'}>
      <ol className="chatbot-log" aria-live="polite">
        {loading && <li className="muted small">대화를 불러오는 중…</li>}
        {!loading && thread.messages.length === 0 && !busy && (
          <li className="chatbot-empty">
            <p>{project ? `${project.name}에 대해 무엇이든 물어보세요.` : '무엇이든 물어보세요.'}</p>
            <p className="muted small">
              Gemini가 앞 대화 30번을 기억하며 답해요. 개발할 일로 보이면 답 아래에서 바로 업무로 접수할 수 있어요. 무료 Gemini라 Google 한도에 걸리면 잠시 뒤 다시 보내 주세요.
            </p>
          </li>
        )}
        {thread.messages.map((m, i) => {
          const prevQ = [...thread.messages.slice(0, i)].reverse().find((x) => x.role === 'user')?.text ?? '';
          if (m.role === 'user')
            return (
              <li key={`${m.at}-${i}`} className="chatbot-msg from-user">
                <p className="chatbot-q">{m.text}</p>
              </li>
            );
          return (
            <li key={`${m.at}-${i}`} className="chatbot-msg from-model">
              <div className="chatbot-who">
                <b>{m.by === 'office' ? '미니엉' : `Gemini ${m.by ?? 'A'}`}</b>
                {m.model && (
                  <span className="chatbot-model" title={m.model}>
                    {modelLabel(m.model)}
                  </span>
                )}
                {m.helpers?.map((h) => (
                  <span key={h} className="inbox-helper">
                    {h}
                  </span>
                ))}
              </div>
              <Markdown text={m.text} />
              {m.suggest && <Suggest s={m.suggest} snap={snap} onSend={(pid) => (setSuggest(i, { ...m.suggest!, state: 'sent', projectId: pid }), onToTask?.(prevQ, pid))} onDismiss={() => setSuggest(i, { ...m.suggest!, state: 'dismissed' })} />}
              {m.by !== 'office' && (
                <div className="chatbot-tools">
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(m.text).catch(() => undefined)}>
                    복사
                  </button>
                  {i === lastIndex && !busy && (
                    <>
                      <button type="button" onClick={() => retry()}>
                        다시 답하기
                      </button>
                      <button type="button" onClick={() => retry(m.by === 'B' ? 1 : 2)}>
                        {m.by === 'B' ? 'A로' : 'B로'} 다시
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => handoff('chatgpt', prevQ)}>
                    ChatGPT에서
                  </button>
                  <button type="button" onClick={() => handoff('claude', prevQ)}>
                    Claude에서
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {busy && (
          <li className="chatbot-msg from-model">
            <div className="chatbot-who">
              <b>Gemini</b>
            </div>
            {live ? <Markdown text={live} /> : <p className="inbox-typing">답을 쓰는 중…</p>}
          </li>
        )}
      </ol>
      {error && (
        <p className="task-error" role="alert">
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => retry()}>
            다시 보내기
          </button>
        </p>
      )}
      <div ref={endRef} />
      <form
        className="chatbot-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          id="chatbot-input"
          value={input}
          rows={2}
          placeholder={canAsk ? (project ? `${project.name}: 묻거나 시킬 일` : '무엇이든 물어보기') : '로그인하면 Gemini와 대화할 수 있어요'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 휴대폰 Enter는 줄바꿈(소유자 취향), PC는 Ctrl·⌘+Enter로 보내기
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!canAsk}
        />
        <button type="submit" className="btn" disabled={!canAsk || busy || !input.trim()}>
          보내기
        </button>
      </form>
    </section>
  );
}

/** 업무로 접수 제안 카드 */
function Suggest({ s, snap, onSend, onDismiss }: { s: NonNullable<ChatTurn['suggest']>; snap: Snapshot; onSend: (projectId: string) => void; onDismiss: () => void }) {
  const ordered = [...s.candidates.map((id) => snap.projects.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)), ...snap.projects.filter((p) => !s.candidates.includes(p.id))];
  const [pick, setPick] = useState(ordered[0]?.id ?? '');
  if (s.state === 'dismissed') return null;
  if (s.state === 'sent') {
    const name = snap.projects.find((p) => p.id === s.projectId)?.name ?? '프로젝트';
    return <p className="chatbot-suggest is-sent">{name} 업무 대화로 넘겼어요.</p>;
  }
  if (!ordered.length) return null;
  return (
    <div className="chatbot-suggest" role="group" aria-label="업무로 접수 제안">
      <span>개발할 일로 보여요. 업무로 접수할까요?</span>
      <span className="chatbot-suggest-row">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="접수할 프로젝트">
          {ordered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-small" onClick={() => pick && onSend(pick)}>
          업무로 접수
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={onDismiss}>
          아니요
        </button>
      </span>
    </div>
  );
}
