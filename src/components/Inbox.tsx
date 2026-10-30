import { useEffect, useRef, useState } from 'react';
import { AGENT_BY_ID } from '../domain/agents';
import { repoNameError, toRepoSlug } from '../../supabase/functions/create-repo/naming';
import { chatGptQuestion, replyIntent, titleFrom, triage } from '../domain/triage';
import type { Project, Snapshot, Task } from '../domain/types';
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
  onCreateTask: (draft: TaskDraft) => Promise<Task | null>;
  onCreateProject: (name: string) => Promise<Project | null>;
  onAskGemini: (question: string, history: { role: 'user' | 'model'; text: string }[]) => Promise<string>;
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

export function Inbox({ snap, canAskGemini, onCreateTask, onCreateProject, onAskGemini, onCopy, onCreateRepo }: Props) {
  const [log, setLog] = useState<Msg[]>(readLog);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [busy, setBusy] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
    say('me', text);
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
    if (t.kind === 'status') say('office', t.answer);
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
    const task = await onCreateTask({
      projectId: project.id,
      title,
      description: text === title ? '' : text,
      requestedType: 'auto',
      priority: 'normal',
      originalText: text,
    });
    if (!task) return say('office', '업무를 저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    say(
      'office',
      `'${project.name}'에 접수했어요: ${task.title}\n담당 ${AGENT_BY_ID[task.assignee].name} · ${task.routeReason}\n아래 업무 카드의 진행 단계에서 ChatGPT 기획부터 하세요.`,
    );
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
      try {
        say('gemini', await onAskGemini(text, history.slice(-6)));
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
                  ? 'Gemini에게 묻기를 누르면 이 질문이 Google(Gemini 무료)로 갑니다. 비밀번호·개인정보는 넣지 마세요. 질문 글은 AI Office에 저장하지 않습니다.'
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

      <form
        className="inbox-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
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
