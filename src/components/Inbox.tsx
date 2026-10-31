import { useEffect, useRef, useState } from 'react';
import { repoNameError, toRepoSlug } from '../../supabase/functions/create-repo/naming';
import { chatGptFollowup, chatGptQuestion, matchProjects, priorChatText, questionProject, replyIntent, titleFrom, triage, type PriorChat } from '../domain/triage';
import { ACCEPT_REQUEST, isImage, isRaster, MAX_REQUEST_FILES, MIME_EXT, prepareFile, validateFile } from '../domain/attachments';
import type { Project, Snapshot, Task } from '../domain/types';
import { stageNotices, type NoticeAction } from '../domain/stageNotice';
import { deriveWorkflow } from '../domain/workflow';
import type { InboxState, NewChatEntry } from '../data/store';
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
  /** 단계 알림: 그 업무가 아직 이 단계일 때만 버튼을 보인다 */
  taskId?: string;
  stage?: string;
  actions?: NoticeAction[];
}

/** 마지막 안내 메시지에 붙는 선택지 */
type Pending =
  /** context: 바로 앞 Gemini 질문·답을 이어서 개발 요청으로 접수할 때 */
  | { kind: 'confirm'; text: string; project: Project; context?: PriorChat }
  | { kind: 'pick'; text: string; context?: PriorChat }
  | { kind: 'question'; text: string; projectName?: string }
  /** Gemini가 답한 뒤: GPT에게 이어서 묻기 */
  | { kind: 'followup'; text: string; answer: string }
  | { kind: 'unclear'; text: string }
  /** 새 프로젝트 이름을 기다림. text가 있으면 이름을 받은 뒤 그 요청을 업무로 만든다 */
  | { kind: 'naming'; text: string; createTask?: boolean; context?: PriorChat }
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
  /** 대화를 계정에 저장해 다른 기기에서 이어 본다(Supabase 모드). 없으면 이 기기에만 남는다. */
  sync?: { load: () => Promise<InboxState | null>; save: (state: InboxState) => Promise<void> };
  /** 대화 기록(개발일지 원본)에 추가. 프로젝트 업무와 연결된 메시지만 보낸다(일반 대화·질문은 남기지 않음). */
  onArchive?: (entries: NewChatEntry[]) => Promise<void>;
  /** 접수 직후 Gemini 기획서 초안을 자동으로 시작한다(Supabase 모드). 없으면 ChatGPT 기획을 안내한다. */
  onAutoDraft?: (task: Task) => void;
  /** Gemini 초안의 확인 질문에 입력창으로 답했을 때: 답을 기록하면 Gemini가 다시 쓴다 */
  onClarify?: (task: Task, question: string, answer: string) => Promise<boolean>;
  /** 단계 알림의 "업무 카드 보기" */
  onShowTask?: (taskId: string) => void;
  /** 단계 알림에서 바로 A·B 승인(업무 카드의 같은 버튼과 같은 규칙). 성공하면 true */
  onApprove?: (task: Task, gate: 'A' | 'B') => Promise<boolean>;
}

const KEY = 'minlab-ai-office:inbox:v1';
/** 휴대폰·태블릿(손가락 입력)에서는 Claude 앱처럼 Enter가 줄바꿈이고 보내기 버튼으로만 보낸다. */
const touchInput = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};
/** 이 기기가 마지막으로 본 업무 단계(업무 id → 단계·버전). 바뀌면 미니엉이 알린다. */
const SEEN_KEY = 'minlab-ai-office:stage-seen:v1';
/** Gemini 답 바로 뒤에 이어 묻는 말로 보는 길이(이보다 길고 애매하면 질문인지 업무인지 묻는다) */
const FOLLOWUP_MAX = 60;
/** 미니엉이 기다리는 선택(탭을 옮겨도 남게) */
const PENDING_KEY = 'minlab-ai-office:inbox-pending:v1';
/** 아직 서버 대화 기록에 못 올린 메시지(연결이 끊겼을 때 다음에 다시 올린다) */
const OUTBOX_KEY = 'minlab-ai-office:chat-outbox:v1';

function readOutbox(): NewChatEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as NewChatEntry[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: NewChatEntry[]) {
  try {
    if (list.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-500)));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // 저장이 막힌 브라우저
  }
}

/** 이 기기 대화를 마지막으로 바꾼(또는 서버에서 받은) 시각 */
const STAMP_KEY = 'minlab-ai-office:inbox-updated:v1';
const KEEP = 40;
/** 다른 기기에서 바꾼 대화를 확인하는 간격 */
const SYNC_POLL_MS = 15_000;

function readStamp(): string {
  try {
    return localStorage.getItem(STAMP_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStamp(v: string) {
  try {
    localStorage.setItem(STAMP_KEY, v);
  } catch {
    // 저장이 막힌 브라우저
  }
}
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

const FROM_LABEL: Record<From, string> = { me: '나', office: '미니엉', gemini: 'Gemini' };

/** Gemini 질문에 함께 보낼 수 있는 사진 수(무료 한도·요청 크기 때문) */
const MAX_GEMINI_IMAGES = 3;

/**
 * 탭을 옮겨 입력창이 다시 그려져도 고른 사진이 남도록 화면 밖에 둔다(이 기기, 새로고침하면 사라짐).
 * draft = 입력창에 붙어 있는 사진, held = 보낸 메시지에 딸려 미니엉의 확인을 기다리는 사진.
 */
const photoStore: { draft: File[]; held: File[] } = { draft: [], held: [] };

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(`${file.name}을(를) 읽지 못했습니다.`));
    r.readAsDataURL(file);
  });

function readSeen(): Record<string, string> | null {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as Record<string, string> | null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const ACTION_LABEL: Record<NoticeAction, string> = { open: '업무 카드 보기', A: 'A 승인', B: 'B 승인(GitHub 업로드)' };

export function Inbox({ snap, canAskGemini, onCreateTask, onCreateProject, onAskGemini, onCopy, onCreateRepo, sync, onArchive, onShowTask, onApprove, onAutoDraft, onClarify }: Props) {
  const [log, setLog] = useState<Msg[]>(readLog);
  const logRef = useRef(log);
  logRef.current = log;
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [busy, setBusy] = useState(false);
  // 계정 대화를 처음 받아 온 뒤에 단계 알림을 넣는다(받아 온 대화에 덮이지 않게).
  const [syncReady, setSyncReady] = useState(!sync);
  const [showOther, setShowOther] = useState(false);
  const [photos, setPhotosState] = useState<File[]>(photoStore.draft);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 입력칸은 쓴 만큼 늘어난다(최대 높이는 CSS max-height). 보내서 비우면 다시 줄어든다.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [input]);

  const setPhotos = (next: File[]) => {
    photoStore.draft = next;
    setPhotosState(next);
  };
  const addPhotos = (list: FileList | File[]) => {
    const errors: string[] = [];
    const ok: File[] = [];
    [...list].forEach((raw, i) => {
      // 업무 요청 자료가 될 수 있으므로 문서도 받는다(Gemini 질문에는 이미지만 보낸다).
      const file = prepareFile(raw, photos.length + i, true);
      const err = validateFile(file, true);
      if (err) errors.push(err);
      else if (photos.length + ok.length >= MAX_REQUEST_FILES) errors.push(`${file.name}: 첨부는 ${MAX_REQUEST_FILES}개까지입니다.`);
      else ok.push(file);
    });
    setPhotoErrors(errors);
    if (ok.length) setPhotos([...photos, ...ok]);
  };
  useEffect(() => {
    const urls = photos.map((f) => (isImage(f.type) ? URL.createObjectURL(f) : ''));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(log.slice(-KEEP)));
    } catch {
      // 저장이 막힌 브라우저에서는 이번 화면에서만 남는다.
    }
    // 대화 상자 안을 맨 아래(새 메시지)로 내리고, 화면도 입력창이 보이게 맞춘다.
    const box = listRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log, pending, busy]);

  useEffect(() => {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      // 저장이 막힌 브라우저
    }
  }, [pending]);

  // 계정 동기화: 이 기기에서 바꾼 대화는 잠시 뒤 서버에 저장하고, 다른 기기에서 바꾼 것은 주기적으로 받아 온다.
  // 마지막에 바꾼 쪽이 이긴다(한 사람이 쓰는 앱이라 동시에 두 기기에서 쓰는 일은 드물다).
  const adopting = useRef(false);
  const dirty = useRef(false);
  const loaded = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    if (!sync) return;
    let alive = true;
    const pull = async () => {
      if (dirty.current || busyRef.current) return;
      try {
        const remote = await sync.load();
        if (!alive) return;
        if (!remote) {
          // 서버에 아직 없으면 이 기기 대화를 올린다(처음 한 번).
          if (!loaded.current && readLog().length) dirty.current = true;
        } else if (remote.updatedAt > readStamp()) {
          adopting.current = true;
          setLog((Array.isArray(remote.messages) ? (remote.messages as Msg[]) : []).slice(-KEEP));
          setPending((remote.pending as Pending | null) ?? null);
          writeStamp(remote.updatedAt);
        }
      } catch {
        // 연결이 끊겨도 이 기기 대화는 그대로 쓴다.
      } finally {
        loaded.current = true;
        setSyncReady(true);
      }
    };
    void pull();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pull();
    }, SYNC_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void pull();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  // 저장은 대화가 바뀔 때만 한다. 다른 기기 변경 알림으로 sync가 새로 와도 저장하지 않는다(받아 오기 전 옛 대화로 덮어쓰지 않게).
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    const sync = syncRef.current;
    if (!sync) return;
    if (adopting.current) {
      adopting.current = false;
      return;
    }
    if (!loaded.current && !dirty.current) return;
    dirty.current = true;
    const t = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      sync
        .save({ messages: log.slice(-KEEP), pending, updatedAt })
        .then(() => {
          writeStamp(updatedAt);
          dirty.current = false;
        })
        .catch(() => {
          // 저장 실패: 다음 변경 때 다시 올린다. 이 기기 대화는 남아 있다.
        });
    }, 800);
    return () => window.clearTimeout(t);
  }, [log, pending]);

  // 저장된 선택이 가리키는 프로젝트가 지워졌거나 이미 저장소가 생겼으면 선택을 접는다.
  useEffect(() => {
    if (!pending || !('project' in pending)) return;
    const now = snap.projects.find((p) => p.id === pending.project.id);
    if (!now || (pending.kind === 'repo' && now.repo)) setPending(null);
  }, [snap.projects, pending]);

  // 단계 알림: 업무 단계·버전이 바뀌면 미니엉이 알리고, 아래에 버튼을 둔다(규칙만, 토큰 0).
  // 다른 기기가 이미 넣은 알림(같은 id)은 다시 넣지 않는다. 처음 쓰는 기기는 지금 상태를 기억만 한다.
  useEffect(() => {
    if (!syncReady) return;
    const before = readSeen();
    const { notices, seen } = stageNotices(snap.tasks, snap.workflow, before ?? Object.fromEntries(snap.tasks.map((t) => [t.id, ''])));
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // 저장이 막힌 브라우저: 이번 화면에서만 알린다.
    }
    const have = new Set(logRef.current.map((m) => m.id));
    const add = (before ? notices : []).filter((n) => !have.has(n.id));
    if (!add.length) return;
    add.forEach((n) => archive({ role: 'office', text: n.text, projectId: n.projectId, taskId: n.taskId }));
    const msgs: Msg[] = add.map((n) => ({ id: n.id, from: 'office', text: n.text, taskId: n.taskId, stage: n.stage, actions: n.actions }));
    setLog((l) => [...l.filter((m) => !add.some((n) => n.id === m.id)), ...msgs].slice(-KEEP));
  }, [snap.tasks, snap.workflow, syncReady]);

  /** 마지막 메시지가 지금도 답을 기다리는 Gemini 확인 질문 알림이면 그 업무와 질문 */
  const openClarify = (): { task: Task; question: string } | null => {
    const last = log[log.length - 1];
    const task = snap.tasks.find((t) => t.id === last?.taskId);
    if (!last || !task || last.stage !== 'needs_clarification') return null;
    const v = deriveWorkflow(task, snap.workflow);
    if (v.stage !== 'needs_clarification' || v.spec?.planner !== 'gemini_draft' || v.spec.intent !== 'ambiguous') return null;
    return { task, question: v.spec.answer };
  };

  /** 마지막 메시지가 지금도 유효한 승인 알림이면 그 승인(글로 "응", "승인"이라고 답할 때) */
  const openNoticeGate = (): { msg: Msg; gate: 'A' | 'B' } | null => {
    const last = log[log.length - 1];
    const gate = last?.actions?.find((a): a is 'A' | 'B' => a === 'A' || a === 'B');
    const task = snap.tasks.find((t) => t.id === last?.taskId);
    if (!last || !gate || !task || deriveWorkflow(task, snap.workflow).stage !== last.stage) return null;
    return { msg: last, gate };
  };

  const noticeAct = (m: Msg, action: NoticeAction) => {
    const task = snap.tasks.find((t) => t.id === m.taskId);
    if (!task) return say('office', '이 업무는 지워졌어요.');
    if (action === 'open') return onShowTask?.(task.id);
    if (!onApprove) return;
    say('me', ACTION_LABEL[action], { projectId: task.projectId, taskId: task.id });
    void run(async () => {
      if (!(await onApprove(task, action))) say('office', '승인하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드에서 하세요.');
    });
  };

  // 대화 기록: 실패하면 이 기기에 모아 두었다가 다음 메시지 때 함께 올린다(순서 유지).
  const flushing = useRef(false);
  const archive = (entry?: NewChatEntry) => {
    if (!onArchive) return;
    const queue = entry ? [...readOutbox(), entry] : readOutbox();
    writeOutbox(queue);
    if (!queue.length || flushing.current) return;
    flushing.current = true;
    onArchive(queue)
      .then(() => {
        // 올리는 동안 새로 쌓인 것은 남겨 이어서 올린다.
        const rest = readOutbox().slice(queue.length);
        writeOutbox(rest);
        flushing.current = false;
        if (rest.length) archive();
      })
      .catch(() => {
        // 다음 메시지 때 다시 올린다.
        flushing.current = false;
      });
  };
  useEffect(() => {
    archive();
    // 처음 열 때 남은 것만 올린다.
  }, []);
  // 소유자 결정(2026-10-30): 일반 대화·질문은 기록하지 않고, 프로젝트·업무가 정해진 메시지만 개발일지용으로 남긴다.
  const say = (from: From, text: string, link: { projectId?: string; taskId?: string } = {}) => {
    setLog((l) => [...l, { id: mid(), from, text }].slice(-KEEP));
    if (link.projectId || link.taskId) archive({ role: from, text, projectId: link.projectId ?? null, taskId: link.taskId ?? null });
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const askProject = (text: string, context?: PriorChat) => {
    setShowOther(false);
    setPending({ kind: 'pick', text, context });
    say('office', `${context ? '앞 대화를 이어서 개발 요청으로 접수할게요. ' : ''}어느 프로젝트 업무인가요? 아래에서 고르거나 새 프로젝트를 만드세요.`);
  };

  const short = (t: string) => (t.length > 30 ? `${t.slice(0, 29)}…` : t);

  const handleRequest = (text: string, candidates: Project[], context?: PriorChat) => {
    if (candidates.length === 1) {
      setPending({ kind: 'confirm', text, project: candidates[0], context });
      say(
        'office',
        context
          ? `앞 대화('${short(context.question)}')를 이어서 개발 요청으로 접수할까요? 프로젝트는 '${candidates[0].name}' 맞아요?`
          : `'${candidates[0].name}' 프로젝트 업무로 접수할까요?`,
      );
    } else askProject(text, context);
  };

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    // 이 메시지에 사진이 있으면 미니엉의 다음 확인까지 들고 간다. 사진 없는 새 메시지는 이전 사진을 놓는다(확인 답만 할 때는 유지).
    const sent = photos;
    if (sent.length) {
      photoStore.held = sent;
      setPhotos([]);
      setPhotoErrors([]);
    } else if (!pending || !replyIntent(text)) {
      if (pending?.kind !== 'naming') photoStore.held = [];
    }
    say('me', sent.length ? `${text}\n(첨부 ${sent.length}개: ${sent.map((f) => f.name).join(', ')})` : text);
    // 확인 질문에 버튼 대신 글로 답한 경우("응", "만들어", "아니" 등)
    const yn = replyIntent(text);
    // Gemini 확인 질문 바로 뒤에 쓴 글은 그 답으로 기록하고, Gemini가 기획서를 다시 쓴다.
    const clarify = !pending && onClarify ? openClarify() : null;
    if (clarify) {
      archive({ role: 'me', text, projectId: clarify.task.projectId, taskId: clarify.task.id });
      void run(async () => {
        if (!(await onClarify!(clarify.task, clarify.question, text))) say('office', '답을 기록하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드의 확인 질문 칸에서 하세요.');
      });
      return;
    }
    const notice = !pending && onApprove ? openNoticeGate() : null;
    if (notice && (yn === 'yes' || /^(승인|[ab]\s?승인)/i.test(text))) {
      const task = snap.tasks.find((t) => t.id === notice.msg.taskId)!;
      void run(async () => {
        if (!(await onApprove!(task, notice.gate))) say('office', '승인하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드에서 하세요.');
      });
      return;
    }
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
        const { text: original, project, context } = pending;
        setPending(null);
        void run(() => create(original, project, context));
      } else {
        setShowOther(true);
        say('office', '그럼 어느 프로젝트인가요? 아래에서 고르세요.');
      }
      return;
    }
    if (pending?.kind === 'naming') {
      const original = pending.createTask === false ? null : pending.text;
      const context = pending.context;
      setPending(null);
      void run(() => makeProject(text, original, context));
      return;
    }
    // Gemini 답 바로 뒤의 개발 요청("그럼 그거 만들어줘")은 앞 대화를 함께 업무에 넣는다.
    const prior: PriorChat | undefined = pending?.kind === 'followup' ? { question: pending.text, answer: pending.answer } : undefined;
    setPending(null);
    const t = triage(text, snap);
    if (t.kind === 'status') {
      say('office', t.answer);
      if (sent.length) say('office', '첨부는 업무 요청이나 질문에만 써요. 다음 메시지에 다시 붙여 주세요.');
      photoStore.held = [];
    }
    else if (t.kind === 'new_project') {
      if (t.name) void run(() => makeProject(t.name!, null));
      else {
        setPending({ kind: 'naming', text: '', createTask: false });
        say('office', '새 프로젝트 이름을 알려주세요.');
      }
    }
    else if (t.kind === 'request') {
      const candidates = t.candidates.length || !prior ? t.candidates : matchProjects(prior.question, snap.projects);
      handleRequest(text, candidates, prior);
    }
    else if (t.kind === 'question') {
      // 소유자 결정(2026-10-30): 일반 질문은 보내기 한 번에 Gemini 무료가 답하고, GPT로 이어서 물을 수 있다.
      // 프로젝트 판단이 필요한 질문(프로젝트 이름이 들어 있음)은 GPT를 먼저 권한다.
      const project = questionProject(text, snap.projects);
      if (project) {
        setPending({ kind: 'question', text, projectName: project.name });
        say('office', `'${project.name}' 프로젝트 판단이 필요한 질문 같아요. GPT에게 묻는 걸 권해요.`);
      } else if (canAskGemini) askGemini(text);
      else {
        setPending({ kind: 'question', text });
        say('office', '업무 기록으로는 답할 수 없는 질문이에요. 어디에 물어볼까요?');
      }
    } else if (prior && canAskGemini && text.length <= FOLLOWUP_MAX) {
      // Gemini 답 바로 뒤의 짧은 말("더 자세히", "예시도")은 이어지는 질문으로 본다. 개발하라는 말이 있으면 위에서 확인한다.
      askGemini(text);
    } else {
      setPending({ kind: 'unclear', text });
      say('office', '질문인가요, 업무 요청인가요?');
    }
  };

  /** 프로젝트를 만들고, 원래 요청이 있으면 업무로 접수한 뒤 저장소를 만들지 묻는다. */
  const makeProject = async (rawName: string, original: string | null, context?: PriorChat) => {
    const name = rawName.trim().slice(0, 60);
    const same = snap.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      say('office', `'${same.name}' 프로젝트는 이미 있어요. 그 프로젝트를 쓰거나 다른 이름을 알려주세요.`);
      setPending({ kind: 'naming', text: original ?? '', createTask: original !== null, context });
      return;
    }
    const project = await onCreateProject(name);
    if (!project) return say('office', '프로젝트를 만들지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    say('office', `'${project.name}' 프로젝트를 만들었습니다.`, { projectId: project.id });
    if (original) await create(original, project, context);
    if (onCreateRepo) {
      setPending({ kind: 'repo', project });
      say('office', 'GitHub 저장소도 만들까요? 비공개 빈 저장소(README만)를 만들고 이 프로젝트에 연결합니다. ("응"이라고 써도 됩니다)');
    } else say('office', 'GitHub 저장소는 아직 연결되지 않았습니다(프로젝트 탭에서 owner/repo 입력).');
  };

  const create = async (text: string, project: Project, context?: PriorChat) => {
    const title = titleFrom(text);
    const images: PendingImage[] = photoStore.held.map((file, i) => ({ key: `${i}-${file.name}`, file, role: isImage(file.type) ? 'reference' : 'document', note: '' }));
    photoStore.held = [];
    const task = await onCreateTask({
      projectId: project.id,
      title,
      description: context ? priorChatText(context) : text === title ? '' : text,
      requestedType: 'auto',
      priority: 'normal',
      originalText: text,
    }, images);
    if (!task) return say('office', '업무를 저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    // 접수된 요청 원문은 화면에 이미 있으므로 기록에만 남긴다. 이어 온 앞 대화도 이 업무 기록이 된다(개발 전 삭제 시 함께 지워짐).
    if (context) {
      archive({ role: 'me', text: context.question, projectId: project.id, taskId: task.id });
      archive({ role: 'gemini', text: context.answer, projectId: project.id, taskId: task.id });
    }
    archive({ role: 'me', text, projectId: project.id, taskId: task.id });
    say(
      'office',
      `'${project.name}'에 접수했어요: ${task.title}\n${
        onAutoDraft ? 'Gemini(무료)가 기획서 초안을 써요. 다 되면 여기서 알려 드릴게요.' : '아래 업무 카드의 진행 단계에서 ChatGPT 기획부터 하세요.'
      }`,
      { projectId: project.id, taskId: task.id },
    );
    onAutoDraft?.(task);
    if (images.length) say('office', `첨부 ${images.length}개를 이 업무의 요청 자료로 올렸어요(이미지 역할은 '기타 참고', 업무 카드에서 바꿀 수 있어요).`);
  };

  const choose = (project: Project) => {
    if (!pending || pending.kind === 'repo') return;
    const { text } = pending;
    const context = 'context' in pending ? pending.context : undefined;
    setPending(null);
    say('me', `${project.name} 맞아요`, { projectId: project.id });
    void run(() => create(text, project, context));
  };

  const askGemini = (text: string) => {
    setPending(null);
    void run(async () => {
      // 이전 Gemini 대화만 문맥으로 보낸다(최근 6개).
      const history: { role: 'user' | 'model'; text: string }[] = [];
      log.forEach((m, i) => {
        if (m.from === 'gemini' && log[i - 1]?.from === 'me') history.push({ role: 'user', text: log[i - 1].text }, { role: 'model', text: m.text });
      });
      // 질문에는 이미지만 보낸다(문서는 업무 요청 자료로 올린 뒤 'Gemini로 요약').
      const held = photoStore.held.filter((f) => isRaster(f.type));
      const images = held.slice(0, MAX_GEMINI_IMAGES);
      if (held.length > MAX_GEMINI_IMAGES) say('office', `사진은 앞의 ${MAX_GEMINI_IMAGES}장만 Gemini에 보냅니다.`);
      if (held.length < photoStore.held.length) say('office', '문서는 질문에 보내지 않아요. 업무로 접수하면 요청 자료에서 Gemini로 요약할 수 있어요.');
      try {
        const encoded = await Promise.all(images.map(async (f) => ({ mime: f.type, data: await toBase64(f) })));
        const answer = await onAskGemini(text, history.slice(-6), encoded);
        say('gemini', answer);
        photoStore.held = [];
        setPending({ kind: 'followup', text, answer });
      } catch (e) {
        setPending({ kind: 'question', text });
        say('office', `${(e as Error).message}`);
      }
    });
  };

  const copyGpt = async (text: string, geminiAnswer?: string) => {
    const ok = await onCopy(geminiAnswer ? chatGptFollowup(text, geminiAnswer) : chatGptQuestion(text));
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
        <ol ref={listRef} className="inbox-log" aria-live="polite">
          {log.map((m) => (
            <li key={m.id} className={`inbox-msg from-${m.from}`}>
              <span className="inbox-who">{FROM_LABEL[m.from]}</span>
              <p>{m.text}</p>
              {m.actions && !busy && (() => {
                // 지금도 그 단계일 때만 버튼을 보인다(지난 알림의 버튼은 숨김).
                const task = snap.tasks.find((t) => t.id === m.taskId);
                if (!task || deriveWorkflow(task, snap.workflow).stage !== m.stage) return null;
                return (
                  <span className="inbox-choices" role="group" aria-label="이 업무에 답하기">
                    {m.actions.filter((a) => a === 'open' || onApprove).map((a) => (
                      <button key={a} type="button" className={`btn btn-small ${a === 'open' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => noticeAct(m, a)}>
                        {ACTION_LABEL[a]}
                      </button>
                    ))}
                  </span>
                );
              })()}
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
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'naming', text: pending.text, context: pending.context })}>
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
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'naming', text: pending.text, context: pending.context })}>
                + 새 프로젝트
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPending({ kind: 'question', text: pending.text })}>
                질문이었어요
              </button>
            </>
          )}
          {pending.kind === 'followup' && (
            <>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => void copyGpt(pending.text, pending.answer)}>
                GPT에게 이어서 묻기
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => askProject(pending.text, { question: pending.text, answer: pending.answer })}>
                업무로 만들기
              </button>
              <p className="muted small inbox-note">GPT에게 이어서 묻기: 질문과 Gemini 답을 함께 복사합니다. ChatGPT 앱에 붙여넣으세요(Plus 구독 안, 추가 비용 없음).</p>
            </>
          )}
          {pending.kind === 'question' && (
            <>
              <button type="button" className={`btn btn-small ${pending.projectName ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void copyGpt(pending.text)}>
                ChatGPT로 복사
              </button>
              {canAskGemini && (
                <button type="button" className={`btn btn-small ${pending.projectName ? 'btn-ghost' : 'btn-primary'}`} onClick={() => askGemini(pending.text)}>
                  Gemini에게 묻기
                </button>
              )}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => askProject(pending.text)}>
                사실은 업무 요청이에요
              </button>
              <p className="muted small inbox-note">
                {canAskGemini
                  ? `Gemini에게 묻기를 누르면 이 질문${photoStore.held.some((f) => isRaster(f.type)) ? `과 사진 ${Math.min(photoStore.held.filter((f) => isRaster(f.type)).length, MAX_GEMINI_IMAGES)}장` : ''}이 Google(Gemini 무료)로 갑니다. 비밀번호·개인정보는 넣지 마세요. 일반 질문은 개발일지 기록에 남지 않습니다.`
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
        <ul className="inbox-photos" aria-label="보낼 첨부">
          {photos.map((f, i) => (
            <li key={`${i}-${f.name}`}>
              {previews[i] ? (
                <img src={previews[i]} alt={f.name} />
              ) : (
                <span className="inbox-doc" title={f.name}>
                  {(MIME_EXT[f.type] ?? 'file').toUpperCase()}
                </span>
              )}
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
        <button type="button" className="btn btn-ghost inbox-attach" aria-label="사진·문서 첨부" title="사진·문서 첨부(붙여넣기·끌어다 놓기도 됩니다)" disabled={busy} onClick={() => fileInput.current?.click()}>
          {/* 이모지는 기기 글꼴마다 다르게 깨져 보여서 도트 그림 아이콘을 쓴다 */}
          <svg className="pixel-icon" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="currentColor" d="M1 3h14v1H1zM1 12h14v1H1zM1 4h1v8H1zM14 4h1v8h-1z" />
            <path fill="currentColor" d="M10 5h2v2h-2zM3 11h1v-1h1V9h1V8h1v1h1v1h1V9h1V8h1v1h1v1h1v1h1v1H3z" opacity=".75" />
          </svg>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_REQUEST}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              addPhotos(files);
            }
          }}
          id="inbox-input"
          ref={inputRef}
          rows={2}
          value={input}
          maxLength={4000}
          placeholder={pending?.kind === 'naming' ? '새 프로젝트 이름' : touchInput() ? '묻거나 시킬 일을 적으세요' : '묻거나 시킬 일을 적으세요 (Enter로 보내기)'}
          aria-label="묻기·요청"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // PC: Enter로 보내고 Shift+Enter는 줄바꿈. 휴대폰: Enter는 줄바꿈(보내기 버튼으로만). 한글 조합 중 Enter는 무시한다.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchInput()) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          보내기
        </button>
      </form>
      {canAskGemini && <p className="muted small inbox-note">일반 질문은 보내면 Gemini(Google 무료)가 바로 답합니다. 비밀번호·개인정보는 적지 마세요.</p>}
      {log.length > 0 && (
        <button
          type="button"
          className="link-btn small"
          onClick={() => {
            // 대화를 지우면 미니엉이 기다리던 요청(접수 확인·프로젝트 이름·저장소 만들기)도 취소한다.
            // 이미 접수된 업무는 기록이라 지우지 않는다(업무 카드에서 삭제).
            const hadPending = pending !== null;
            photoStore.held = [];
            setPending(null);
            setShowOther(false);
            setLog(hadPending ? [{ id: mid(), from: 'office', text: '진행 중이던 요청을 취소했어요. 이미 접수된 업무는 그대로 있어요(지우려면 업무 카드에서 삭제).' }] : []);
          }}
        >
          {pending ? '대화 지우기 · 진행 중인 요청 취소' : sync ? '대화 지우기(모든 기기)' : '대화 지우기(이 기기)'}
        </button>
      )}
    </section>
  );
}
