import { useEffect, useRef, useState } from 'react';
import { AGENT_BY_ID } from '../domain/agents';
import { repoNameError, toRepoSlug } from '../../supabase/functions/create-repo/naming';
import { chatGptQuestion, replyIntent, titleFrom, triage } from '../domain/triage';
import { MAX_REQUEST_FILES, validateFile, fileNameFor } from '../domain/attachments';
import type { Project, Snapshot, Task } from '../domain/types';
import type { PendingImage } from './Attachments';
import { RepoCreate } from './RepoCreate';
import type { TaskDraft } from './TaskForm';

/**
 * 업무 탭 맨 위 입력창. AI에게 묻듯 쓰면 규칙이 먼저 나눈다.
 * 업무로 만들기 전에는 반드시 "이 프로젝트 맞아요?"로 확인을 받는다.
 * 일반 질문은 사용자가 버튼을 눌렀을 때만 Gemini(Google)로 보낸다.
 */

type From = 'me' | 'office' | 'gemini';
interface Msg {
  id: string;
  from: From;
  text: string;
}

/** 마지막 안내 메시지에 붙는 선택지 */
type Pending =
  | { kind: 'confirm'; text: string; project: Project }
  | { kind: 'pick'; text: string }
  | { kind: 'question'; text: string }
  | { kind: 'unclear'; text: string }
  /** 새 프로젝트 이름을 기다림. text가 있으면 이름을 받은 뒤 그 요청을 업무로 만든다 */
  | { kind: 'naming'; text: string; createTask?: boolean }
  | { kind: 'repo'; project: Project };

interface Props {
  snap: Snapshot;
  canAskGemini: boolean;
  /** 업무 접수(사진이 있으면 요청 자료로 함께 올린다) */
  onCreateTask: (draft: TaskDraft, images: PendingImage[]) => Promise<Task | null>;
  onCreateProject: (name: string) => Promise<Project | null>;
  onAskGemini: (question: string, history: { role: 'user' | 'model'; text: string }[], images: { mime: string; data: string }[]) => Promise<string>;
  onCopy: (text: string) => Promise<boolean>;
  /** 저장소 만들기를 쓸 수 있으면 함수(Supabase 모드) */
  onCreateRepo?: (project: Project, name: string) => Promise<string | null>;
}

const KEY = 'minlab-ai-office:inbox:v1';
/** 미나가 기다리는 선택(탭을 옮겨도 남게) */
const PENDING_KEY = 'minlab-ai-office:inbox-pending:v1';
const KEEP = 40;
const mid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function readLog(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[];
    return Array.isArray(v) ? v.slice(-KEEP) : [];
  } catch {
    return [];
  }
}

function readPending(): Pending | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    return v && typeof v === 'object' && 'kind' in v ? v : null;
  } catch {
    return null;
  }
}

const FROM_LABEL: Record<From, string> = { me: '나', office: '미나', gemini: 'Gemini' };

/** Gemini 질문에 함께 보낼 수 있는 사진 수(무료 한도·요청 크기 때문) */
const MAX_GEMINI_IMAGES = 3;

/**
 * 탭을 옮겨 입력창이 다시 그려져도 고른 사진이 남도록 화면 밖에 둔다(이 기기, 새로고침하면 사라짐).
 * draft = 입력창에 붙어 있는 사진, held = 보낸 메시지에 딸려 미나의 확인을 기다리는 사진.
 */
const photoStore: { draft: File[]; held: File[] } = { draft: [], held: [] };

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(`${file.name}을(를) 읽지 못했습니다.`));
    r.readAsDataURL(file);
  });

export function Inbox({ snap, canAskGemini, onCreateTask, onCreateProject, onAskGemini, onCopy, onCreateRepo }: Props) {
  const [log, setLog] = useState<Msg[]>(readLog);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [busy, setBusy] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [photos, setPhotosState] = useState<File[]>(photoStore.draft);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const setPhotos = (next: File[]) => {
    photoStore.draft = next;
    setPhotosState(next);
  };
  const addPhotos = (list: FileList | File[]) => {
    const errors: string[] = [];
    const ok: File[] = [];
    [...list].forEach((raw, i) => {
      const file = raw.name && raw.name.includes('.') ? raw : new File([raw], fileNameFor(raw.name, raw.type, photos.length + i), { type: raw.type });
      const err = validateFile(file);
      if (err) errors.push(err);
      else if (photos.length + ok.length >= MAX_REQUEST_FILES) errors.push(`${file.name}: 사진은 ${MAX_REQUEST_FILES}장까지입니다.`);
      else ok.push(file);
    });
    setPhotoErrors(errors);
    if (ok.length) setPhotos([...photos, ...ok]);
  };
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(log.slice(-KEEP)));
    } catch {
      // 저장이 막힌 브라우저에서는 이번 화면에서만 남는다.
    }
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log, pending]);

  useEffect(() => {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      // 저장이 막힌 브라우저
    }
  }, [pending]);

  // 저장된 선택이 가리키는 프로젝트가 지워졌거나 이미 저장소가 생겼으면 선택을 접는다.
  useEffect(() => {
    if (!pending || !('project' in pending)) return;
    const now = snap.projects.find((p) => p.id === pending.project.id);
    if (!now || (pending.kind === 'repo' && now.repo)) setPending(null);
  }, [snap.projects, pending]);

  const say = (from: From, text: string) => setLog((l) => [...l, { id: mid(), from, text }].slice(-KEEP));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const askProject = (text: string) => {
    setShowOther(false);
    setPending({ kind: 'pick', text });
    say('office', '어느 프로젝트 업무인가요? 아래에서 고르거나 새 프로젝트를 만드세요.');
  };

  const handleRequest = (text: string, candidates: Project[]) => {
    if (candidates.length === 1) {
      setPending({ kind: 'confirm', text, project: candidates[0] });
      say('office', `'${candidates[0].name}' 프로젝트 업무로 접수할까요?`);
    } else askProject(text);
  };

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    // 이 메시지에 사진이 있으면 미나의 다음 확인까지 들고 간다. 사진 없는 새 메시지는 이전 사진을 놓는다(확인 답만 할 때는 유지).
    const sent = photos;
    if (sent.length) {
      photoStore.held = sent;
      setPhotos([]);
      setPhotoErrors([]);
    } else if (!pending || !replyIntent(text)) {
      if (pending?.kind !== 'naming') photoStore.held = [];
    }
    say('me', sent.length ? `${text}\n📷 사진 ${sent.length}장` : text);
    // 확인 질문에 버튼 대신 글로 답한 경우("응", "만들어", "아니" 등)
    const yn = replyIntent(text);
    if (pending?.kind === 'repo' && yn) {
      const project = pending.project;
      if (yn === 'no') {
        setPending(null);
        say('office', '저장소는 나중에 프로젝트 탭에서 만들 수 있어요.');
        return;
      }
      const name = toRepoSlug(project.name);
      if (repoNameError(name) || !onCreateRepo) {
        say('office', '저장소 이름을 영문으로 정해야 해요. 아래 칸에 이름을 적고 버튼을 누르세요.');
        return;
      }
      void run(async () => {
        const repo = await onCreateRepo(project, name);
        if (repo) {
          setPending(null);
          say('office', `${repo} 저장소를 만들고 '${project.name}'에 연결했어요.`);
        } else say('office', '저장소를 만들지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
      });
      return;
    }
    if (pending?.kind === 'confirm' && yn) {
      if (yn === 'yes') {
        const { text: original, project } = pending;
        setPending(null);
        void run(() => create(original, project));
      } else {
        setShowOther(true);
        say('office', '그럼 어느 프로젝트인가요? 아래에서 고르세요.');
      }
      return;
    }
    if (pending?.kind === 'naming') {
      const original = pending.createTask === false ? null : pending.text;
      setPending(null);
      void run(() => makeProject(text, original));
      return;
    }
    setPending(null);
    const t = triage(text, snap);
    if (t.kind === 'status') {
      say('office', t.answer);
      if (sent.length) say('office', '사진은 업무 요청이나 질문에만 써요. 다음 메시지에 다시 붙여 주세요.');
      photoStore.held = [];
    }
    else if (t.kind === 'new_project') {
      if (t.name) void run(() => makeProject(t.name!, null));
      else {
        setPending({ kind: 'naming', text: '', createTask: false });
        say('office', '새 프로젝트 이름을 알려주세요.');
      }
    }
    else if (t.kind === 'request') handleRequest(text, t.candidates);
    else if (t.kind === 'question') {
      setPending({ kind: 'question', text });
      say('office', '업무 기록으로는 답할 수 없는 질문이에요. 어디에 물어볼까요?');
    } else {
      setPending({ kind: 'unclear', text });
      say('office', '질문인가요, 업무 요청인가요?');
    }
  };

  /** 프로젝트를 만들고, 원래 요청이 있으면 업무로 접수한 뒤 저장소를 만들지 묻는다. */
  const makeProject = async (rawName: string, original: string | null) => {
    const name = rawName.trim().slice(0, 60);
    const same = snap.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      say('office', `'${same.name}' 프로젝트는 이미 있어요. 그 프로젝트를 쓰거나 다른 이름을 알려주세요.`);
      setPending({ kind: 'naming', text: original ?? '', createTask: original !== null });
      return;
    }
    const project = await onCreateProject(name);
    if (!project) return say('office', '프로젝트를 만들지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    say('office', `'${project.name}' 프로젝트를 만들었습니다.`);
    if (original) await create(original, project);
    if (onCreateRepo) {
      setPending({ kind: 'repo', project });
      say('office', 'GitHub 저장소도 만들까요? 비공개 빈 저장소(README만)를 만들고 이 프로젝트에 연결합니다. ("응"이라고 써도 됩니다)');
    } else say('office', 'GitHub 저장소는 아직 연결되지 않았습니다(프로젝트 탭에서 owner/repo 입력).');
  };

  const create = async (text: string, project: Project) => {
    const title = titleFrom(text);
    const images: PendingImage[] = photoStore.held.map((file, i) => ({ key: `${i}-${file.name}`, file, role: 'reference', note: '' }));
    photoStore.held = [];
    const task = await onCreateTask({
      projectId: project.id,
      title,
      description: text === title ? '' : text,
      requestedType: 'auto',
      priority: 'normal',
      originalText: text,
    }, images);
    if (!task) return say('office', '업무를 저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    say(
      'office',
      `'${project.name}'에 접수했어요: ${task.title}\n담당 ${AGENT_BY_ID[task.assignee].name} · ${task.routeReason}\n아래 업무 카드의 진행 단계에서 ChatGPT 기획부터 하세요.`,
    );
    if (images.length) say('office', `사진 ${images.length}장을 이 업무의 요청 자료로 올렸어요(역할은 '기타 참고', 업무 카드에서 바꿀 수 있어요).`);
  };

  const choose = (project: Project) => {
    if (!pending || pending.kind === 'repo') return;
    const text = pending.text;
    setPending(null);
    say('me', `${project.name} 맞아요`);
    void run(() => create(text, project));
  };

  const askGemini = (text: string) => {
    setPending(null);
    void run(async () => {
      // 이전 Gemini 대화만 문맥으로 보낸다(최근 6개).
      const history: { role: 'user' | 'model'; text: string }[] = [];
      log.forEach((m, i) => {
        if (m.from === 'gemini' && log[i - 1]?.from === 'me') history.push({ role: 'user', text: log[i - 1].text }, { role: 'model', text: m.text });
      });
      const images = photoStore.held.slice(0, MAX_GEMINI_IMAGES);
      if (photoStore.held.length > MAX_GEMINI_IMAGES) say('office', `사진은 앞의 ${MAX_GEMINI_IMAGES}장만 Gemini에 보냅니다.`);
      try {
        const encoded = await Promise.all(images.map(async (f) => ({ mime: f.type, data: await toBase64(f) })));
        say('gemini', await onAskGemini(text, history.slice(-6), encoded));
        photoStore.held = [];
      } catch (e) {
        setPending({ kind: 'question', text });
        say('office', `${(e as Error).message}`);
      }
    });
  };

  const copyGpt = async (text: string) => {
    const ok = await onCopy(chatGptQuestion(text));
    say('office', ok ? '질문을 복사했어요. ChatGPT 대화에 붙여넣으세요(Plus 구독 안, 추가 비용 없음).' : '복사가 막혔어요. 아래 업무 카드의 지시서 칸에서 직접 복사하세요.');
  };

  const others = (exclude?: string) => snap.projects.filter((p) => p.id !== exclude);

  return (
    <section className="inbox" aria-label="묻기·요청 입력창">
      {log.length === 0 && (
        <p className="muted small inbox-note">
          예: "MuscleMap에 다크 모드 추가해줘", "Claude 오늘 몇 번 남았어?", "useEffect가 뭐야?" — 업무로 만들기 전에 프로젝트를 꼭 확인합니다.
        </p>
      )}
      {log.length > 0 && (
        <ol className="inbox-log" aria-live="polite">
          {log.map((m) => (
            <li key={m.id} className={`inbox-msg from-${m.from}`}>
              <span className="inbox-who">{FROM_LABEL[m.from]}</span>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>
      )}

      {pending && !busy && (
        <div className="inbox-actions" role="group" aria-label="선택">
          {pending.kind === 'confirm' && (
            <>
              <button type="button" className="btn btn-small btn-primary" onClick={() => choose(pending.project)}>
                맞아요, 접수
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowOther((v) => !v)}>
                다른 프로젝트
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'question', text: pending.text })}>
                질문이었어요
              </button>
              {showOther && (
                <span className="inbox-choices">
                  {others(pending.project.id).map((p) => (
                    <button key={p.id} type="button" className="btn btn-small btn-ghost" onClick={() => choose(p)}>
                      {p.name}
                    </button>
                  ))}
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'naming', text: pending.text })}>
                    + 새 프로젝트
                  </button>
                </span>
              )}
            </>
          )}
          {pending.kind === 'pick' && (
            <>
              {snap.projects.map((p) => (
                <button key={p.id} type="button" className="btn btn-small btn-ghost" onClick={() => choose(p)}>
                  {p.name}
                </button>
              ))}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'naming', text: pending.text })}>
                + 새 프로젝트
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'question', text: pending.text })}>
                질문이었어요
              </button>
            </>
          )}
          {pending.kind === 'question' && (
            <>
              {canAskGemini && (
                <button type="button" className="btn btn-small btn-primary" onClick={() => askGemini(pending.text)}>
                  Gemini에게 묻기
                </button>
              )}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => void copyGpt(pending.text)}>
                ChatGPT로 복사
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => askProject(pending.text)}>
                사실은 업무 요청이에요
              </button>
              <p className="muted small inbox-note">
                {canAskGemini
                  ? `Gemini에게 묻기를 누르면 이 질문${photoStore.held.length ? `과 사진 ${Math.min(photoStore.held.length, MAX_GEMINI_IMAGES)}장` : ''}이 Google(Gemini 무료)로 갑니다. 비밀번호·개인정보는 넣지 마세요. 질문 글·사진은 AI Office에 저장하지 않습니다.`
                  : '로컬 데모에서는 Gemini를 쓸 수 없습니다.'}
              </p>
            </>
          )}
          {pending.kind === 'unclear' && (
            <>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'question', text: pending.text })}>
                질문이에요
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => askProject(pending.text)}>
                업무 요청이에요
              </button>
            </>
          )}
          {pending.kind === 'naming' && <p className="muted small inbox-note">아래 입력창에 새 프로젝트 이름을 적고 보내세요.</p>}
          {pending.kind === 'repo' && onCreateRepo && (
            <RepoCreate
              project={pending.project}
              onCancel={() => {
                setPending(null);
                say('office', '저장소는 나중에 프로젝트 탭에서 만들 수 있어요.');
              }}
              onCreate={async (project, name) => {
                const repo = await onCreateRepo(project, name);
                if (repo) {
                  setPending(null);
                  say('office', `${repo} 저장소를 만들고 '${project.name}'에 연결했어요.`);
                }
                return repo;
              }}
            />
          )}
        </div>
      )}
      {busy && <p className="muted small inbox-note">처리 중…</p>}
      <div ref={endRef} />

      {photos.length > 0 && (
        <ul className="inbox-photos" aria-label="보낼 사진">
          {photos.map((f, i) => (
            <li key={`${i}-${f.name}`}>
              {previews[i] && <img src={previews[i]} alt={f.name} />}
              <button type="button" className="inbox-photo-x" aria-label={`${f.name} 빼기`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {photoErrors.length > 0 && (
        <ul className="task-error small">
          {photoErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <form
        className="inbox-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files);
        }}
      >
        <button type="button" className="btn btn-ghost inbox-attach" aria-label="사진 첨부" title="사진 첨부(붙여넣기·끌어다 놓기도 됩니다)" disabled={busy} onClick={() => fileInput.current?.click()}>
          📎
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
            if (files.length) {
              e.preventDefault();
              addPhotos(files);
            }
          }}
          id="inbox-input"
          rows={2}
          value={input}
          maxLength={4000}
          placeholder={pending?.kind === 'naming' ? '새 프로젝트 이름' : '묻거나 시킬 일을 적으세요 (Enter로 보내기)'}
          aria-label="묻기·요청"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter로 보내고, Shift+Enter는 줄바꿈. 한글 조합 중 Enter는 무시한다.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          보내기
        </button>
      </form>
      {log.length > 0 && (
        <button
          type="button"
          className="link-btn small"
          onClick={() => {
            // 대화를 지우면 미나가 기다리던 요청(접수 확인·프로젝트 이름·저장소 만들기)도 취소한다.
            // 이미 접수된 업무는 기록이라 지우지 않는다(업무 카드에서 삭제).
            const hadPending = pending !== null;
            photoStore.held = [];
            setPending(null);
            setShowOther(false);
            setLog(hadPending ? [{ id: mid(), from: 'office', text: '진행 중이던 요청을 취소했어요. 이미 접수된 업무는 그대로 있어요(지우려면 업무 카드에서 삭제).' }] : []);
          }}
        >
          {pending ? '대화 지우기 · 진행 중인 요청 취소' : '대화 지우기(이 기기)'}
        </button>
      )}
    </section>
  );
}
