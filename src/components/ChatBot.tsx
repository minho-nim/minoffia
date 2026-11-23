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
import { youtubeUrl } from '../domain/youtube';
import { answerSlot, asksSearch, insertMention, mentionOptions, mentionQuery, searchEngineOf } from '../domain/mention';
import { parseCommand, type Parsed } from '../domain/quickCommands';
import { CommandMenu } from './CommandMenu';
import { VoiceInput } from './VoiceInput';
import { checkNumbers } from '../domain/checkNumbers';
import { saveHereSeen, WEATHER_RE, weatherWhereBody } from '../domain/weather';
import { WeatherCard } from './WeatherCard';
import { openInGemini } from '../domain/geminiApp';
import { parseMarkdown, type Inline } from '../domain/markdown';
import { docMime } from '../domain/attachments';
import { CHAT_ACCEPT, chatFileKind, defaultAsk, docText, MAX_DOC_CHARS, pickChatFiles, utf8Base64 } from '../domain/chatDocs';

/** 문서 → Gemini에 함께 보낼 것(PDF는 그대로, 글·Office는 뽑은 글을 text/plain으로) */
async function inlineOf(f: File): Promise<{ mime: string; data: string }> {
  const kind = chatFileKind(f);
  if (kind === 'image') return { mime: f.type, data: await toBase64(f) };
  if (kind === 'pdf') return { mime: 'application/pdf', data: await toBase64(f) };
  let text = '';
  if (kind === 'office') {
    const mime = docMime(f)!;
    const [{ default: JSZip }, office] = await Promise.all([import('jszip'), import('../../supabase/functions/analyze-image/office')]);
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    text = office.officeToText(await office.extractOffice(zip as never, office.OFFICE_KIND[mime]), MAX_DOC_CHARS + 1);
  } else text = await f.text();
  if (!text.trim()) throw new Error(`${f.name}: 읽을 글이 없어요.`);
  return { mime: 'text/plain', data: utf8Base64(docText(f.name, text)) };
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
/** 사진 → base64(앞머리 뺌) */
const toBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    r.readAsDataURL(file);
  });
/** 대화 기록용 작은 미리보기(긴 변 96px JPEG, 몇 KB) */
const thumbOf = (file: File) =>
  new Promise<string>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = 96 / Math.max(img.width, img.height, 1);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * Math.min(1, k)));
      c.height = Math.max(1, Math.round(img.height * Math.min(1, k)));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => (URL.revokeObjectURL(url), resolve(''));
    img.src = url;
  });
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
  onCommand,
  onNewProject,
  onWarm,
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
  /** 빠른 명령(v0.8.5): 화면 이동·대화 열기 */
  onCommand?: (p: Parsed) => void;
  /** "새 프로젝트 만들어줘"(v0.8.14): 기본 업무 대화로 넘겨 평소처럼 만든다 */
  onNewProject?: (text: string) => void;
  /** 입력칸을 누르면 Gemini 서버를 미리 깨운다(첫 답이 빨라짐) */
  onWarm?: () => void;
}) {
  const [thread, setThread] = useState<ChatThread>(() => fresh(projectId));
  const [loading, setLoading] = useState(Boolean(threadId));
  const [input, setInput] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  // @로 답할 AI 고르기(v0.8.14, 업무 대화와 같게): 채팅에서는 Studio A·B·Tavily·Firecrawl만
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const mentionList = mention ? mentionOptions(mention.query).filter((o) => !['Claude', 'Codex'].includes(o.tag)) : [];
  const readMention = (el: HTMLTextAreaElement) => setMention(el.selectionStart === el.selectionEnd ? mentionQuery(el.value, el.selectionStart) : null);
  // 멈추기: 기다리던 답을 버린다(이 번호가 바뀌면 늦게 온 답은 무시)
  const turnNo = useRef(0);
  const warmed = useRef(false);
  const [photoError, setPhotoError] = useState('');
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
  // 새 말이 생길 때만 아래로(v0.8.12 소유자 "대화창 오류": 빈 대화를 열 때도 아래로 밀어 위 머리 줄·안내가 탭 밑에 가려졌다)
  const seenCount = useRef<number | null>(null);
  useEffect(() => {
    const n = thread.messages.length;
    if (seenCount.current === null || loading) {
      if (!loading) seenCount.current = n;
      return;
    }
    if (n > seenCount.current || live) endRef.current?.scrollIntoView({ block: 'nearest' });
    seenCount.current = n;
  }, [thread.messages.length, live, loading]);

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

  const send = async (q: string, base: ChatTurn[], slot?: 1 | 2, files: File[] = []) => {
    if ((!q.trim() && !files.length) || busy) return;
    setError('');
    const text = q.trim() || defaultAsk(files.map((f) => chatFileKind(f) ?? 'text'));
    const pics = files.filter((f) => chatFileKind(f) === 'image');
    const docs = files.filter((f) => chatFileKind(f) !== 'image').map((f) => f.name);
    const thumbs = pics.length ? (await Promise.all(pics.map(thumbOf))).filter(Boolean) : [];
    const userTurn: ChatTurn = { role: 'user', text, at: new Date().toISOString(), ...(thumbs.length ? { thumbs } : {}), ...(docs.length ? { docs } : {}) };
    const messages = [...base, userTurn];
    const title = base.length ? thread.title : titleOf(text);
    const t = triage(text, snap);
    // 앱 상태 질문("오늘 뭐 했어?")은 규칙 답(모델 0)
    if (t.kind === 'status' && !files.length) {
      update({ ...thread, title, messages: [...messages, { role: 'model', text: t.answer, at: new Date().toISOString(), by: 'office' }] });
      return;
    }
    // "새 프로젝트 만들어줘"(v0.8.14): 기본 업무 대화가 이름을 묻고 만든다(채팅에서 하던 그대로)
    if (t.kind === 'new_project' && onNewProject && !files.length) {
      update({ ...thread, title, messages: [...messages, { role: 'model', text: '새 프로젝트는 업무 대화(기본)에서 만들어요. 그쪽으로 넘길게요.', at: new Date().toISOString(), by: 'office' }] });
      onNewProject(text);
      return;
    }
    const myTurn = ++turnNo.current;
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
      const images = files.length ? await Promise.all(files.map(inlineOf)) : [];
      // 날씨(v0.8.13 소유자 "오늘 날씨 물어봤어, Open-Meteo 검색이 됐어"): 업무 대화처럼 설정한 지역·현재 위치를 보내고 표로 보인다
      const wantsWeather = !files.length && WEATHER_RE.test(text);
      const where = wantsWeather ? await weatherWhereBody().catch(() => undefined) : undefined;
      const got = await ask(text, history, images, (soFar) => myTurn === turnNo.current && setLive(soFar), {
        ...(where ? { where } : {}),
        chat: true,
        // 유튜브 링크(v0.8.3·v0.8.5)면 웹 조사 대신 Gemini가 영상을 직접 본다
        research: !youtubeUrl(text) && (needsResearch(text) || asksSearch(text)),
        // @StudioA·@StudioB면 그 키 먼저, @Firecrawl이면 Firecrawl로 먼저 찾기
        ...(slot ?? answerSlot(text) ? { slot: (slot ?? answerSlot(text))! } : {}),
        ...(searchEngineOf(text) ? { engine: searchEngineOf(text)! } : {}),
        ...(project ? { project: projectContext(project, snap.tasks) } : {}),
      });
      if (myTurn !== turnNo.current) return;
      if (got.weather && where && 'lat' in where) saveHereSeen(got.weather.place);
      const helpers = got.weather ? [`${got.engine ?? 'Open-Meteo'} 날씨`] : got.video ? ['YouTube 영상'] : got.engine ? [`${got.engine} 검색`, ...(got.pages ? [`Firecrawl 본문 ${got.pages}`] : [])] : undefined;
      const answer: ChatTurn = {
        role: 'model',
        text: got.answer,
        at: new Date().toISOString(),
        // 날씨는 모델이 아니라 규칙(숫자 그대로)이라 미니엉이 답한다
        by: got.weather ? 'office' : got.keySlot === 2 ? 'B' : 'A',
        ...(got.weather ? { weather: got.weather } : {}),
        ...(got.model ? { model: got.model } : {}),
        ...(helpers ? { helpers } : {}),
        ...(got.sources?.length ? { sources: got.sources.map((x) => ({ title: x.title, uri: x.uri })) } : {}),
        ...(suggest ? { suggest } : {}),
      };
      update({ ...thread, title, messages: [...messages, answer], updatedAt: new Date().toISOString() });
    } catch (e) {
      if (myTurn !== turnNo.current) return;
      setError((e as Error).message || 'Gemini가 답하지 못했어요. 잠시 뒤 다시 보내 주세요.');
      // 답을 못 받아도 접수 제안은 남긴다(개발 요청이면 답이 없어도 접수할 수 있게)
      // 유튜브 요약이 안 되면(비공개·너무 긴 영상·한도) Gemini 앱에서 이어 하기 버튼
      const yt = youtubeUrl(text) ? { yt: text } : {};
      const tail: ChatTurn[] = suggest || youtubeUrl(text) ? [{ role: 'model', text: youtubeUrl(text) ? '여기서는 영상을 요약하지 못했어요. Gemini 앱에서 이어 할 수 있어요(부탁 글이 복사돼요).' : '답을 받지 못했어요.', at: new Date().toISOString(), by: 'office', ...(suggest ? { suggest } : {}), ...yt }] : [];
      update({ ...thread, title, messages: [...messages, ...tail] });
    } finally {
      if (myTurn === turnNo.current) {
        setBusy(false);
        setLive('');
      }
    }
  };
  /** 멈추기: 기다리던 답은 버리고(늦게 와도 무시) 바로 다시 보낼 수 있게 */
  const stop = () => {
    turnNo.current += 1;
    setBusy(false);
    setLive('');
    update({ ...thread, messages: [...thread.messages, { role: 'model', text: '멈췄어요. 다시 보내면 새로 답해요.', at: new Date().toISOString(), by: 'office' }] });
  };
  const pickMention = (tag: string) => {
    const el = document.getElementById('chatbot-input') as HTMLTextAreaElement | null;
    if (!el || !mention) return;
    const next = insertMention(el.value, el.selectionStart, mention.start, tag);
    setInput(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  /** 빠른 명령이면 실행하고 true(/검색은 웹 조사로 묻기) */
  const runCommand = (q: string): boolean => {
    const p = q.trim().startsWith('/') ? parseCommand(q, snap.projects) : null;
    if (!p) return false;
    if (p.cmd.id === 'search') {
      if (p.arg) void send(`@Tavily ${p.arg}`, thread.messages);
      else setInput('/검색 ');
      return true;
    }
    onCommand?.(p);
    return true;
  };
  const submit = () => {
    const q = input;
    const files = photos;
    setInput('');
    setPhotos([]);
    setPhotoError('');
    const box = document.getElementById('chatbot-input');
    if (box) box.style.height = '';
    if (!files.length && runCommand(q)) return;
    void send(q, thread.messages, undefined, files);
  };
  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const { ok, error } = pickChatFiles(photos, [...list]);
    setPhotoError(error);
    if (ok.length) setPhotos((xs) => [...xs, ...ok]);
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
                {m.thumbs?.length ? (
                  <span className="chatbot-thumbs">
                    {m.thumbs.map((t, j) => (
                      <img key={j} src={t} alt={`보낸 사진 ${j + 1}`} />
                    ))}
                  </span>
                ) : null}
                {m.docs?.length ? (
                  <span className="chatbot-docs">
                    {m.docs.map((d, j) => (
                      <span key={j} className="chatbot-doc">
                        {d}
                      </span>
                    ))}
                  </span>
                ) : null}
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
              {m.weather ? <WeatherCard data={m.weather} /> : <Markdown text={m.text} />}
              {m.by !== 'office' && <Proof m={m} />}
              {m.yt && (
                <div className="chatbot-yt">
                  <button type="button" className="btn btn-small" onClick={() => openInGemini(m.yt!)}>
                    Gemini 앱에서 이어 하기
                  </button>
                </div>
              )}
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
            <div className="chatbot-tools">
              <button type="button" onClick={stop}>
                멈추기
              </button>
            </div>
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
        className="inbox-form chatbot-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mentionList.length > 0 && (
          <ul className="mention-pop" role="listbox" aria-label="답할 AI 고르기">
            {mentionList.map((o) => (
              <li key={o.tag}>
                <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(o.tag)}>
                  <b>@{o.tag}</b> <span>{o.ko} · {o.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <CommandMenu
          input={input}
          projects={snap.projects}
          onPick={(c) => {
            if (c.run) {
              setInput('');
              runCommand(c.text);
            } else {
              setInput(c.text);
              document.getElementById('chatbot-input')?.focus();
            }
          }}
        />
        {(photos.length > 0 || photoError) && (
          <div className="chatbot-pending">
            {photos.map((f, i) => (
              <span key={`${f.name}-${i}`} className="chatbot-pending-item">
                {f.name}
                <button type="button" aria-label={`${f.name} 빼기`} onClick={() => setPhotos((xs) => xs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            {photoError && <span className="task-error">{photoError}</span>}
          </div>
        )}
        <textarea
          id="chatbot-input"
          value={input}
          rows={1}
          placeholder={canAsk ? (project ? `${project.name}: 묻거나 시킬 일` : '무엇이든 물어보기') : '로그인하면 Gemini와 대화할 수 있어요'}
          onFocus={() => {
            if (!warmed.current) {
              warmed.current = true;
              onWarm?.();
            }
          }}
          onSelect={(e) => readMention(e.currentTarget)}
          onChange={(e) => {
            setInput(e.target.value);
            readMention(e.target);
            // 글을 쓰면 늘어난다(6줄쯤까지, 그 뒤는 안에서 스크롤)
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addPhotos(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            // 휴대폰 Enter는 줄바꿈(소유자 취향), PC는 Ctrl·⌘+Enter로 보내기
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!canAsk}
        />
        {/* v0.8.11 소유자 "채팅창 왜 바뀜?": 업무 대화 입력창과 같은 모양(왼쪽 [+], 오른쪽 [마이크][↑]) */}
        <div className="inbox-tools">
          <label className={`inbox-icon inbox-plus${!canAsk || busy ? ' is-off' : ''}`} aria-label="사진·문서 붙이기" title="사진·문서 붙이기(사진은 붙여넣기도 됩니다)">
            <input type="file" accept={CHAT_ACCEPT} multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} disabled={!canAsk || busy} />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </label>
          <span className="inbox-tools-gap" />
          <VoiceInput disabled={!canAsk || busy} onText={(t) => setInput((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t))} />
          <button type="submit" className="inbox-send" aria-label="보내기" title="보내기" disabled={!canAsk || busy || (!input.trim() && !photos.length)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
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

/** 답 아래 투명성 줄(v0.8.6): 출처 n · 확인할 숫자 n · 자료 저장. 누르면 펼친다 */
function Proof({ m }: { m: ChatTurn }) {
  const [open, setOpen] = useState<'src' | 'num' | null>(null);
  const nums = useMemo(() => checkNumbers(m.text), [m.text]);
  const src = m.sources ?? [];
  if (!src.length && !nums.length) return null;
  return (
    <div className="chatbot-proof">
      <span className="chatbot-proof-row">
        {src.length > 0 && (
          <button type="button" aria-expanded={open === 'src'} onClick={() => setOpen(open === 'src' ? null : 'src')}>
            출처 {src.length}
          </button>
        )}
        {nums.length > 0 && (
          <button type="button" className="is-warn" aria-expanded={open === 'num'} onClick={() => setOpen(open === 'num' ? null : 'num')}>
            확인할 숫자 {nums.length}
          </button>
        )}
        {src.length > 0 && <small>옵시디언 '자료'에 모아 둬요</small>}
      </span>
      {open === 'src' && (
        <ol className="chatbot-proof-list">
          {src.map((x) => (
            <li key={x.uri}>
              <a href={x.uri} target="_blank" rel="noreferrer noopener">
                {x.title}
              </a>
            </li>
          ))}
        </ol>
      )}
      {open === 'num' && (
        <ul className="chatbot-proof-list">
          <li className="muted">출처 번호가 없는 숫자예요. 쓰기 전에 확인해 보세요.</li>
          {nums.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
