import { characterUrl } from '../office/assets';
import { createPortal } from 'react-dom';
import { FormPopup } from './FormPopup';
import { clockLabel, continues, dayLabel, isGuideLine, noticeCard, shortSpecLine, speakerOf, timeOf, toneOf } from '../domain/chatView';
import { taskContext } from '../domain/taskContext';
import { VoiceInput } from './VoiceInput';
import { answerSlot, asksSearch, insertMention, mentionOptions, mentionQuery, searchEngineOf } from '../domain/mention';
import { setResearchPhase } from '../office/webResearch';
import { CRITERIA_TAGS, insertCriterion, splitCriteria } from '../domain/criteriaTag';
import { Fragment, useEffect, useRef, useState } from 'react';
import { repoNameError, toRepoSlug } from '../../supabase/functions/create-repo/naming';
import { chatGptFollowup, chatGptQuestion, matchProjects, priorChatText, questionProject, replyIntent, titleFrom, triage, type PriorChat } from '../domain/triage';
import { ACCEPT_REQUEST, isImage, isRaster, MAX_REQUEST_FILES, MIME_EXT, prepareFile, validateFile } from '../domain/attachments';
import type { Project, Snapshot, Task } from '../domain/types';
import { SkillPick } from './SkillPick';
import { takeQueued } from '../domain/chatQueue';
import { needsResearch, type Source } from '../domain/research';
import { researchMessage, unannounced } from '../domain/claudeResearch';
import { matchRoutedProject, parseRoutedAll, projectContext, type AskOptions, type RoutedItem } from '../domain/aiRoute';
import { stageNotices, type NoticeAction, actionNotices, mergeNotices, staleNotices } from '../domain/stageNotice';
import { canApprove, canRequestRevision, deriveWorkflow, latestPrCheck, prCheckPasses } from '../domain/workflow';
import { ApprovalSummary, approvalGate, type ShotImage } from './ApprovalSummary';
import { PointFix } from './PointFix';
import { DESIGN_WORDS, addDesignWord } from '../domain/designWords';
import type { DesignDraft } from '../domain/designDraft';
import type { InboxState, NewChatEntry } from '../data/store';
import type { PendingImage } from './Attachments';
import { ImageZoom } from './ImageZoom';
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
  /** 미니엉이 넘겨준 답을 실제로 쓴 AI(v0.4.44): 'Gemini · Studio A' 등 */
  via?: string;
  /** 단계 알림: 그 업무가 아직 이 단계일 때만 버튼을 보인다 */
  taskId?: string;
  /** 업무 카드에 답장한 내 말(v0.7.25): 위에 붙는 '↩ 프로젝트 · 업무' */
  reply?: string;
  /** 만든 시각(알림처럼 id에 시각이 없는 메시지, v0.7.17) */
  at?: string;
  /** 이 메시지에 묶인 다른 알림 id(v0.7.16) */
  ids?: string[];
  /** 업무를 접수한 메시지(v0.6.97): '접수 취소' 버튼을 붙인다 */
  created?: boolean;
  stage?: string;
  actions?: NoticeAction[];
  /** 쓴 대화창(v0.4.66): '' = 기본 대화창, 아니면 그 프로젝트 대화창 */
  home?: string;
  /** 함께 보이는 프로젝트 대화창(기본창에서 물어본 것이 그 프로젝트로 확인되면 연결) */
  projects?: string[];
  /** 조사 답의 출처(v0.4.61) */
  sources?: Source[];
  /** 업무 접수 확인 카드(v0.4.58): 한 메시지에 업무가 여럿이어도 카드마다 따로 접수·취소한다 */
  offer?: Offer;
  /** 함께 보낸 첨부(v0.4.89): 이름과 작은 미리보기(누르면 크게). 원본은 이 화면에서만 기억한다 */
  files?: { name: string; thumb?: string; key?: string }[];
}

/** 보낸 첨부 원본(이 화면에서만, 크게 보기용). 키 = 메시지 id:순번 */
const fullUrls = new Map<string, string>();

/** 사진 파일 → 작은 미리보기(JPEG data URL, 긴 변 360px). 못 읽는 형식이면 undefined */
async function thumbOf(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return undefined;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

interface Offer {
  /** 업무로 만들 요청(여러 개로 나눴으면 그 조각) */
  text: string;
  /** AI·이름으로 고른 프로젝트(없으면 목록에서 고른다) */
  projectId: string | null;
  context?: PriorChat;
  /** 여러 요청이 섞인 원래 메시지(나눴을 때만, 업무 설명에 참고로 넣는다) */
  whole?: string;
  /** 애매: 질문인지 업무인지 먼저 묻는 카드 */
  ask?: boolean;
  state: 'open' | 'done' | 'dropped';
}

/** 마지막 안내 메시지에 붙는 선택지 */
type Pending =
  /** context: 바로 앞 Gemini 질문·답을 이어서 개발 요청으로 접수할 때 */
  | { kind: 'confirm'; text: string; project: Project; context?: PriorChat }
  | { kind: 'pick'; text: string; context?: PriorChat }
  | { kind: 'question'; text: string; projectName?: string }
  /** Gemini가 답한 뒤: GPT에게 이어서 묻기 */
  | { kind: 'followup'; text: string; answer: string; projectName?: string; webFailed?: boolean }
  | { kind: 'unclear'; text: string }
  /** 확인 질문 뒤에 질문처럼 보이는 말이 왔을 때: 그 답인지 새 질문인지 묻는다(v0.4.20) */
  | { kind: 'clarifyOrAsk'; text: string; taskId: string }
  /** 새 프로젝트 이름을 기다림. text가 있으면 이름을 받은 뒤 그 요청을 업무로 만든다 */
  | { kind: 'naming'; text: string; createTask?: boolean; context?: PriorChat }
  | { kind: 'repo'; project: Project };

interface Props {
  snap: Snapshot;
  canAskGemini: boolean;
  /** 입력창을 누르면 Gemini 질문 서버를 미리 깨운다(있을 때만) */
  onWarmGemini?: () => void;
  /** 업무 접수(사진이 있으면 요청 자료로 함께 올린다) */
  /** 업무 카드에서 확인 질문에 답한 것(v0.4.90): 기본 대화창과 그 프로젝트 대화창에 같이 남긴다 */
  echo?: { n: number; taskId: string; projectId: string; text: string } | null;
  onCreateTask: (draft: TaskDraft, images: PendingImage[]) => Promise<Task | null>;
  onCreateProject: (name: string) => Promise<Project | null>;
  /** 업무를 접수하면 그 프로젝트를 대화에 연결만 한다(대화 칩을 켬, 대화는 그대로 이어감, v0.4.30) */
  onLinkProject?: (projectId: string) => void;
  /** 지금 고른 프로젝트(위 프로젝트 칩). 요청에 프로젝트 이름이 없으면 이 프로젝트로 묻는다(v0.4.19) */
  currentProject?: Project | null;
  /** 다른 탭에서 넘겨준 입력 초안(업무 카드 "대화로 묻기", 프로젝트 "요청하기"). n이 바뀔 때마다 채운다 */
  /** 다른 탭에서 넘어온 입력 초안. taskId가 있으면 그 업무에 대한 질문(보낼 때 업무 상태를 참고로 붙임, v0.5.1) */
  /** send = 채우고 바로 보낸다(스킬 입력 창, v0.6.57) */
  draft?: { text: string; n: number; taskId?: string; send?: boolean } | null;
  /** 체험 모드: 웹 조사 말이면 정해진 체험 답(v0.7.60) */
  demoResearch?: boolean;
  onAskGemini: (
    question: string,
    history: { role: 'user' | 'model'; text: string }[],
    images: { mime: string; data: string }[],
    onDelta?: (soFar: string) => void,
    opts?: AskOptions,
  ) => Promise<{ answer: string; keySlot: number; sources?: Source[]; engine?: string; pages?: number }>;
  /** Studio A·B(Gemini)가 모두 휴가면 Gemini를 부르지 않는다(v0.4.44) */
  geminiAway?: boolean;
  /** Claude 웹 조사(v0.7.11): 웹 검색(Tavily·Firecrawl)이 안 됐을 때 'Claude에게 찾아보기'. Supabase 모드·Claude 근무일 때만 */
  onAskClaude?: (question: string) => Promise<{ already?: boolean }>;
  /** Codex(OpenAI·ChatGPT 계정)가 휴가면 GPT로 넘기는 링크를 숨긴다(v0.4.44) */
  gptAway?: boolean;
  onCopy: (text: string) => Promise<boolean>;
  /** 저장소 만들기를 쓸 수 있으면 함수(Supabase 모드) */
  onCreateRepo?: (project: Project, name: string) => Promise<string | null>;
  /** 대화를 계정에 저장해 다른 기기에서 이어 본다(Supabase 모드). 없으면 이 기기에만 남는다. */
  sync?: { load: () => Promise<InboxState | null>; save: (state: InboxState) => Promise<void> };
  /** 대화 기록(개발일지 원본)에 추가. 프로젝트 업무와 연결된 메시지만 보낸다(일반 대화·질문은 남기지 않음). */
  onArchive?: (entries: NewChatEntry[]) => Promise<void>;
  /** 접수된 업무 취소(v0.6.97, 업무 카드의 '업무 취소'와 같다) */
  onCancelTask?: (task: Task) => void;
  /** 개발 스킬 고르기(v0.7.0): 프로젝트에 들어 있는 스킬·이름·저장 */
  skillPick?: { installed: (projectId: string) => string[]; titleOf?: (name: string) => string; save: (task: Task, skills: string[]) => Promise<boolean> };
  /** 접수 직후 Gemini 기획서 초안을 자동으로 시작한다(Supabase 모드). 없으면 ChatGPT 기획을 안내한다. */
  onAutoDraft?: (task: Task) => void;
  /** Gemini 초안의 확인 질문에 입력창으로 답했을 때: 답을 기록하면 Gemini가 다시 쓴다 */
  onClarify?: (task: Task, question: string, answer: string) => Promise<boolean>;
  /** 단계 알림의 "업무 카드 보기" */
  onShowTask?: (taskId: string) => void;
  /** 개발 중인 업무에 추가 요청으로 보내기(v0.6.13) */
  onAddFollowup?: (taskId: string, text: string) => Promise<boolean>;
  /** 단계 알림에서 바로 A·올리기 승인(업무 카드의 같은 버튼과 같은 규칙). 성공하면 true */
  onApprove?: (task: Task, gate: 'A' | 'B') => Promise<boolean>;
  /** 대화 카드에서 바로(v0.7.23 소유자 "대화에서도 업무 진행"): 기획 수정 요청·결과 다시 시키기·배포 승인·시안 바꾸기. 업무 카드의 같은 버튼과 같은 기록 */
  onReviseSpec?: (task: Task, feedback: string) => Promise<boolean>;
  onRedo?: (task: Task, feedback: string) => Promise<boolean>;
  onDeployApprove?: (task: Task) => Promise<boolean>;
  onPickDraft?: (task: Task, draft: DesignDraft) => Promise<void>;
  /** 결과 화면 사진(결과 스크린샷·미노가 찍은 화면, v0.7.25) */
  onResultImages?: (task: Task, revision: number) => Promise<ShotImage[]>;
  /** 시안이 없을 때 그리기(v0.7.42) */
  onDrawDesign?: (task: Task) => Promise<void>;
  /** 대화 탭이 보이는 중(v0.7.29): 다른 탭에서 돌아오면 맨 아래(새 말)를 보여 준다 */
  active?: boolean;
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
const KEEP = 150;
/** 이 기기에서 이미 띄운 Claude 웹 조사 id(v0.7.11) */
const RESEARCH_KEY = 'minlab-ai-office:research-shown';
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

// v0.7.17(소유자 "디스코드처럼"): 대화창의 말한 쪽은 실제 AI(Gemini·Claude·Codex·미노)로 보여 준다(예전 v0.4.44는 늘 미니엉). 받기·넘기기는 그대로 미니엉 규칙.
const VIA_OF_SLOT: Record<number, string> = { 1: 'Gemini · Studio A가 답함', 2: 'Gemini · Studio B가 답함' };

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

const ACTION_LABEL: Record<NoticeAction, string> = { open: '업무 보기', A: '기획 승인', B: '결과 승인' };

export function Inbox({ snap, canAskGemini, demoResearch, geminiAway, gptAway, onAskClaude, onWarmGemini, onCreateTask, onCreateProject, onAskGemini, onCopy, onCreateRepo, sync, onArchive, onCancelTask, skillPick, onShowTask, onAddFollowup, onApprove, onReviseSpec, onRedo, onDeployApprove, onPickDraft, onResultImages, onDrawDesign, active, onAutoDraft, onClarify, currentProject, draft, echo }: Props) {
  const [log, setLog] = useState<Msg[]>(readLog);
  // v0.4.66: 기본 대화창('')과 프로젝트별 대화창. 기본창에서 물어본 것도 프로젝트로 확인되면 그 프로젝트 창에 같이 보인다.
  const thread = currentProject?.id ?? '';
  const inThread = (m: Msg) => (m.home ?? '') === thread || (thread !== '' && Boolean(m.projects?.includes(thread)));
  const shown = log.filter(inThread);
  const logRef = useRef(log);
  logRef.current = log;
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Pending | null>(readPending);
  // 기다리는 요청(선택 버튼)은 만든 대화창에만 속한다(v0.5.9 소유자 "왜 연결되어 있음"): 다른 대화창으로 옮기면 접는다.
  const pendingThread = useRef(thread);
  useEffect(() => {
    if (pending) pendingThread.current = thread;
  }, [pending]);
  useEffect(() => {
    if (pendingThread.current !== thread) {
      pendingThread.current = thread;
      setPending(null);
    }
  }, [thread]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  // 계정 대화를 처음 받아 온 뒤에 단계 알림을 넣는다(받아 온 대화에 덮이지 않게).
  const [syncReady, setSyncReady] = useState(!sync);
  const [showOther, setShowOther] = useState(false);
  /** 접수 카드 중 '다른 프로젝트'를 펼친 것 */
  const [otherFor, setOtherFor] = useState<string | null>(null);
  /** 답을 기다리는 동안 보낸 말(v0.4.58): 앞 일이 끝나면 차례로 처리한다 */
  const [queue, setQueue] = useState<{ text: string; files: File[] }[]>([]);
  const runs = useRef(0);
  /** 카드 안 수정 요청·다시 시키기 입력칸(메시지 id) */
  const [fixFor, setFixFor] = useState<string | null>(null);
  const [fixText, setFixText] = useState('');
  /** 결과 카드의 바뀐 파일 막대를 편 메시지 */
  const [filesFor, setFilesFor] = useState<string | null>(null);
  /** 배포 승인 확인 칸을 연 카드 */
  const [deployAsk, setDeployAsk] = useState<string | null>(null);
  /** 짚어서 수정 중인 그림과 그 카드(v0.7.25) */
  const [pointImg, setPointImg] = useState<(ShotImage & { what: string; msgId: string }) | null>(null);
  /** 밀어서 답장(v0.7.25 소유자 "대화엔 모든 프로젝트·업무가 다 보이니 옆으로 밀어서 답장"): 답할 업무 */
  const [replyTo, setReplyTo] = useState<{ taskId: string; label: string } | null>(null);
  /** 밀고 있는 카드와 거리(px) */
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const touch = useRef<{ id: string; x: number; y: number; horiz: boolean | null } | null>(null);
  const startReply = (m: Msg) => {
    const task = snap.tasks.find((t) => t.id === m.taskId);
    if (!task) return;
    const project = snap.projects.find((p) => p.id === task.projectId);
    setReplyTo({ taskId: task.id, label: [project?.name, task.title].filter(Boolean).join(' · ') });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  /** 답장한 말을 그 업무의 지금 단계에 맞게 넣는다: 질문 → 답, 기획 승인 대기 → 수정 요청, 결과 승인 대기 → 다시 시키기, 그 밖 → 추가 요청 */
  const sendReply = (to: { taskId: string; label: string }, text: string) => {
    const task = snap.tasks.find((t) => t.id === to.taskId);
    setLog((l) => [...l, { id: mid(), from: 'me' as From, text, home: thread, reply: to.label, ...(task ? { taskId: task.id } : {}) }].slice(-KEEP));
    if (!task) return say('office', '이 업무는 지워졌어요.');
    archive({ role: 'me', text: `\u21A9\uFE0E ${to.label}\n${text}`, projectId: task.projectId, taskId: task.id });
    const v = deriveWorkflow(task, snap.workflow);
    const done = (ok: boolean, what: string) => say('office', ok ? `'${short(task.title)}'에 ${what}(으)로 넣었어요.` : `'${short(task.title)}'에 넣지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드에서 하세요.`);
    void run(async () => {
      if (v.stage === 'needs_clarification' && onClarify && v.spec?.planner === 'gemini_draft' && v.spec.intent === 'ambiguous') return done(await onClarify(task, v.spec.answer, text), '확인 질문의 답');
      if (v.stage === 'development_approval_pending' && v.spec && !v.aApproved && onReviseSpec) return done(await onReviseSpec(task, text), '기획 수정 요청');
      if (v.stage === 'github_approval_pending' && onRedo && canRequestRevision(v).ok) return done(await onRedo(task, text), '다시 시키기');
      if (onAddFollowup && v.stage !== 'completed' && v.stage !== 'cancelled') return done(await onAddFollowup(task.id, text), '추가 요청');
      say('office', `'${short(task.title)}'은(는) 끝난 업무라 답장을 넣을 곳이 없어요. 새 요청으로 보내 주세요.`);
    });
  };
  const addFix = (text: string) => setFixText((v) => (v.trim() ? `${v.trimEnd()}\n${text}` : text));
  /** 업무 알림 아래 버튼(지금도 그 단계일 때만). 카드면 카드 안에 둔다(v0.7.17).
   *  v0.7.23: 승인 차례면 "승인하면" 한 줄·칩·시안·바뀐 파일과 수정 요청·다시 시키기·배포 승인까지 대화에서 */
  const noticeButtons = (m: Msg) => {
    if (!m.actions || busy) return null;
    // 지금도 그 단계일 때만 버튼을 보인다(지난 알림의 버튼은 숨김).
    const task = snap.tasks.find((t) => t.id === m.taskId);
    if (!task) return null;
    const view = deriveWorkflow(task, snap.workflow);
    if (view.stage !== m.stage) return null;
    // 같은 업무의 알림이 여럿이면(검사 중 → 통과처럼 같은 단계에서 글만 바뀐 것) 마지막 카드에만 버튼(v0.7.36 소유자 "왜 두 개?")
    const latest = [...log].reverse().find((x) => x.taskId === task.id && x.actions && x.stage && x.id.startsWith('stage-'));
    if (m.id.startsWith('stage-') && latest && latest.id !== m.id) return null;
    const gate = approvalGate(view);
    // 체험 업무('[체험]', demoServer의 DEMO_TAG)는 저장소 없이도 끝까지 돈다
    const repo = !!snap.projects.find((p) => p.id === task.projectId)?.repo || task.title.startsWith('[체험]');
    const fixKind = gate === 'A' && onReviseSpec ? 'A' : gate === 'B' && onRedo && canRequestRevision(view).ok ? 'B' : null;
    const prOk = prCheckPasses(latestPrCheck(task, snap.workflow));
    const canDeploy = gate === 'C' && onDeployApprove && canApprove(view, 'C').ok && !!task.prUrl && prOk;
    const sendFix = () => {
      const text = fixText.trim();
      if (!text || !fixKind) return;
      say('me', `${fixKind === 'A' ? '수정 요청' : '다시 시키기'}: ${text}`, { projectId: task.projectId, taskId: task.id });
      setFixFor(null);
      setFixText('');
      void run(async () => {
        const ok = fixKind === 'A' ? await onReviseSpec!(task, text) : await onRedo!(task, text);
        if (!ok) say('office', '기록하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드에서 하세요.');
      });
    };
    return (
      <>
        {/* 개발 스킬 고르기(v0.7.34 소유자 "스킬하고 Gemini가 한 번에 올라와"): 접수 때가 아니라 기획 승인 카드에서 한 번에 */}
        {gate === 'A' && skillPick && <SkillPick task={task} installed={skillPick.installed(task.projectId)} titleOf={skillPick.titleOf} onSave={skillPick.save} />}
        {gate && (
          <ApprovalSummary
            task={task}
            view={view}
            data={{ ...snap.workflow, prCheck: latestPrCheck(task, snap.workflow) }}
            gate={gate}
            repo={repo}
            showFiles={filesFor === m.id}
            busy={busy}
            onPick={onPickDraft ? (d) => void run(() => onPickDraft(task, d)) : undefined}
            loadShots={gate === 'B' && onResultImages && view.result ? () => onResultImages(task, view.result!.revision) : undefined}
            onPoint={fixKind ? (img) => setPointImg({ ...img, msgId: m.id }) : undefined}
            onDraw={onDrawDesign ? () => void run(() => onDrawDesign(task)) : undefined}
          />
        )}
        {pointImg?.msgId === m.id && (
          <PointFix
            src={pointImg.src}
            name={pointImg.name}
            what={pointImg.what}
            onClose={() => setPointImg(null)}
            onDone={(text) => {
              addFix(text);
              setFixFor(m.id);
              setPointImg(null);
            }}
          />
        )}
        <span className="inbox-choices" role="group" aria-label="이 업무에 답하기">
          {m.actions
            .filter((a) => a !== 'open' && onApprove)
            .map((a) => (
              <button key={a} type="button" className="btn btn-small btn-primary" onClick={() => noticeAct(m, a)}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          {canDeploy && (
            <button
              type="button"
              className="btn btn-small btn-deploy"
              aria-haspopup="dialog"
              // 되돌리기 어려운 일이라 앱 팝업으로 한 번 더 묻는다
              onClick={() => setDeployAsk(m.id)}
            >
              배포 승인
            </button>
          )}
          {fixKind && (
            <button type="button" className="btn btn-small btn-ghost" aria-expanded={fixFor === m.id} onClick={() => setFixFor(fixFor === m.id ? null : m.id)}>
              {fixKind === 'A' ? '수정 요청' : '다시 시키기'}
            </button>
          )}
          {gate === 'B' && view.result?.diff && (
            <button type="button" className="btn btn-small btn-ghost" aria-expanded={filesFor === m.id} onClick={() => setFilesFor(filesFor === m.id ? null : m.id)}>
              {filesFor === m.id ? '바뀐 것 접기' : '바뀐 것 보기'}
            </button>
          )}
          {gate === 'C' && task.prUrl && (
            <a className="btn btn-small btn-ghost" href={task.prUrl} target="_blank" rel="noreferrer">
              PR 보기
            </a>
          )}
          {view.spec && gate !== 'B' && gate !== 'C' && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setSpecFor(task.id)}>
              기획서 보기
            </button>
          )}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => noticeAct(m, 'open')}>
            {ACTION_LABEL.open}
          </button>
        </span>
        {canDeploy &&
          deployAsk === m.id &&
          // v0.7.33 소유자 "팝업으로": 브라우저 확인 창 대신 앱 팝업(바깥·Esc·닫기로 취소)
          createPortal(
            <FormPopup title="배포 승인" onClose={() => setDeployAsk(null)}>
              <div className="deploy-ask">
                <p className="card-proj">{snap.projects.find((p) => p.id === task.projectId)?.name ?? ''}</p>
                <p className="card-title">{task.title}</p>
                <p className="appr-after">운영에 반영할까요? PR을 합치고 배포해요. 되돌리려면 새 업무가 필요해요.</p>
                <span className="inbox-choices">
                  <button
                    type="button"
                    className="btn btn-deploy"
                    onClick={() => {
                      setDeployAsk(null);
                      say('me', '배포 승인', { projectId: task.projectId, taskId: task.id });
                      void run(async () => {
                        if (!(await onDeployApprove!(task))) say('office', '배포 승인하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드에서 하세요.');
                      });
                    }}
                  >
                    배포하기
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setDeployAsk(null)}>
                    아니요
                  </button>
                </span>
              </div>
            </FormPopup>,
            document.body,
          )}
        {gate === 'C' && !canDeploy && onDeployApprove && <p className="small muted">{!task.prUrl ? 'PR이 열리면 배포 승인 버튼이 생겨요.' : !prOk ? 'PR 자동검사가 통과하면 배포 승인 버튼이 생겨요.' : ''}</p>}
        {fixKind && fixFor === m.id && (
          <form
            className="inbox-fix"
            onSubmit={(e) => {
              e.preventDefault();
              sendFix();
            }}
          >
            {/* 디자인 단어(v0.7.25): 누르면 구체적인 설명이 들어간다 */}
            <span className="design-words inbox-fix-words" aria-label="디자인 단어로 수정 요청">
              {DESIGN_WORDS.map((w) => (
                <button key={w.word} type="button" className="chip" title={w.text} onClick={() => setFixText((v) => addDesignWord(v, w.word))}>
                  {w.word}
                </button>
              ))}
            </span>
            <textarea
              aria-label={fixKind === 'A' ? '기획서에서 고칠 점' : '결과에서 고칠 점'}
              rows={2}
              maxLength={4000}
              placeholder={fixKind === 'A' ? '무엇을 고칠까요? (예: 지난달 대비도 넣기)' : '무엇을 고칠까요? (예: 숫자를 더 크게)'}
              value={fixText}
              onChange={(e) => setFixText(e.target.value)}
            />
            <button type="submit" className="btn btn-small btn-primary" disabled={!fixText.trim()}>
              보내기
            </button>
          </form>
        )}
      </>
    );
  };
  /** 처리 중 '멈추기'(v0.6.97): 켜져 있는 동안 늦게 온 답·접수 카드는 버린다. 하던 일이 다 끝나면 저절로 꺼진다 */
  const muted = useRef(false);
  const [photos, setPhotosState] = useState<File[]>(photoStore.draft);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  /** 크게 보기(v0.4.89): 첨부 미리보기를 누르면 화면 가득 */
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  // 업무 카드에서 '대화로 묻기'로 온 질문(그 업무 상태를 Gemini에 참고로 함께 보낸다, v0.5.1)
  const focusTask = useRef<{ taskId: string; prefix: string } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * 맨 아래 새 말이 아래에 붙은 입력창·휴대폰 키보드에 가리지 않게 화면을 올린다(v0.4.78, 소유자 "채팅 창 오류").
   * 보이는 화면(visualViewport, 키보드 위)의 아래 끝이 '마지막 말 + 입력창 높이' 밑에 오도록만 내린다.
   */
  const revealEnd = () => {
    const end = endRef.current;
    if (!end) return;
    const vv = window.visualViewport;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const need = end.getBoundingClientRect().bottom + (formRef.current?.offsetHeight ?? 0) + 16 - viewBottom;
    if (need > 1) window.scrollBy({ top: need });
  };
  // 맨 아래로 단추(v0.6.5 소유자 "Claude처럼 위로 스크롤하면 맨 아래로 내려가는 화살표"): 마지막 말이 입력창 위로 안 보이면 뜬다
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  /** 새 말이 오기 직전에 위를 보고 있었나(v0.7.27 소유자 "맨 아래 볼 땐 밀어 올리고, 위 볼 땐 새 대화 표시") */
  const awayRef = useRef(false);
  const [newCount, setNewCount] = useState(0);
  const lastSeenId = useRef<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const end = endRef.current;
      if (!end) return;
      const vv = window.visualViewport;
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const covered = (formRef.current?.offsetHeight ?? 0) + 24;
      const away = end.getBoundingClientRect().top > viewBottom - covered + 120;
      awayRef.current = away;
      setAwayFromEnd(away);
      if (!away) setNewCount(0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  /** 맨 아래까지(v0.7.34 소유자 "맨 아래는 끝까지"): 마지막 카드의 버튼까지 입력창 위에 보이게 페이지 끝으로.
   *  머리·사무실이 접히며 높이가 바뀌므로 잠깐 뒤 한 번 더. 입력 중(휴대폰 키보드)일 때는 예전처럼 입력창 위만 맞춘다 */
  const toBottom = (smooth = false) => {
    if (document.activeElement === inputRef.current) return revealEnd();
    const go = (b: ScrollBehavior) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: b });
    go(smooth ? 'smooth' : 'auto');
    window.setTimeout(() => go('auto'), smooth ? 450 : 250);
  };
  const toEnd = () => toBottom(true);
  // 다른 탭에서 대화 탭으로 오면 맨 아래로(v0.7.29 소유자 "다른 탭에서 들어갔을 때 맨 아래가 보여야")
  useEffect(() => {
    if (!active || !log.length) return;
    const id = window.requestAnimationFrame(() => {
      awayRef.current = false;
      setNewCount(0);
      toBottom();
    });
    return () => window.cancelAnimationFrame(id);
  }, [active]);
  // 맨 아래를 보는 중에 카드가 늦게 커지면(사진·시안을 다 불러오면) 따라 내린다(v0.7.28). 위를 보고 있으면 그대로
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    let h = list.offsetHeight;
    const ro = new ResizeObserver(() => {
      const nh = list.offsetHeight;
      if (nh > h && !awayRef.current) toBottom();
      h = nh;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [log.length > 0]);
  // 입력창 높이를 CSS 변수(--inbox-form-h)로: 빈 대화의 인사말을 입력창 바로 위에 붙이는 데 쓴다(v0.4.78).
  useEffect(() => {
    const form = formRef.current;
    const box = form?.parentElement;
    if (!form || !box || typeof ResizeObserver === 'undefined') return;
    const set = () => box.style.setProperty('--inbox-form-h', `${form.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(form);
    return () => ro.disconnect();
  }, []);
  // 키보드가 열리고 닫히면(보이는 화면 높이가 바뀌면) 입력 중일 때만 다시 맞춘다.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // 키보드 높이(--kb, v0.5.13 소유자 "키패드 위로 채팅창 붙어서"): 아이폰은 키보드가 떠도 화면(레이아웃) 높이가 그대로라
    // 아래에 붙은 입력창이 키보드 뒤로 숨는다. 보이는 화면 아래 끝과의 차이만큼 입력창을 올린다(안드로이드는 보통 0).
    const root = document.documentElement;
    // 입력칸에 글을 쓰는 중일 때만 잰다(v0.5.15): 화면 확대·Claude 미리보기 창처럼 키보드 없이도 보이는 화면이 작아지면
    // 입력창이 공중에 떠서 그 아래로 대화가 비치던 것.
    // v0.5.70(소유자 "스크롤할 때·올릴 때 흔들려"): 아이폰은 키보드가 뜬 채 스크롤하면 보이는 화면(offsetTop)이 조금씩 움직여
    // 그때마다 --kb가 바뀌어 입력창이 튀었다. 한 화면 그리기마다 한 번만 재고, 6px 안쪽 변화는 무시한다.
    // v0.5.93(소유자 "켜진 채로 스크롤 시 여전히 흔들"): 스크롤 중 따라 움직이는 값은 한 박자 늦어 늘 흔들린다.
    // v0.5.99(소유자 "키보드에 안 붙음"): 스크롤을 아예 안 재니, 아이폰이 키보드를 띄운 뒤 화면을 한 번 더 옮기는 걸 놓쳤다.
    // 이제 스크롤 중에는 그대로 두고 멈춘 뒤(0.16초) 한 번 재며, 키보드가 열리고 닫힌 직후에도 몇 번 다시 잰다.
    let last = -1;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const typing = document.activeElement === inputRef.current;
      const raw = typing ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      const kb = raw > 40 ? raw : 0;
      if (last >= 0 && Math.abs(kb - last) < 6 && kb !== 0 && last !== 0) return;
      last = kb;
      root.style.setProperty('--kb', `${kb}px`);
      // 키보드가 떠 있으면 아이폰 홈 막대 여백(safe-area)이 필요 없다(v0.5.93): 그 여백만큼 입력창 밑에 빈 띠가 생겼다
      root.classList.toggle('kb-open', kb > 0);
    };
    const setKb = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const timers: number[] = [];
    // 키보드가 올라오는 동안(아이폰 약 0.3~0.5초) 화면이 자리 잡을 때까지 몇 번 다시 잰다
    const settle = () => {
      setKb();
      for (const ms of [120, 320, 650]) timers.push(window.setTimeout(setKb, ms));
    };
    let scrollTimer = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(setKb, 160);
    };
    const onFocusChange = () => window.setTimeout(settle, 0);
    // v0.6.1(소유자 "대화창은 그대로, 입력창만 키보드에"): 키보드가 뜬 채 대화를 손가락으로 끌어 스크롤하면 키보드를 내린다
    // (메시지 앱처럼). 스크롤 중에는 키보드가 없으니 입력창이 흔들릴 일이 없다. 입력창 안에서 끄는 것은 그대로 둔다.
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const inForm = formRef.current?.contains(e.target as Node);
      touchY = !inForm && document.activeElement === inputRef.current ? e.touches[0]?.clientY ?? null : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const y = e.touches[0]?.clientY ?? touchY;
      if (Math.abs(y - touchY) > 24) {
        touchY = null;
        inputRef.current?.blur();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    const onResize = () => {
      settle();
      if (document.activeElement === inputRef.current) revealEnd();
    };
    setKb();
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onScroll);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onScroll);
      window.clearTimeout(scrollTimer);
      for (const t of timers) window.clearTimeout(t);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty('--kb');
      root.classList.remove('kb-open');
    };
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // @ 누르면 위에 뜨는 AI 목록(v0.5.47, 카카오톡 태그처럼)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const mentionList = mention ? mentionOptions(mention.query) : [];
  const readMention = (el: HTMLTextAreaElement) => setMention(el.selectionStart === el.selectionEnd ? mentionQuery(el.value, el.selectionStart) : null);
  // 완료 기준 태그 줄(v0.5.99): v0.6.0 소유자 "펼치는 버튼을 두고" — 입력창 아래 [● 기준] 버튼으로 펼치고 접는다
  const [critOpen, setCritOpen] = useState(false);
  // 대화에서 기획서 바로 보기(v0.6.3 소유자 "채팅에서 기획서 보기 버튼, 팝업으로")
  const [specFor, setSpecFor] = useState<string | null>(null);
  const pickCriterion = (tag: string) => {
    const el = inputRef.current;
    if (!el) return;
    const next = insertCriterion(el.value, el.selectionStart ?? el.value.length, tag);
    setInput(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };
  const pickMention = (tag: string) => {
    const el = inputRef.current;
    if (!el || !mention) return;
    const next = insertMention(el.value, el.selectionStart, mention.start, tag);
    setInput(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };
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
    // 새로 붙은 말(이 대화창 것만). 마지막으로 본 말 뒤의 것
    const i = lastSeenId.current ? log.findIndex((m) => m.id === lastSeenId.current) : -1;
    const added = (i >= 0 ? log.slice(i + 1) : lastSeenId.current ? log : []).filter(inThread);
    lastSeenId.current = log[log.length - 1]?.id ?? null;
    // 위를 보고 있으면 끌어내리지 않고 '새 메시지' 표시만(내가 보낸 말이면 내린다)
    if (awayRef.current && !added.some((m) => m.from === 'me')) {
      const others = added.filter((m) => m.from !== 'me').length;
      if (others) setNewCount((c) => c + others);
      return;
    }
    setNewCount(0);
    // 대화 상자 안을 맨 아래(새 메시지)로 내리고, 화면도 입력창이 보이게 맞춘다.
    const box = listRef.current;
    if (box) box.scrollTop = box.scrollHeight;
    // 화면에 대화가 하나도 없으면 맨 위 그대로 둔다(첫 화면).
    if (log.length) toBottom();
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

  // 1분마다 다시 보기(오래 걸리는 개발 알림용, 화면이 보일 때만)
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === 'visible' && setMinute((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const announced = useRef(new Set<string>());
  // 단계 알림: 확인 질문·막힘이 생기면 미니엉이 알리고, 아래에 버튼을 둔다(규칙만, 토큰 0, v0.4.12부터 승인 차례는 내 차례가 보여 줌).
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
    const have = new Set([...logRef.current.flatMap((m) => [m.id, ...(m.ids ?? [])]), ...announced.current]);
    // 오래 걸리는 개발(v0.6.80)도 같은 방식으로 한 번씩(1분마다 다시 본다)
    // v0.7.15: 사장님이 누른 승인·수정 요청·시안 고르기도 먼저 남긴다
    // v0.7.16: 같은 업무에서 한꺼번에 일어난 것(누른 것 + 그 결과 단계)은 한 메시지로
    const add = mergeNotices([...actionNotices(snap.tasks, snap.workflow), ...(before ? notices : []), ...staleNotices(snap.tasks, snap.workflow)].filter((n) => !have.has(n.id)));
    if (!add.length) return;
    // 화면이 다시 그려지기 전에 또 불려도 같은 알림을 두 번 넣지 않게(v0.7.16)
    add.forEach((n) => [n.id, ...(n.ids ?? [])].forEach((id) => announced.current.add(id)));
    add.forEach((n) => archive({ role: 'office', text: n.text, projectId: n.projectId, taskId: n.taskId }));
    // 기본 대화창과 그 프로젝트 대화창 둘 다에 보이고, 어느 프로젝트 일인지 앞에 적는다(v0.4.89 소유자)
    const pname = (id: string) => snap.projects.find((p) => p.id === id)?.name;
    const msgs: Msg[] = add.map((n) => ({
      id: n.id,
      from: 'office',
      at: new Date().toISOString(),
      text: pname(n.projectId) ? `[${pname(n.projectId)}] ${n.text}` : n.text,
      taskId: n.taskId,
      stage: n.stage,
      actions: n.actions,
      home: '',
      projects: [n.projectId],
      ...(n.ids?.length ? { ids: n.ids } : {}),
    }));
    setLog((l) => [...l.filter((m) => !add.some((n) => n.id === m.id)), ...msgs].slice(-KEEP));
  }, [snap.tasks, snap.workflow, syncReady, minute]);

  // Claude 웹 조사 답(v0.7.11): 끝난 조사를 기본 대화창에 한 번씩 띄운다(다른 기기가 이미 넣었으면 같은 id라 다시 안 넣음).
  useEffect(() => {
    if (!syncReady || !snap.research?.length) return;
    let shownIds: string[] = [];
    try {
      shownIds = JSON.parse(localStorage.getItem(RESEARCH_KEY) ?? '[]') as string[];
    } catch {
      shownIds = [];
    }
    const have = new Set([...shownIds, ...logRef.current.filter((m) => m.id.startsWith('research-')).map((m) => m.id.slice(9))]);
    const add = unannounced(snap.research, have);
    if (!add.length) return;
    try {
      localStorage.setItem(RESEARCH_KEY, JSON.stringify([...shownIds, ...add.map((r) => r.id)].slice(-100)));
    } catch {
      // 저장이 막힌 브라우저: 대화 기록의 id로만 막는다.
    }
    const msgs: Msg[] = add.map((r) => ({
      id: `research-${r.id}`,
      from: r.status === 'done' ? 'gemini' : 'office',
      at: new Date().toISOString(),
      text: researchMessage(r),
      home: '',
      ...(r.status === 'done' ? { via: 'Claude가 웹에서 찾아 답함', ...(r.sources.length ? { sources: r.sources } : {}) } : {}),
    }));
    setLog((l) => [...l, ...msgs].slice(-KEEP));
  }, [snap.research, syncReady]);

  // 업무 카드에서 답한 확인 질문 답을 대화창(기본·그 프로젝트)에도 남긴다(v0.4.90).
  useEffect(() => {
    if (!echo) return;
    const name = snap.projects.find((p) => p.id === echo.projectId)?.name;
    const tag = name ? `[${name}] ` : '';
    const both = { home: '', projects: [echo.projectId] };
    setLog((l) =>
      [
        ...l,
        { id: mid(), from: 'me' as From, text: `${tag}(업무 카드에서 답함) ${echo.text}`, taskId: echo.taskId, ...both },
        { id: mid(), from: 'office' as From, text: `${tag}답을 받았어요. Gemini가 기획서를 다시 써요.`, taskId: echo.taskId, ...both },
      ].slice(-KEEP),
    );
    archive({ role: 'me', text: echo.text, projectId: echo.projectId, taskId: echo.taskId });
  }, [echo?.n]);

  // 다른 탭에서 넘어온 초안을 입력칸에 채우고 바로 쓸 수 있게 한다.
  useEffect(() => {
    if (!draft) return;
    if (draft.send) {
      // 다른 탭의 입력 창에서 다 쓴 글: 입력칸을 거치지 않고 바로 보낸다
      window.setTimeout(() => submit(draft.text), 60);
      return;
    }
    setInput(draft.text);
    focusTask.current = draft.taskId ? { taskId: draft.taskId, prefix: draft.text.trim() } : null;
    window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 60);
  }, [draft?.n]);

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
  const say = (from: From, text: string, link: { projectId?: string; taskId?: string; created?: boolean } = {}) => {
    if (muted.current && from !== 'me') return;
    // v0.4.66: 지금 대화창에 쓰고, 프로젝트가 정해진 말은 그 프로젝트 대화창에도 보인다.
    setLog((l) => [...l, { id: mid(), from, text, home: thread, ...(link.projectId && link.projectId !== thread ? { projects: [link.projectId] } : {}), ...(link.taskId ? { taskId: link.taskId } : {}), ...(link.created ? { created: true } : {}) }].slice(-KEEP));
    if (link.projectId || link.taskId) archive({ role: from, text, projectId: link.projectId ?? null, taskId: link.taskId ?? null });
  };
  // 여러 일이 겹쳐도(답 기다리는 중 접수 카드를 눌러도) 모두 끝나야 '처리 중'이 풀린다.
  const run = async (fn: () => Promise<void>) => {
    runs.current += 1;
    setBusy(true);
    try {
      await fn();
    } finally {
      runs.current -= 1;
      if (runs.current === 0) {
        setBusy(false);
        muted.current = false;
      }
    }
  };
  /** 처리 중 멈추기: 화면에서 기다리던 답을 버린다(이미 접수된 업무는 그대로, 취소는 접수 메시지의 '접수 취소') */
  const stop = () => {
    if (!runs.current) return;
    muted.current = true;
    setBusy(false);
    setPending(null);
    setLog((l) => [...l.filter((m) => !(m.from === 'gemini' && !m.text)), { id: mid(), from: 'office' as From, text: '멈췄어요. 늦게 오는 답은 보이지 않아요. 이미 접수된 업무는 그대로예요.', home: thread }].slice(-KEEP));
  };

  const short = (t: string) => (t.length > 30 ? `${t.slice(0, 29)}…` : t);

  /** 업무 접수 확인 카드를 띄운다(v0.4.58). 카드는 대화가 이어져도 남고, 카드마다 따로 접수한다. */
  const offerTask = (text: string, candidates: Project[], context?: PriorChat, extra: { whole?: string; ask?: string } = {}) => {
    if (muted.current) return;
    // 프로젝트 대화창에서 한 요청은 그 프로젝트로 바로(v0.4.66, 소유자)
    const list = candidates.length ? candidates : currentProject ? [currentProject] : [];
    const project = list.length === 1 ? list[0] : null;
    const what = extra.whole ? `'${short(text)}' — ` : context ? `앞 대화('${short(context.question)}')를 이어서 개발 요청으로 — ` : '';
    const line = extra.ask
      ? `${extra.ask}${extra.whole ? `\n('${short(text)}')` : ''}`
      : project
        ? `${what}'${project.name}' 프로젝트 업무로 접수할까요?`
        : `${what}어느 프로젝트 업무인가요? 아래에서 고르거나 새 프로젝트를 만드세요.`;
    setLog((l) => [...l, { id: mid(), from: 'office' as From, text: line, home: thread, offer: { text, projectId: project?.id ?? null, context, whole: extra.whole, ask: Boolean(extra.ask), state: 'open' as const } }].slice(-KEEP));
  };

  const settleOffer = (id: string, state: Offer['state']) => setLog((l) => l.map((m) => (m.id === id && m.offer ? { ...m, offer: { ...m.offer, state } } : m)));

  const acceptOffer = (m: Msg, project: Project) => {
    const o = m.offer!;
    settleOffer(m.id, 'done');
    setOtherFor(null);
    // 접수 카드로 받았으면 예전에 남은 선택 버튼(예: '사실은 업무 요청이에요')은 접는다.
    setPending(null);
    say('me', `${project.name} 맞아요${o.whole ? ` ('${short(o.text)}')` : ''}`, { projectId: project.id });
    void run(() => create(o.text, project, o.context, o.whole));
  };

  const askProject = (text: string, context?: PriorChat) => offerTask(text, [], context);

  const handleRequest = (text: string, candidates: Project[], context?: PriorChat) => offerTask(text, candidates, context);

  const submit = (raw: string, opts: { again?: boolean } = {}) => {
    const text = raw.trim();
    if (!text) return;
    if (muted.current && runs.current) {
      setLog((l) => [...l, { id: mid(), from: 'office' as From, text: '앞 요청을 멈추는 중이에요. 잠깐 뒤에 다시 보내 주세요.', home: thread }].slice(-KEEP));
      return;
    }
    if (opts.again) {
      // "새 질문이에요"를 고른 경우: 이미 화면에 있는 말을 확인 질문 답으로 보지 않고 다시 분류한다.
      setPending(null);
      routeText(text, [], null);
      return;
    }
    setInput('');
    if (replyTo) {
      // 답장은 글만 그 업무로(첨부는 그대로 남겨 둔다)
      const to = replyTo;
      setReplyTo(null);
      sendReply(to, text);
      return;
    }
    const sent = photos;
    if (sent.length) {
      setPhotos([]);
      setPhotoErrors([]);
    }
    if (sent.length) {
      // 보낸 말 아래에 무엇을 첨부했는지 작은 미리보기로 남긴다(누르면 크게, v0.4.89)
      const id = mid();
      const files = sent.map((f, i) => {
        const key = `${id}:${i}`;
        if (f.type.startsWith('image/')) fullUrls.set(key, URL.createObjectURL(f));
        return { name: f.name, key };
      });
      setLog((l) => [...l, { id, from: 'me' as From, text, home: thread, files }].slice(-KEEP));
      void Promise.all(sent.map(thumbOf)).then((thumbs) =>
        setLog((l) => l.map((m) => (m.id === id && m.files ? { ...m, files: m.files.map((f, i) => ({ ...f, thumb: thumbs[i] })) } : m))),
      );
    } else say('me', text);
    // v0.4.58: 답을 기다리는 중에 보낸 말은 버리지 않고 줄 세웠다가 앞 일이 끝나면 차례로 처리한다.
    if (busy || queue.length) {
      setQueue((q) => [...q, { text, files: sent }]);
      return;
    }
    handle(text, sent);
  };

  /** 이미 화면에 올린 내 말 하나를 처리한다(바로, 또는 줄 선 차례가 되었을 때) */
  const handle = (text: string, sent: File[]) => {
    // 이 메시지에 사진이 있으면 미니엉의 다음 확인까지 들고 간다. 사진 없는 새 메시지는 이전 사진을 놓는다(확인 답만 할 때는 유지).
    if (sent.length) photoStore.held = sent;
    else if (!pending || !replyIntent(text)) {
      if (pending?.kind !== 'naming') photoStore.held = [];
    }
    // 확인 질문에 버튼 대신 글로 답한 경우("응", "만들어", "아니" 등)
    const yn = replyIntent(text);
    // Gemini 확인 질문 바로 뒤에 쓴 글은 그 답으로 기록하고, Gemini가 기획서를 다시 쓴다.
    const clarify = !pending && onClarify ? openClarify() : null;
    // v0.4.20: 확인 질문 바로 뒤라도 질문처럼 보이면("…뭐야?", 앱 상태 질문) 답으로 넣기 전에 물어본다.
    if (clarify) {
      const k = triage(text, snap).kind;
      if (k === 'question' || k === 'status' || /[?？]\s*$/.test(text)) {
        setPending({ kind: 'clarifyOrAsk', text, taskId: clarify.task.id });
        say('office', `'${short(clarify.task.title)}' 확인 질문의 답인가요, 새 질문인가요?`);
        return;
      }
    }
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
    // 접수 카드에 글로 답한 경우: 바로 위(최근 4개 말 안)의 열린 카드 하나에만 적용한다.
    const recent = logRef.current.slice(-4);
    const openCard = !pending && yn ? [...recent].reverse().find((m) => m.offer?.state === 'open' && !m.offer.ask) : undefined;
    if (openCard) {
      const project = snap.projects.find((p) => p.id === openCard.offer!.projectId);
      if (yn === 'yes' && project) acceptOffer(openCard, project);
      else {
        setOtherFor(openCard.id);
        say('office', '그럼 어느 프로젝트인가요? 카드에서 고르세요.');
      }
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
    routeText(text, sent, prior ?? null);
  };

  /** 글을 나눈다: 앱 상태 질문·새 프로젝트는 규칙(토큰 0), 그 밖은 AI가 먼저 판단(v0.4.29, 데모는 규칙) */
  const routeText = (text: string, sent: File[], priorChat: PriorChat | null) => {
    const prior = priorChat ?? undefined;
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
    else if (canAskGemini) {
      // v0.4.29(소유자 2026-11-01): 그 밖의 말은 AI가 먼저 판단한다(질문·업무·애매 + 프로젝트). 질문이면 같은 한 번에 답한다.
      // @Tavily(@웹검색)면 판단 없이 바로 웹 조사(v0.7.3, v0.7.52)
      if (asksSearch(text)) askGemini(text, questionProject(text, snap.projects)?.name, undefined, { research: true });
      else askGemini(text, questionProject(text, snap.projects)?.name, { prior }, { research: needsResearch(text) });
    }
    // 체험(v0.7.60): 웹 조사 말이면 정해진 체험 답으로(사무실에서 Tavily·Firecrawl이 리서치실로 가는 연출을 볼 수 있게)
    else if (demoResearch && (asksSearch(text) || needsResearch(text))) askGemini(text, questionProject(text, snap.projects)?.name, undefined, { research: true });
    else ruleRoute(text, prior);
  };

  /** 규칙만으로 나누기(데모 모드, 또는 AI 판단이 실패했을 때) */
  const ruleRoute = (text: string, prior: PriorChat | undefined) => {
    const t = triage(text, snap);
    if (t.kind === 'status') say('office', t.answer);
    else if (t.kind === 'new_project') {
      if (t.name) void run(() => makeProject(t.name!, null));
      else {
        setPending({ kind: 'naming', text: '', createTask: false });
        say('office', '새 프로젝트 이름을 알려주세요.');
      }
    }
    else if (t.kind === 'request') {
      // 프로젝트 대화창이면 그 프로젝트 먼저(v0.6.96: AI 판단 길(taskCandidates)과 같게. 점검 '고치기 요청'의 파일 이름이 다른 프로젝트 이름과 겹쳐도 안 바뀌게)
      let candidates = currentProject ? [currentProject] : t.candidates.length || !prior ? t.candidates : matchProjects(prior.question, snap.projects);
      handleRequest(text, candidates, prior);
    }
    else if (t.kind === 'question') {
      // 소유자 결정(2026-10-30): 일반 질문은 보내기 한 번에 Gemini 무료가 답하고, GPT로 이어서 물을 수 있다.
      // 프로젝트 판단이 필요한 질문(프로젝트 이름이 들어 있음)은 GPT를 먼저 권한다.
      // v0.4.15(소유자: "물어보면 그냥 대답"): 프로젝트 이름이 든 질문도 바로 답하고, GPT 권유는 답 아래 작은 링크로.
      const project = questionProject(text, snap.projects);
      if (canAskGemini) askGemini(text, project?.name);
      else {
        setPending({ kind: 'question', text });
        say(
          'office',
          geminiAway
            ? `Studio A·B(Gemini)가 모두 휴가라 지금은 앱 상태 질문만 답할 수 있어요. 팀 관리에서 한 명을 근무로 돌려 주세요.${gptAway ? '' : ' ChatGPT로 복사해 물어볼 수는 있어요.'}`
            : '업무 기록으로는 답할 수 없는 질문이에요. 어디에 물어볼까요?',
        );
      }
    } else if (prior && canAskGemini && text.length <= FOLLOWUP_MAX) {
      // Gemini 답 바로 뒤의 짧은 말("더 자세히", "예시도")은 이어지는 질문으로 본다. 개발하라는 말이 있으면 위에서 확인한다.
      askGemini(text);
    } else {
      setPending({ kind: 'unclear', text });
      say('office', '질문인가요, 업무 요청인가요?');
    }
  };

  /** "확인 질문의 답이에요": 그 업무의 Gemini 확인 질문에 답으로 기록하고 기획서를 다시 쓰게 한다 */
  const answerClarify = (taskId: string, text: string) => {
    setPending(null);
    const task = snap.tasks.find((t) => t.id === taskId);
    const v = task ? deriveWorkflow(task, snap.workflow) : null;
    if (!task || !v || v.stage !== 'needs_clarification' || !v.spec || !onClarify) {
      say('office', '그 확인 질문은 이미 끝났어요. 업무 카드에서 확인하세요.');
      return;
    }
    archive({ role: 'me', text, projectId: task.projectId, taskId: task.id });
    // 대화창에서 한 답은 기본 창과 그 프로젝트 창 둘 다에 보이게(v0.4.90). 업무 카드의 문답 목록에도 기록된다.
    setLog((l) => {
      const at = [...l].reverse().findIndex((m) => m.from === 'me' && m.text.startsWith(text));
      if (at < 0) return l;
      const idx = l.length - 1 - at;
      const m = l[idx];
      const projects = [...new Set([...(m.projects ?? []), task.projectId, ''])].filter((x) => x !== (m.home ?? ''));
      return l.map((x, i) => (i === idx ? { ...x, taskId: task.id, projects } : x));
    });
    void run(async () => {
      if (await onClarify(task, v.spec!.answer, text)) {
        const name = snap.projects.find((p) => p.id === task.projectId)?.name;
        setLog((l) => [...l, { id: mid(), from: 'office' as From, text: `${name ? `[${name}] ` : ''}답을 받았어요. Gemini가 기획서를 다시 써요.`, home: '', projects: [task.projectId], taskId: task.id }].slice(-KEEP));
      } else say('office', '답을 기록하지 못했어요. 위쪽 알림의 이유를 확인하거나 업무 카드의 확인 질문 칸에서 하세요.');
    });
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

  const create = async (text: string, project: Project, context?: PriorChat, whole?: string) => {
    const title = titleFrom(text);
    const images: PendingImage[] = photoStore.held.map((file, i) => ({ key: `${i}-${file.name}`, file, role: isImage(file.type) ? 'reference' : 'document', note: '' }));
    photoStore.held = [];
    const task = await onCreateTask({
      projectId: project.id,
      title,
      description: context
        ? priorChatText(context)
        : whole
          ? `${text === title ? '' : `${text}\n\n`}참고 — 여러 요청이 함께 온 원래 메시지(이 업무는 위 요청만 한다):\n${whole}`.slice(0, 2000)
          : text === title
            ? ''
            : text,
      requestedType: 'auto',
      priority: 'normal',
      originalText: text,
    }, images);
    if (!task) return say('office', '업무를 저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.');
    // v0.4.66: 대화창은 그대로 두고, 이 요청에 얽힌 말(요청·앞 대화·접수 카드)을 그 프로젝트 대화창에도 올린다.
    const related = (m: Msg) =>
      (m.from === 'me' && (m.text === text || m.text.startsWith(`${text}\n`))) ||
      m.offer?.text === text ||
      (context && (m.text === context.question || m.text === context.answer));
    setLog((l) => l.map((m) => (related(m) && (m.home ?? '') !== project.id && !m.projects?.includes(project.id) ? { ...m, projects: [...(m.projects ?? []), project.id] } : m)));
    // 접수된 요청 원문은 화면에 이미 있으므로 기록에만 남긴다. 이어 온 앞 대화도 이 업무 기록이 된다(개발 전 삭제 시 함께 지워짐).
    if (context) {
      archive({ role: 'me', text: context.question, projectId: project.id, taskId: task.id });
      archive({ role: 'gemini', text: context.answer, projectId: project.id, taskId: task.id });
    }
    archive({ role: 'me', text, projectId: project.id, taskId: task.id });
    say(
      'office',
      `'${project.name}'에 접수했어요: ${task.title}\n${
        onAutoDraft ? 'Gemini(무료)가 기획서 초안을 써요. 다 되면 여기서 알려 드릴게요.' : '아래 업무 카드의 진행 단계에서 기획부터 하세요.'
      }${thread === project.id ? '' : `\n'${project.name}' 프로젝트 대화창에도 올렸어요.`}`,
      { projectId: project.id, taskId: task.id, created: true },
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

  /** AI가 '업무'로 판단했을 때: AI가 고른 프로젝트(없으면 고른 칩·이름 맞추기)로 "이 프로젝트 맞아요?"를 묻는다 */
  /** 업무의 프로젝트 후보: 대화에서 고른 프로젝트 → AI가 고른 프로젝트 → 글 속 이름 → 앞 대화 */
  const taskCandidates = (text: string, aiProject: string | null, prior: PriorChat | undefined): Project[] => {
    if (currentProject) return [currentProject];
    const ai = matchRoutedProject(aiProject, snap.projects);
    if (ai) return [ai];
    const named = matchProjects(text, snap.projects);
    if (named.length || !prior) return named;
    return matchProjects(prior.question, snap.projects);
  };

  const routedTask = (text: string, aiProject: string | null, summary: string, prior: PriorChat | undefined) => {
    say('office', `업무 요청으로 봤어요.${summary ? `\n${summary}` : ''}`);
    handleRequest(text, taskCandidates(text, aiProject, prior), prior);
  };

  // 줄 선 말: 앞 일이 모두 끝나면 몰려온 말을 하나로 합쳐 한 번에 처리한다(v0.4.59, Claude처럼). 짧은 대답은 따로.
  useEffect(() => {
    if (busy || !queue.length) return;
    const { next, rest } = takeQueued(queue);
    setQueue(rest);
    if (next) handle(next.text, next.files);
    // handle은 매 렌더 새로 만들어지므로 의존성에서 뺀다(지금 화면 상태로 처리).
  }, [busy, queue]);

  const askGemini = (text: string, projectName?: string, route?: { prior?: PriorChat }, extra: { research?: boolean } = {}) => {
    // 조사(v0.4.61, v0.7.52 Tavily·Firecrawl): 웹에서 찾아야 하는 질문은 Tavily가 찾고 Firecrawl이 본문을 읽고 Gemini가 정리해 출처를 붙인다(규칙으로 고름, Exa 휴가·실패면 검색 없이 다시).
    const research = extra.research ?? (needsResearch(text) || asksSearch(text));
    setPending(null);
    void run(async () => {
      // 이전 Gemini 대화만 문맥으로 보낸다(최근 6개).
      const history: { role: 'user' | 'model'; text: string }[] = [];
      shown.forEach((m, i) => {
        if (m.from === 'gemini' && shown[i - 1]?.from === 'me') history.push({ role: 'user', text: shown[i - 1].text }, { role: 'model', text: m.text });
      });
      // 질문에는 이미지만 보낸다(문서는 업무 요청 자료로 올린 뒤 'Gemini로 요약').
      const held = photoStore.held.filter((f) => isRaster(f.type));
      const images = held.slice(0, MAX_GEMINI_IMAGES);
      if (held.length > MAX_GEMINI_IMAGES) say('office', `사진은 앞의 ${MAX_GEMINI_IMAGES}장만 Gemini에 보냅니다.`);
      if (held.length < photoStore.held.length) say('office', '문서는 질문에 보내지 않아요. 업무로 접수하면 요청 자료에서 Gemini로 요약할 수 있어요.');
      try {
        const encoded = await Promise.all(images.map(async (f) => ({ mime: f.type, data: await toBase64(f) })));
        // 보내자마자 빈 Gemini 말(입력 중 …)을 두고, 답 조각이 오면 그 자리에 글을 채운다.
        const id = mid();
        // v0.7.62 소유자 "대화에서 어떤 캐릭터가 작업 중인지 … 표시가 안 맞아": 기다리는 동안의 얼굴을 실제로 일하는 쪽으로.
        // 웹 조사면 찾는 쪽(Tavily, @Firecrawl이면 Firecrawl), 아니면 먼저 답할 Studio(@StudioB면 B). 답이 오기 시작하면 Gemini로 바뀐다
        const slotNow = answerSlot(text) ?? 1;
        const searcher = searchEngineOf(text) === 'firecrawl' ? 'Firecrawl' : 'Tavily';
        const waitingVia = research ? `${searcher} 검색 + Gemini · 찾는 중` : VIA_OF_SLOT[slotNow];
        setLog((l) => [...l, { id, from: 'gemini' as From, text: '', home: thread, via: waitingVia }].slice(-KEEP));
        const set = (t: string) => !muted.current && setLog((l) => l.map((m) => (m.id === id ? { ...m, text: t } : m)));
        // 판단을 맡겼으면 첫 줄(판단 머리)은 숨기고, 질문 답일 때만 본문을 바로 보여 준다.
        // v0.4.58: 여러 개로 나눴으면 질문 답만 모아 보여 준다(업무·애매는 끝난 뒤 카드로).
        const answersOf = (items: RoutedItem[]) =>
          items
            .filter((it) => it.kind === 'question' && it.body)
            .map((it) => (items.length > 1 && it.label ? `【${it.label}】\n${it.body}` : it.body))
            .join('\n\n');
        const put = (t: string) => {
          if (!route) return set(t);
          const r = parseRoutedAll(t);
          if (r.ready) set(answersOf(r.items));
        };
        const opts: AskOptions = {
          ...(currentProject ? { project: projectContext(currentProject, snap.tasks) } : {}),
          ...(route ? { route: { projects: snap.projects.map((p) => p.name) } } : {}),
          ...(research ? { research: true } : {}),
          ...(answerSlot(text) ? { slot: answerSlot(text)! } : {}),
          ...(research && searchEngineOf(text) ? { engine: searchEngineOf(text)! } : {}),
        };
        // 업무 카드에서 '대화로 묻기'로 시작한 질문이면 그 업무의 지금 상태를 참고로 붙인다(화면에는 안 보임)
        const focus = focusTask.current;
        const focusedTask = focus && text.trim().startsWith(focus.prefix) ? snap.tasks.find((t) => t.id === focus.taskId) : undefined;
        if (focus) focusTask.current = null;
        const ask = focusedTask ? `${text}\n\n${taskContext(focusedTask, snap.workflow)}` : text;
        let webFailed = false;
        // 사무실 연출(v0.7.60): 웹 조사 동안 Tavily·Firecrawl이 리서치실에서 일하고, 답이 오기 시작하면 Gemini가 정리
        const studio = opts.slot === 2 ? 'studioB' : 'studioA';
        let writing = false;
        const livePut = (t: string) => {
          if (research && !writing) {
            writing = true;
            setResearchPhase('write', studio);
            // 찾기가 끝나고 답을 쓰기 시작: 대화 얼굴도 정리하는 Gemini로
            setLog((l) => l.map((m) => (m.id === id ? { ...m, via: VIA_OF_SLOT[studio === 'studioB' ? 2 : 1] } : m)));
          }
          put(t);
        };
        if (research) setResearchPhase('search', studio);
        try {
          let got: Awaited<ReturnType<typeof onAskGemini>>;
          try {
            got = await onAskGemini(ask, history.slice(-6), encoded, livePut, opts).finally(() => setResearchPhase(null));
          } catch (e) {
            if (!research) throw e;
            // 웹 검색(Tavily·Firecrawl)이 안 되면(휴가·무료 사용량 끝 등) 검색 없이 한 번 더 묻는다.
            set('');
            got = await onAskGemini(ask, history.slice(-6), encoded, put, { ...opts, research: false });
            webFailed = true;
            say('office', `웹 검색은 안 돼서 Gemini가 아는 범위로만 답했어요(${(e as Error).message})${onAskClaude ? ' 아래 [Claude에게 찾아보기]를 누르면 Claude가 웹에서 찾아 몇 분 뒤 답해요.' : ''}`);
          }
          if (muted.current) return;
          const raw = got.answer;
          const sources = got.sources ?? [];
          // 날씨(v0.7.68)는 Open-Meteo 숫자로 규칙 답(Gemini 안 씀)
          const via = got.engine === 'Open-Meteo' ? 'Open-Meteo 날씨 자료 · 규칙으로 답함' : VIA_OF_SLOT[got.keySlot] ? (sources.length ? VIA_OF_SLOT[got.keySlot].replace('Gemini ·', `${got.engine ?? '웹'} 검색${got.pages ? ` + 본문 ${got.pages}개` : ' + 요약만'} + Gemini ·`) : VIA_OF_SLOT[got.keySlot]) : undefined;
          if (via || sources.length) setLog((l) => l.map((m) => (m.id === id ? { ...m, ...(via ? { via } : {}), ...(sources.length ? { sources } : {}) } : m)));
          const all = route ? parseRoutedAll(raw) : null;
          if (all && all.items.length > 1) {
            // 한 메시지에 여러 개: 질문은 위 말풍선에 모아 답하고, 업무는 카드마다 따로 접수 확인한다.
            const answer = answersOf(all.items);
            if (answer) set(answer);
            else setLog((l) => l.filter((m) => m.id !== id));
            const tasks = all.items.filter((it) => it.kind === 'task').length;
            const asks = all.items.filter((it) => it.kind === 'ambiguous').length;
            const questions = all.items.length - tasks - asks;
            say(
              'office',
              `${all.items.length}가지로 나눴어요: ${[questions && `질문 ${questions}`, tasks && `업무 ${tasks}`, asks && `확인 필요 ${asks}`].filter(Boolean).join(' · ')}.${tasks + asks ? ' 아래 카드에서 하나씩 정해 주세요.' : ''}`,
            );
            for (const it of all.items) {
              const piece = it.body && it.kind === 'task' ? it.body : it.label || it.body;
              if (it.kind === 'task') offerTask(piece, taskCandidates(piece, it.project, route?.prior), undefined, { whole: text });
              else if (it.kind === 'ambiguous') offerTask(it.label || text, [], undefined, { whole: text, ask: it.body || '질문인가요, 업무 요청인가요?' });
            }
            if (answer) setPending({ kind: 'followup', text, answer, projectName });
            return;
          }
          const r = all ? { ...all.items[0], ready: true } : null;
          if (r && r.kind !== 'question') {
            // 업무·애매: 답 말풍선은 지우고 미니엉이 이어서 묻는다. 첨부는 업무 접수까지 들고 간다.
            setLog((l) => l.filter((m) => m.id !== id));
            if (r.kind === 'task') routedTask(text, r.project, r.body, route?.prior);
            else {
              setPending({ kind: 'unclear', text });
              say('office', r.body || '질문인가요, 업무 요청인가요?');
            }
            return;
          }
          const answer = r ? r.body : raw;
          set(answer);
          photoStore.held = [];
          setPending({ kind: 'followup', text, answer, projectName, ...(webFailed ? { webFailed: true } : {}) });
        } catch (e) {
          setLog((l) => l.filter((m) => m.id !== id || m.text));
          throw e;
        }
      } catch (e) {
        // 판단을 맡겼는데 실패하면(한도 등) 규칙으로 나눈다.
        if (route) {
          say('office', `AI 판단이 안 돼서 규칙으로 나눌게요(${(e as Error).message})`);
          return ruleRoute(text, route.prior);
        }
        setPending({ kind: 'question', text, projectName });
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
    <section className={`inbox${shown.length === 0 ? ' is-empty' : ''}`} aria-label="묻기·요청 입력창">
      {/* 스크롤 중에도 상자 위 모서리가 칩 줄 바로 아래에 보이게(v0.5.9, 그림만) */}
      <div className="inbox-cap" aria-hidden="true" />
      {zoom && <ImageZoom src={zoom.src} name={zoom.name} onClose={() => setZoom(null)} />}
      {specFor &&
        (() => {
          const task = snap.tasks.find((t) => t.id === specFor);
          const v = task ? deriveWorkflow(task, snap.workflow) : null;
          const sp = v?.spec;
          if (!task || !v || !sp) return null;
          const canA = !v.aApproved && canApprove(v, 'A').ok && onApprove;
          return (
            <div className="archify-modal" role="dialog" aria-label="기획서" onClick={() => setSpecFor(null)}>
              <div className="archify-box map-brief-box" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="archify-close" onClick={() => setSpecFor(null)} aria-label="닫기">
                  ×
                </button>
                <div className="map-brief spec-pop">
                  <p className="appmap-title">기획서 v{sp.revision}</p>
                  <p className="muted small">{task.title}{v.aApproved ? ' · 기획 승인됨' : ''}</p>
                  {sp.intent === 'question' ? <p className="spec-pop-text">{sp.answer}</p> : <p className="spec-pop-text">{sp.finalPrompt || '(내용 없음)'}</p>}
                  {sp.changeScope && <p className="small"><b>바꿀 범위</b> {sp.changeScope}</p>}
                  {sp.preserveConstraints && <p className="small"><b>지킬 것</b> {sp.preserveConstraints}</p>}
                  {sp.testCriteria && (
                    <>
                      <p className="small"><b>완료 기준</b></p>
                      <ul className="crit-list">
                        {splitCriteria(sp.testCriteria).map((l, i) => {
                          const c = CRITERIA_TAGS.find((x) => x.tag === l.tag);
                          return (
                            <li key={i}>
                              <span className={`criteria-chip criteria-${c?.cls ?? 'none'}`}>
                                <span aria-hidden="true">{c?.icon ?? '·'}</span> {l.tag ?? '보통'}
                              </span>
                              <span>{l.body}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  <span className="form-actions spec-pop-actions">
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => { setSpecFor(null); onShowTask?.(task.id); }}>
                      업무 카드에서 고치기
                    </button>
                    {canA && (
                      <button type="button" className="btn btn-small btn-primary" onClick={() => { setSpecFor(null); noticeAct({ id: '', from: 'office', text: '', taskId: task.id } as Msg, 'A'); }}>
                        기획 승인
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      {/* 빈 대화창 인사말: 기본·프로젝트 대화창 모두(v0.5.13 소유자 "프로젝트별 빈 채팅에도 있는 게 맞다") */}
      {shown.length === 0 && (
        <div className="inbox-empty">
          <p className="inbox-hello">무엇을 도와드릴까요?</p>
          <p className="muted small inbox-note">
            {currentProject
              ? `이 창에서 한 질문은 ${currentProject.name} 기준으로 답하고, 요청은 ${currentProject.name} 업무로 접수 카드를 만듭니다.`
              : '예: "MuscleMap에 다크 모드 추가해줘", "Claude 오늘 몇 번 남았어?", "useEffect가 뭐야?" — 업무로 만들기 전에 프로젝트를 꼭 확인합니다.'}
          </p>
        </div>
      )}
      {shown.length > 0 && (
        <ol ref={listRef} className="inbox-log" aria-live="polite">
          {shown.map((m, i) => {
            // 디스코드식(v0.7.17): 얼굴·이름·역할·시각, 같은 쪽이 5분 안에 이어 말하면 묶고, 날짜가 바뀌면 구분선
            const sp = speakerOf(m);
            const t = timeOf(m);
            const prevT = i > 0 ? timeOf(shown[i - 1]) : null;
            const newDay = t !== null && (prevT === null || dayLabel(prevT) !== dayLabel(t));
            const cont = !newDay && continues(shown[i - 1], m);
            const parsed = m.stage ? noticeCard(m.text) : null;
            // 사장님이 누른 기록(act-)은 카드 대신 한 줄로(무겁지 않게)
            const actLine = parsed && m.id.startsWith('act-') ? parsed : null;
            const card = actLine ? null : parsed;
            const face = sp.id === 'me' ? null : characterUrl(sp.id, 'stand');
            // 업무 카드에만 답장(v0.7.25): 오른쪽으로 밀거나(휴대폰) [↩ 답장](마우스)
            const canReply = !!card && !!m.taskId && m.from !== 'me' && snap.tasks.some((x) => x.id === m.taskId);
            return (
            <Fragment key={m.id}>
            {newDay && (
              <li className="inbox-day" aria-hidden="true">
                <span>{dayLabel(t!)}</span>
              </li>
            )}
            <li
              className={`inbox-msg from-${m.from}${cont ? ' is-cont' : ''}${canReply ? ' can-reply' : ''}${swipe?.id === m.id ? ' is-swiping' : ''}`}
              style={swipe?.id === m.id ? { transform: `translateX(${swipe.dx}px)` } : undefined}
              onTouchStart={
                canReply
                  ? (e) => {
                      const p = e.touches[0];
                      touch.current = { id: m.id, x: p.clientX, y: p.clientY, horiz: null };
                    }
                  : undefined
              }
              onTouchMove={
                canReply
                  ? (e) => {
                      const st = touch.current;
                      const p = e.touches[0];
                      if (!st || st.id !== m.id) return;
                      const dx = p.clientX - st.x;
                      const dy = p.clientY - st.y;
                      if (st.horiz === null && Math.abs(dx) + Math.abs(dy) > 8) st.horiz = Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0;
                      if (st.horiz) setSwipe({ id: m.id, dx: Math.max(0, Math.min(72, dx)) });
                    }
                  : undefined
              }
              onTouchEnd={
                canReply
                  ? () => {
                      if (swipe?.id === m.id && swipe.dx >= 56) startReply(m);
                      touch.current = null;
                      setSwipe(null);
                    }
                  : undefined
              }
            >
              {swipe?.id === m.id && (
                <span className={`inbox-swipe-icon${swipe.dx >= 56 ? ' is-ready' : ''}`} aria-hidden="true">
                  {/* v0.7.26 소유자 "아이콘 안 어울림": 아이폰은 ↩ 글자를 이모지로 그려서, 앱 색 선 화살표로 */}
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                  </svg>
                </span>
              )}
              {canReply && (
                <button type="button" className="inbox-reply-btn" onClick={() => startReply(m)} aria-label={`이 업무에 답장: ${card?.title ?? ''}`}>
                  {'\u21A9\uFE0E'} 답장
                </button>
              )}
              {!cont && (
                <span className={`inbox-av av-${sp.id}`} aria-hidden="true">
                  {face ? <img src={face} alt="" /> : '나'}
                </span>
              )}
              <div className="inbox-body">
              {!cont && (
                <p className="inbox-head">
                  <b className="inbox-name">{sp.name}</b>
                  {sp.role && <span className="inbox-role">{sp.role}</span>}
                  {t !== null && <time className="inbox-time">{clockLabel(t)}</time>}
                </p>
              )}
              {m.reply && <p className="inbox-reply-quote">{'\u21A9\uFE0E'} {m.reply}</p>}
              {actLine ? (
                <p className="inbox-act">
                  {actLine.did}
                  <span className="inbox-act-task"> · {actLine.title}</span>
                </p>
              ) : card ? (
                <div className={`inbox-card tone-${toneOf(m.stage, m.text)}`}>
                  <p className="card-proj">{[card.project, card.label].filter(Boolean).join(' · ')}</p>
                  <p className="card-title">{card.title}</p>
                  {card.did && <p>{card.did}</p>}
                  {card.headline && <p className="card-headline">{card.headline}</p>}
                  {(() => {
                    // v0.7.18: 버튼이 보이면 버튼과 같은 말인 안내 줄은 빼고, 기획서 줄은 한 줄로 줄인다(자세한 건 업무 보기·기획서 보기)
                    const btns = noticeButtons(m);
                    const lines = btns ? card.lines.filter((l) => !isGuideLine(l)).map((l) => (l.startsWith('기획서 v') ? shortSpecLine(l) : l)) : card.lines;
                    // v0.7.23: 버튼(승인 요약)이 보이면 시안은 그림으로 보여 주니 시안 점수 칸은 뺀다
                    const fields = btns ? card.fields.filter((f) => !f.label.startsWith('시안 ')) : card.fields;
                    return (
                      <>
                        {fields.length > 0 && (
                          <dl className="card-fields">
                            {fields.map((f) => (
                              <div key={f.label}>
                                <dt>{f.label}</dt>
                                <dd>{f.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {lines.map((l, k) => (
                          <p key={k}>{l}</p>
                        ))}
                        {btns}
                      </>
                    );
                  })()}
                </div>
              ) : m.text ? (
                <p>{m.text}</p>
              ) : (
                <p className="inbox-typing" aria-label="답을 쓰는 중">
                  <span />
                  <span />
                  <span />
                </p>
              )}
              {m.files && m.files.length > 0 && (
                <ul className="inbox-sent-files" aria-label="보낸 첨부">
                  {m.files.map((f) => {
                    const src = (f.key && fullUrls.get(f.key)) || f.thumb;
                    return (
                      <li key={f.key ?? f.name}>
                        {f.thumb || src ? (
                          <button type="button" className="inbox-thumb" onClick={() => setZoom({ src: src!, name: f.name })} aria-label={`${f.name} 크게 보기`}>
                            <img src={f.thumb ?? src} alt="" />
                          </button>
                        ) : (
                          <span className="inbox-doc" title={f.name}>
                            {f.name}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {m.sources && m.sources.length > 0 && (
                <ul className="inbox-sources" aria-label="출처">
                  {m.sources.map((src) => (
                    <li key={src.uri}>
                      <a href={src.uri} target="_blank" rel="noreferrer noopener">
                        {src.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {!m.actions && m.taskId && onShowTask && snap.tasks.some((t) => t.id === m.taskId) && (
                <span className="inbox-tasklinks">
                  <button type="button" className="link-btn inbox-tasklink" onClick={() => onShowTask(m.taskId!)}>
                    업무 보기 →
                  </button>
                  {(() => {
                    const t = snap.tasks.find((x) => x.id === m.taskId);
                    return t && deriveWorkflow(t, snap.workflow).spec ? (
                      <button type="button" className="link-btn inbox-tasklink" onClick={() => setSpecFor(t.id)}>
                        기획서 보기
                      </button>
                    ) : null;
                  })()}
                </span>
              )}
              {m.offer?.state === 'open' && (() => {
                const o = m.offer;
                const project = snap.projects.find((p) => p.id === o.projectId);
                const list = project && otherFor !== m.id ? [] : snap.projects.filter((p) => p.id !== project?.id);
                return (
                  <span className="inbox-choices" role="group" aria-label="이 요청 접수하기">
                    {project && (
                      <button type="button" className="btn btn-small btn-primary" onClick={() => acceptOffer(m, project)}>
                        맞아요, 접수
                      </button>
                    )}
                    {project && otherFor !== m.id && (
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => setOtherFor(m.id)}>
                        다른 프로젝트
                      </button>
                    )}
                    {/* 이 프로젝트에 개발이 도는 업무가 있으면 새 업무 대신 그 업무의 추가 요청으로(v0.6.13) */}
                    {project && onAddFollowup && otherFor !== m.id &&
                      snap.tasks
                        .filter((t) => t.projectId === project.id && t.status !== 'done')
                        .filter((t) => snap.workflow.assignments.some((a) => a.taskId === t.id && (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting')))
                        .slice(0, 2)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="btn btn-small btn-ghost"
                            onClick={() => {
                              settleOffer(m.id, 'done');
                              void onAddFollowup(t.id, o.text).then((ok) => say('office', ok ? `개발 중인 '${short(t.title)}'에 추가 요청으로 적었어요. 다음 다시 개발 때 함께 보내요.` : '추가 요청을 적지 못했어요. 업무 카드에서 다시 해 주세요.', { projectId: t.projectId, taskId: t.id }));
                            }}
                          >
                            '{short(t.title)}'에 추가
                          </button>
                        ))}
                    {list.map((p) => (
                      <button key={p.id} type="button" className="btn btn-small btn-ghost" onClick={() => acceptOffer(m, p)}>
                        {p.name}
                      </button>
                    ))}
                    {(!project || otherFor === m.id) && (
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() => {
                          settleOffer(m.id, 'done');
                          setPending({ kind: 'naming', text: o.text, context: o.context });
                          say('office', '새 프로젝트 이름을 알려주세요.');
                        }}
                      >
                        + 새 프로젝트
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      onClick={() => {
                        settleOffer(m.id, 'dropped');
                        if (canAskGemini) {
                          say('me', `질문이에요: ${short(o.text)}`);
                          askGemini(o.text);
                        } else setPending({ kind: 'question', text: o.text });
                      }}
                    >
                      {o.ask ? '질문이에요' : '질문이었어요'}
                    </button>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => settleOffer(m.id, 'dropped')}>
                      {o.whole ? '빼기' : '취소'}
                    </button>
                  </span>
                );
              })()}
              {m.offer && m.offer.state !== 'open' && <span className="muted small inbox-offer-done">{m.offer.state === 'done' ? '접수함' : '접수 안 함'}</span>}
              {m.created && m.taskId && onCancelTask && (() => {
                const t = snap.tasks.find((x) => x.id === m.taskId);
                if (!t) return null;
                if (t.stage === 'cancelled') return <span className="muted small inbox-offer-done">접수 취소함</span>;
                if (t.status === 'done') return null;
                return confirmCancel === m.id ? (
                  <span className="inbox-choices" role="group" aria-label="접수 취소 확인">
                    <span className="small">이 업무를 취소할까요? 남은 AI 작업을 멈추고 기록은 남겨요.</span>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => { setConfirmCancel(null); onCancelTask(t); }}>
                      업무 취소
                    </button>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmCancel(null)}>
                      아니요
                    </button>
                  </span>
                ) : (
                  <span className="inbox-choices">
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmCancel(m.id)}>
                      접수 취소
                    </button>
                  </span>
                );
              })()}
              {!card && !actLine && noticeButtons(m)}
              </div>
            </li>
            </Fragment>
            );
          })}
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
            <span className="inbox-links">
              {!gptAway && (
                <>
                  <button type="button" className="link-btn" title="질문과 Gemini 답을 함께 복사합니다. ChatGPT 앱에 붙여넣으세요." onClick={() => void copyGpt(pending.text, pending.answer)}>
                    {pending.projectName ? `'${pending.projectName}' 판단은 GPT에게 묻기` : 'GPT에게 이어서 묻기'}
                  </button>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <button type="button" className="link-btn" onClick={() => askProject(pending.text, { question: pending.text, answer: pending.answer })}>
                업무로 만들기
              </button>
              {canAskGemini && !log.some((m) => m.from === 'gemini' && m.text === pending.answer && m.sources?.length) && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="link-btn"
                    title="Tavily(안 되면 Firecrawl)가 웹에서 찾고 Gemini가 정리해 출처를 붙여 답합니다(무료 크레딧 안)."
                    onClick={() => {
                      say('me', `웹에서 찾아봐 줘: ${pending.text.length > 40 ? `${pending.text.slice(0, 39)}…` : pending.text}`);
                      askGemini(pending.text, pending.projectName, undefined, { research: true });
                    }}
                  >
                    웹에서 찾아보기
                  </button>
                </>
              )}
              {pending.webFailed && onAskClaude && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="link-btn"
                    title="웹 검색(Tavily·Firecrawl)이 안 될 때 Claude가 웹에서 찾아 답합니다(Claude 하루 사용량 1회, 몇 분 걸림)."
                    onClick={() => {
                      const q = pending.text;
                      setPending(null);
                      say('me', `Claude에게 찾아봐 줘: ${q.length > 40 ? `${q.slice(0, 39)}…` : q}`);
                      void run(async () => {
                        try {
                          const r = await onAskClaude(q);
                          say('office', r.already ? '같은 질문을 Claude가 이미 찾는 중이에요. 답이 오면 여기 띄워요.' : 'Claude에게 웹 조사를 맡겼어요(몇 분). 답이 오면 여기 띄워요.');
                        } catch (e) {
                          say('office', `Claude에게 맡기지 못했어요: ${(e as Error).message}`);
                        }
                      });
                    }}
                  >
                    Claude에게 찾아보기
                  </button>
                </>
              )}
            </span>
          )}
          {pending.kind === 'question' && (
            <>
              {!gptAway && (
                <button type="button" className={`btn btn-small ${pending.projectName ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void copyGpt(pending.text)}>
                  ChatGPT로 복사
                </button>
              )}
              {canAskGemini && (
                <button type="button" className={`btn btn-small ${pending.projectName ? 'btn-ghost' : 'btn-primary'}`} onClick={() => askGemini(pending.text)}>
                  Gemini에게 묻기
                </button>
              )}
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => {
                  // 접수 카드가 대신하므로 질문 쪽 버튼은 접는다(v0.4.75).
                  const t = pending.text;
                  setPending(null);
                  askProject(t);
                }}
              >
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
          {pending.kind === 'clarifyOrAsk' && (
            <>
              <button type="button" className="btn btn-small btn-primary" onClick={() => answerClarify(pending.taskId, pending.text)}>
                확인 질문의 답이에요
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => submit(pending.text, { again: true })}>
                새 질문이에요
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
      {busy && (
        <p className="muted small inbox-note inbox-busy">
          {!log.some((m) => m.from === 'gemini' && !m.text) && '처리 중… '}
          <button type="button" className="btn btn-small btn-ghost" onClick={stop}>
            멈추기
          </button>
        </p>
      )}
      {queue.length > 0 && <p className="muted small inbox-note">앞 일이 끝나면 기다리는 말 {queue.length}개를 한 번에 읽고 답할게요.</p>}
      <div ref={endRef} />

      {/* 입력창 뒤 흐림 칸(v0.5.14 소유자): 대화가 입력창 윗선부터 뒤로 들어가며 흐려진다(그림만) */}
      <div className="inbox-fade" aria-hidden="true" />
      <form
        ref={formRef}
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
        {replyTo && (
          <p className="inbox-reply-bar">
            <span>
              <b>{'\u21A9\uFE0E'} 답장</b> {replyTo.label}
            </span>
            {/* 취소는 오른쪽(소유자), 휴대폰 '…' 버튼 자리만큼 비워 둔다(CSS) */}
            <button type="button" className="link-btn" aria-label="답장 취소" onClick={() => setReplyTo(null)}>
              ✕
            </button>
          </p>
        )}
        {/* 보낼 첨부는 입력창 안 위쪽에 붙는다(v0.4.88 소유자: 따로 떨어져 보였음) */}
        {photos.length > 0 && (
          <ul className="inbox-photos" aria-label="보낼 첨부">
            {photos.map((f, i) => (
              <li key={`${i}-${f.name}`}>
                {previews[i] ? (
                  <button type="button" className="inbox-thumb" onClick={() => setZoom({ src: previews[i], name: f.name })} aria-label={`${f.name} 크게 보기`}>
                    <img src={previews[i]} alt={f.name} />
                  </button>
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
        {awayFromEnd && shown.length > 0 && (
          <button type="button" className={`inbox-to-end${newCount ? ' has-new' : ''}`} aria-label={newCount ? `새 메시지 ${newCount}개, 맨 아래로` : '맨 아래로'} title="맨 아래로" onMouseDown={(e) => e.preventDefault()} onClick={toEnd}>
            {newCount > 0 && <span>새 메시지 {newCount}</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </button>
        )}
        {critOpen && !mentionList.length && pending?.kind !== 'naming' && (
          <div className="criteria-row" role="group" aria-label="완료 기준 넣기">
            {CRITERIA_TAGS.map((c) => (
              <button key={c.tag} type="button" className={`criteria-chip criteria-${c.cls}`} title={c.desc} onMouseDown={(e) => e.preventDefault()} onClick={() => pickCriterion(c.tag)}>
                <span aria-hidden="true">{c.icon}</span> {c.tag}
              </button>
            ))}
          </div>
        )}
        {mentionList.length > 0 && (
          <ul className="mention-pop" role="listbox" aria-label="맡길 AI 고르기">
            {mentionList.map((o) => (
              <li key={o.tag}>
                <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(o.tag)}>
                  <b>@{o.tag}</b> <span>{o.ko} · {o.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
          rows={1}
          value={input}
          maxLength={4000}
          placeholder={pending?.kind === 'naming' ? '새 프로젝트 이름' : currentProject ? `${currentProject.name}: 묻거나 시킬 일 (@로 맡길 AI 지정)` : '묻거나 시킬 일을 적으세요 (@로 AI 지정)'}
          aria-label="묻기·요청"
          onFocus={() => {
            if (canAskGemini) onWarmGemini?.();
            // 휴대폰 키보드가 올라온 뒤(애니메이션 끝) 마지막 말이 입력창 위에 보이게
            window.setTimeout(revealEnd, 350);
          }}
          onChange={(e) => {
            setInput(e.target.value);
            readMention(e.target);
          }}
          onSelect={(e) => readMention(e.currentTarget)}
          onBlur={() => setMention(null)}
          onKeyDown={(e) => {
            // @ 목록이 떠 있으면 Enter·Tab은 첫 번째 AI를 넣고, Esc는 닫는다
            if (mentionList.length && (e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
              e.preventDefault();
              pickMention(mentionList[0].tag);
              return;
            }
            if (mention && e.key === 'Escape') {
              setMention(null);
              return;
            }
            // PC: Enter로 보내고 Shift+Enter는 줄바꿈. 휴대폰: Enter는 줄바꿈(보내기 버튼으로만). 한글 조합 중 Enter는 무시한다.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchInput()) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        {/* v0.6.3(소유자 "Claude 앱 입력창과 똑같이"): 왼쪽 [+ 첨부][●◐○ 기준][지우기], 오른쪽 [마이크][↑ 보내기], 글자 없이 아이콘만 */}
        <div className="inbox-tools">
        <button type="button" className="inbox-icon inbox-plus" aria-label="사진·문서 첨부" title="사진·문서 첨부(붙여넣기·끌어다 놓기도 됩니다)" disabled={busy} onClick={() => fileInput.current?.click()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {pending?.kind !== 'naming' && (
          <button
            type="button"
            className={`criteria-toggle${critOpen ? ' is-on' : ''}`}
            aria-expanded={critOpen}
            aria-label="완료 기준(필수·권장·선택) 넣기"
            title="완료 기준(필수·권장·선택) 넣기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCritOpen((v) => !v)}
          >
            <span className="crit-dot must" aria-hidden="true">●</span>
            <span className="crit-dot nice" aria-hidden="true">◐</span>
            <span className="crit-dot opt" aria-hidden="true">○</span>
          </button>
        )}
        {shown.length > 0 && (
          <button
            type="button"
            className="inbox-icon inbox-clear"
            aria-label={pending ? '화면 지우기·요청 취소' : '화면 지우기'}
            title={`${pending ? '화면 지우기·요청 취소' : '화면 지우기'}: 이 대화창 화면에서만 지웁니다(접수된 업무·개발일지 기록은 그대로)`}
            onClick={() => {
              // 대화를 지우면 미니엉이 기다리던 요청(접수 확인·프로젝트 이름·저장소 만들기)도 취소한다.
              // 이미 접수된 업무는 기록이라 지우지 않는다(업무 카드에서 삭제).
              const hadPending = pending !== null;
              photoStore.held = [];
              setPending(null);
              setShowOther(false);
              setQueue([]);
              setOtherFor(null);
              // v0.4.66: 지금 보고 있는 대화창의 말만 지운다(다른 프로젝트 대화창은 그대로).
              setLog((l) => [
                ...l.filter((m) => !inThread(m)),
                ...(hadPending ? [{ id: mid(), from: 'office' as From, text: '진행 중이던 요청을 취소했어요. 이미 접수된 업무는 그대로 있어요(지우려면 업무 카드에서 삭제).', home: thread }] : []),
              ]);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </svg>
          </button>
        )}
        <span className="inbox-tools-gap" />
        <VoiceInput disabled={busy} onText={(t) => setInput((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t))} />
          <button type="submit" className="inbox-send" aria-label="보내기" title="보내기" disabled={busy || !input.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
