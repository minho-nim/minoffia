// 챗봇 모드(v0.7.99 소유자 "챗봇형: GPT·Claude에 일반적으로 물어보듯이, 지난 대화는 서버에, 상한 없이").
// 업무 접수 판단 없이 Gemini(Studio A, 안 되면 B)와 대화한다. 앞 대화 30번을 기억하고, 답은 굵게·목록·표·코드로 그린다.
// 지난 대화는 서버(chat_threads)에 두고, 답마다 ChatGPT·Claude에서 이어 묻기(그 앱이 열림, 답은 돌아오지 않음).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChatThread, ChatTurn, OfficeStore } from '../data/store';
import { needsResearch } from '../domain/research';
import { parseMarkdown, type Inline } from '../domain/markdown';
import { FormPopup } from './FormPopup';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const titleOf = (q: string) => (q.replace(/\s+/g, ' ').trim().slice(0, 40) || '새 대화');
const LAST_KEY = 'minoffia:chatbot:last-thread';
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

export function ChatBot({ store, ask, canAsk }: { store: OfficeStore; ask: Ask; canAsk: boolean }) {
  const [thread, setThread] = useState<ChatThread>(() => ({ id: newId(), title: '새 대화', messages: [], updatedAt: new Date().toISOString() }));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState<{ id: string; title: string; updatedAt: string }[] | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const threads = store.chatThreads;

  // 마지막으로 보던 대화를 다시 연다(서버에서)
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(LAST_KEY);
    } catch {
      /* 저장이 막혀도 새 대화로 */
    }
    if (!id || !threads) return;
    void threads
      .get(id)
      .then((t) => t && setThread(t))
      .catch(() => undefined);
  }, [threads]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, live]);

  const remember = (id: string) => {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* 무시 */
    }
  };
  const save = async (t: ChatThread) => {
    if (!threads || !t.messages.length) return;
    try {
      await threads.save(t);
      remember(t.id);
    } catch (e) {
      setError(`대화를 저장하지 못했어요: ${(e as Error).message}`);
    }
  };

  const send = async (q: string, base: ChatTurn[], slot?: 1 | 2) => {
    if (!q.trim() || busy) return;
    setError('');
    setBusy(true);
    setLive('');
    const userTurn: ChatTurn = { role: 'user', text: q.trim(), at: new Date().toISOString() };
    const messages = [...base, userTurn];
    const title = base.length ? thread.title : titleOf(q);
    setThread((t) => ({ ...t, title, messages }));
    try {
      const history = base.slice(-60).map((m) => ({ role: m.role, text: m.text }));
      const got = await ask(q.trim(), history, [], (soFar) => setLive(soFar), { chat: true, research: needsResearch(q), ...(slot ? { slot } : {}) });
      const helpers = got.engine ? [`${got.engine} 검색`, ...(got.pages ? [`Firecrawl 본문 ${got.pages}`] : [])] : undefined;
      const answer: ChatTurn = { role: 'model', text: got.answer, at: new Date().toISOString(), by: got.keySlot === 2 ? 'B' : 'A', ...(got.model ? { model: got.model } : {}), ...(helpers ? { helpers } : {}) };
      const next = { ...thread, title, messages: [...messages, answer], updatedAt: new Date().toISOString() };
      setThread(next);
      void save(next);
    } catch (e) {
      setError((e as Error).message || 'Gemini가 답하지 못했어요. 잠시 뒤 다시 보내 주세요.');
      const next = { ...thread, title, messages };
      setThread(next);
      void save(next);
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
  /** 마지막 질문을 다시(같은 키 또는 B로) */
  const retry = (slot?: 1 | 2) => {
    const ms = thread.messages;
    const lastUser = [...ms].map((m, i) => ({ m, i })).reverse().find((x) => x.m.role === 'user');
    if (!lastUser) return;
    void send(lastUser.m.text, ms.slice(0, lastUser.i), slot);
  };
  const newThread = () => {
    setThread({ id: newId(), title: '새 대화', messages: [], updatedAt: new Date().toISOString() });
    setError('');
    try {
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* 무시 */
    }
  };
  const openList = () => {
    setListOpen(true);
    setList(null);
    void threads?.list().then(setList).catch((e) => setError((e as Error).message));
  };
  const handoff = (where: 'chatgpt' | 'claude', q: string) => {
    const url = where === 'chatgpt' ? `https://chatgpt.com/?q=${encodeURIComponent(q)}` : `https://claude.ai/new?q=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener');
  };

  const lastIndex = thread.messages.length - 1;
  return (
    <section className="chatbot" aria-label="챗봇 대화">
      <div className="chatbot-head">
        <b className="chatbot-title" title={thread.title}>{thread.title}</b>
        <span className="chatbot-actions">
          <button type="button" className="btn btn-small btn-ghost" onClick={openList} disabled={!threads}>
            지난 대화
          </button>
          <button type="button" className="btn btn-small" onClick={newThread}>
            새 대화
          </button>
        </span>
      </div>
      <ol className="chatbot-log" aria-live="polite">
        {thread.messages.length === 0 && !busy && (
          <li className="chatbot-empty">
            <p>무엇이든 물어보세요. 업무 접수 없이 Gemini와 대화해요.</p>
            <p className="muted small">앞 대화 30번을 기억하고, 답은 굵게·목록·표·코드로 보여 줘요. 무료 Gemini라 Google 한도에 걸리면 잠시 뒤 다시 보내 주세요.</p>
          </li>
        )}
        {thread.messages.map((m, i) => {
          const prevQ = [...thread.messages.slice(0, i)].reverse().find((x) => x.role === 'user')?.text ?? '';
          return (
            <li key={`${m.at}-${i}`} className={`chatbot-msg from-${m.role}`}>
              {m.role === 'user' ? (
                <p className="chatbot-q">{m.text}</p>
              ) : (
                <>
                  <div className="chatbot-who">
                    <b>Gemini {m.by ?? 'A'}</b>
                    {m.model && <span className="chatbot-model" title={m.model}>{modelLabel(m.model)}</span>}
                    {m.helpers?.map((h) => (
                      <span key={h} className="inbox-helper">
                        {h}
                      </span>
                    ))}
                  </div>
                  <Markdown text={m.text} />
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
                </>
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
          placeholder={canAsk ? 'Gemini에게 물어보기' : '로그인하면 Gemini와 대화할 수 있어요'}
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
      {listOpen && (
        <FormPopup title="지난 대화" onClose={() => setListOpen(false)}>
          {list === null ? (
            <p className="muted small">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="muted small">저장된 대화가 없어요.</p>
          ) : (
            <ul className="chatbot-threads">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="chatbot-thread"
                    onClick={() => {
                      void threads?.get(t.id).then((x) => {
                        if (x) {
                          setThread(x);
                          remember(x.id);
                        }
                        setListOpen(false);
                      });
                    }}
                  >
                    <span>{t.title}</span>
                    <small>{new Date(t.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                  </button>
                  <button
                    type="button"
                    className="link-btn small"
                    aria-label={`${t.title} 지우기`}
                    onClick={() => {
                      void threads?.remove(t.id).then(() => {
                        setList((xs) => (xs ?? []).filter((x) => x.id !== t.id));
                        if (thread.id === t.id) newThread();
                      });
                    }}
                  >
                    지우기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormPopup>
      )}
    </section>
  );
}
