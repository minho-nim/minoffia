import { projectShortcuts } from './domain/shortcuts';
import { withBaseRules } from './domain/baseRules';
import { TeamPanel } from './components/TeamPanel';
import { TurnMenu } from './components/TurnMenu';
import { ThemeToggle } from './components/ThemeToggle';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentRoster, ReviewLog } from './components/AgentPanel';
import { DevlogPanel } from './components/DevlogPanel';
import { ProjectHistory } from './components/ProjectHistory';
import { Inbox } from './components/Inbox';
import { MyTurnList } from './components/MyTurn';
import { Login } from './components/Login';
import { ProjectPanel } from './components/ProjectPanel';
import { TaskCard } from './components/TaskCard';
import { TaskForm, type TaskDraft } from './components/TaskForm';
import type { PendingImage } from './components/Attachments';
import { WorkflowPanel, type WorkflowActions } from './components/WorkflowPanel';
import { createLocalStore, resetLocalDemo } from './data/localStore';
import { newId, type InboxState, type OfficeStore } from './data/store';
import { AGENT_BY_ID, AGENTS } from './domain/agents';
import { attachmentsOf, isImage, isRaster, moved, sha256OfBytes, type AttachmentKind } from './domain/attachments';
import { buildHandoff } from './domain/handoff';
import { buildGptPackage, buildPrototypeHandoff, codexBranch } from './domain/handoffV2';
import { myTurns, type TurnStep } from './domain/myTurn';
import { clarificationsOf, linksOf } from './domain/requestContext';
import { routeTask } from './domain/router';
import { canTransition } from './domain/status';
import type { AgentId, Project, Snapshot, Task, TaskStatus } from './domain/types';
import { STATUS_LABEL } from './domain/types';
import { kstDay, runsToday } from './domain/usage';
import { receiveWorkflowInbox } from './workflow/receiveInbox';
import { preparePlanImport } from './workflow/planImport';
import { createResultReviewer } from './workflow/resultReview';
import { RepoStructure } from './components/FileTreeView';
import { projectChanges } from './domain/fileTree';
import { checkSmallTask, OFFICE_REPOS, smallPlanText } from './domain/smallTask';
import { mentionedAssignee } from './domain/mention';
import { maskSecrets } from './domain/maskSecrets';
import { canApprove, deriveWorkflow, latestDeployment, latestPrCheck, officeStatus, prCheckPasses, resultWithoutBranch, sha256Hex } from './domain/workflow';
import type { AgentAssignment, Approval, PmPlan } from './domain/workflow-types';
import { EMPTY_WORKFLOW, STAGE_LABEL } from './domain/workflow-types';
import { dispatchClaude } from './lib/dispatch';
import { getSupabase } from './lib/supabase';
import { PushToggle } from './components/PushToggle';
import { OfficeView } from './office/OfficeView';
import { version } from '../package.json';
import { HealthCheck } from './components/HealthCheck';
import { DesignStandard } from './components/DesignStandard';
import { serviceLamps } from './domain/serviceLamps';
import { ciFixDone, ciFixWhy, nextAgent, PREF_LABEL, prefOf, quotaHit, reassignPlanText } from './domain/reassign';

type Tab = 'chat' | 'tasks' | 'projects' | 'agent' | 'team';
type Filter = 'open' | 'all' | TaskStatus;

const EMPTY: Snapshot = { projects: [], tasks: [], usage: [], workflow: EMPTY_WORKFLOW };
const POLL_MS = 15_000;
/** 실시간 연결이 있으면 혹시 놓친 변경만 잡는 느린 확인 */
const POLL_WITH_REALTIME_MS = 120_000;

/** DB·저장소 규칙 위반 메시지를 사용자 말로 바꾼다. */
function explainDbError(message: string): string {
  const rules: [string, string][] = [
    ['approvals_once', '이미 승인한 항목입니다. 중복으로 기록하지 않았습니다.'],
    ['A must approve the latest spec', '최신 기획서만 기획 승인할 수 있습니다.'],
    ['question/ambiguous', '단순 질문이나 의도 불분명 기획서는 개발 승인 대상이 아닙니다.'],
    ['A approval required', '최신 기획서의 기획 승인이 먼저 필요합니다.'],
    ['plan is stale', '기획서가 바뀌어 이 계획으로는 실행 승인할 수 없습니다. PM 계획을 다시 받으세요.'],
    ['E must', '최신 계획에 있는 작업만 실행 승인할 수 있습니다.'],
    ['E approval required', 'E 실행 승인 전에는 시작을 기록할 수 없습니다.'],
    ['B must approve the latest', '최신 결과 패키지만 올리기 승인할 수 있습니다.'],
    ['C requires B', '같은 결과의 올리기 승인이 먼저 필요합니다.'],
    ['approve the prototype (P)', '견본 먼저 계획입니다. 견본을 올리고 견본 승인을 한 뒤 Codex를 실행 승인하세요.'],
    ['P requires an uploaded prototype', '승인할 견본(AI Studio 결과)을 먼저 올리세요.'],
    ['P is only for prototype_first', '견본 먼저 계획에서만 견본을 승인합니다.'],
    ['prototype is locked after P approval', '견본 승인 뒤에는 견본을 바꿀 수 없습니다.'],
    ['plan is not prototype_first', '이 계획은 바로 개발이라 견본을 올리지 않습니다.'],
    ['prototype must target the latest plan', '최신 계획에만 견본을 올릴 수 있습니다.'],
    ['revision must be', '다른 기기에서 먼저 새 버전이 저장됐습니다. 새로고침 후 다시 시도하세요.'],
    ['only the server', '서버가 확인한 상태는 화면에서 기록할 수 없습니다.'],
    ['revision request needs', '기획 승인된 최신 기획서가 있어야 수정 요청할 수 있습니다.'],
    ['revision request must target', '최신 결과에만 수정 요청할 수 있습니다.'],
    ['already approved for GitHub', '이미 GitHub 업로드를 승인한 결과는 수정 요청할 수 없습니다.'],
    ['새 결과를 받은 뒤', 'PM에 수정을 요청한 상태입니다. 새 결과를 받은 뒤 승인하세요.'],
    ['locked after A approval', '기획 승인 뒤에는 요청 자료를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.'],
    ['append-only', '결과 스크린샷은 검토 기록이라 고치거나 지울 수 없습니다.'],
    ['result attachment must target', '최신 결과 패키지에만 스크린샷을 붙일 수 있습니다.'],
    ['too many attachments', '이미지 장수 상한(요청 10장, 결과 6장)을 넘었습니다.'],
    ['quota exceeded', '첨부 저장 공간 상한(900MB)을 넘었습니다. 오래된 업무를 정리하세요.'],
    ['invalid storage path', '파일 저장 위치가 올바르지 않습니다. 다시 로그인한 뒤 시도하세요.'],
    ['mime type', 'PNG·JPG·WEBP·GIF 이미지만 올릴 수 있습니다.'],
    ['concurrent execution limit', '이 AI의 동시 작업 상한에 닿았습니다. 하나를 끝내거나 "중단 기록"을 누르거나, 에이전트 탭에서 상한을 올리세요.'],
    ['C requires a passing CI', 'PR의 CI 성공을 서버가 확인해야 배포 승인을 할 수 있습니다(병합은 배포 승인 때 서버가 해요). "PR·CI 확인"을 누르세요.'],
    ['dependency not finished', '계획상 앞 작업이 끝나야 시작할 수 있습니다. 앞 작업의 결과를 먼저 등록하세요.'],
    ['exceeded the maximum allowed size', '파일이 5MB를 넘습니다.'],
    ['links are locked after A approval', '기획 승인 뒤에는 요청 자료(링크)를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.'],
    ['clarification must target', '다른 기기에서 기획서가 새로 저장됐습니다. 새로고침 후 다시 기록하세요.'],
    ['too many clarifications', '확인 질문은 업무당 30건까지 기록합니다.'],
  ];
  const hit = rules.find(([needle]) => message.includes(needle));
  return hit ? hit[1] : `저장하지 못했습니다: ${message}`;
}

/**
 * 요소 높이를 CSS 변수로: 탭(--tabs-h, v0.4.70)·업무 탭 칩 줄(--chips-h, v0.4.78) 아래에 다음 고정 줄을 붙이는 데 쓴다.
 * 요소가 사라지면 0으로 둔다.
 */
function heightWatcher(name: string) {
  let observer: ResizeObserver | null = null;
  return (el: HTMLElement | null) => {
    observer?.disconnect();
    observer = null;
    // 소수점 높이를 올림한다(정수로 내림하면 그 밑에 붙는 줄이 1~2px 가려짐, v0.5.10)
    const set = () => document.documentElement.style.setProperty(name, `${el ? Math.ceil(el.getBoundingClientRect().height) : 0}px`);
    set();
    if (!el || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(set);
    observer.observe(el, { box: 'border-box' });
  };
}
const watchTabsHeight = heightWatcher('--tabs-h');
const watchChipsHeight = heightWatcher('--chips-h');

export function App() {
  const [booting, setBooting] = useState(true);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<OfficeStore | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  // 알림을 누르면 그 업무 카드를 연다(v0.5.83): 주소의 ?task=<id> 또는 서비스 워커 메시지. showTask는 아래에서 채운다.
  const openTaskRef = useRef<(id: string) => void>(() => undefined);
  const pendingTask = useRef<string | null>(typeof location !== 'undefined' ? new URLSearchParams(location.search).get('task') : null);
  // v0.4.16(소유자): 대화(입력창)와 업무 목록을 탭으로 나눈다. 처음은 대화.
  const [tab, setTab] = useState<Tab>('chat');
  const [filter, setFilter] = useState<Filter>('open');
  // 업무 탭 프로젝트 칩(v0.4.18): 'all' 또는 프로젝트 id. 마지막 선택은 이 기기에 기억한다.
  const [projectFilter, setProjectFilterState] = useState<string>(() => {
    try {
      return localStorage.getItem('minlab-ai-office:project-filter:v1') ?? 'all';
    } catch {
      return 'all';
    }
  });
  // 대화 탭 프로젝트(v0.4.24, 소유자 결정): 기본은 없음 = 일반 AI 질문 창(Claude·ChatGPT처럼).
  // 프로젝트 칩을 누르면 그 프로젝트 기준으로 묻고, 다시 누르면 일반 대화로 돌아간다. 업무 탭 필터와 따로 둔다.
  const [chatProject, setChatProject] = useState<string | null>(null);
  const setProjectFilter = (id: string) => {
    setProjectFilterState(id);
    try {
      localStorage.setItem('minlab-ai-office:project-filter:v1', id);
    } catch {
      // 저장이 막힌 브라우저: 이번 화면에서만
    }
  };
  // 프로젝트 칩 접기(v0.5.5 소유자 "너무 많다"): 대화·업무 탭 같이. 접으면 고른 칩만 남는다. 이 기기에 기억.
  const [chipsFolded, setChipsFoldedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('minlab-ai-office:chips-folded:v1') !== '0';
    } catch {
      return true;
    }
  });
  const setChipsFolded = (v: boolean) => {
    setChipsFoldedState(v);
    try {
      localStorage.setItem('minlab-ai-office:chips-folded:v1', v ? '1' : '0');
    } catch {
      // 저장이 막힌 브라우저: 이번 화면에서만
    }
  };
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const handoffRef = useRef<HTMLTextAreaElement>(null);

  const say = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
    // 오류는 이유를 읽을 수 있게 직접 닫을 때까지 남긴다.
    if (kind === 'ok') window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  }, []);

  // 시작: Supabase 설정이 없으면 로컬 데모 모드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = await getSupabase();
      if (cancelled) return;
      if (!sb) {
        const local = createLocalStore();
        setStore(local);
        setSnap(await local.load());
        setBooting(false);
        return;
      }
      setClient(sb);
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      sb.auth.onAuthStateChange((_e, s) => setSession(s));
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인하면 Supabase 저장소로 전환
  useEffect(() => {
    if (!client || !session) return;
    let alive = true;
    void import('./data/supabaseStore').then(({ createSupabaseStore }) => {
      if (alive) setStore(createSupabaseStore(client));
    });
    return () => {
      alive = false;
    };
  }, [client, session]);

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      setSnap(await store.load());
    } catch (e) {
      say('error', `불러오기 실패: ${(e as Error).message}`);
    }
  }, [store, say]);

  // 입력창 대화가 다른 기기에서 바뀌면 올려서 Inbox가 바로 다시 받게 한다.
  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => {
    if (!store) return;
    void reload();
    if (store.mode !== 'supabase') return;
    // 실시간: 바뀐 기록이 오면 잠깐 모았다가 한 번만 다시 읽는다(여러 표가 한꺼번에 바뀌는 경우).
    let timer: number | undefined;
    const unsubscribe = store.subscribe?.((table) => {
      if (table === 'inbox_state') {
        setInboxTick((n) => n + 1);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 400);
    });
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, unsubscribe ? POLL_WITH_REALTIME_MS : POLL_MS);
    // 휴대폰에서 앱이 뒤로 가 있으면 실시간 연결이 끊겨 그동안의 변경을 놓친다(v0.4.85, 소유자 "알림이 온 후 반영이 느린 듯").
    // 다시 화면에 나오면(알림 누름·앱 다시 열기·인터넷 다시 연결) 곧바로 다시 읽고, 알림이 오면 서비스 워커가 알려 준다.
    let last = 0;
    const wake = (force = false) => {
      if (!force && document.visibilityState !== 'visible') return;
      if (Date.now() - last < 1500) return;
      last = Date.now();
      void reload();
      setInboxTick((n) => n + 1);
    };
    const onVisible = () => wake();
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'refresh') wake(true);
      const d = e.data as { type?: string; taskId?: string } | null;
      if (d?.type === 'open-task' && d.taskId) {
        pendingTask.current = d.taskId;
        openTaskRef.current(d.taskId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', onVisible);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timer);
      unsubscribe?.();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [store, reload]);

  useEffect(() => {
    if (handoff) handoffRef.current?.select();
  }, [handoff]);

  const projectById = useMemo(() => new Map(snap.projects.map((p) => [p.id, p])), [snap.projects]);

  // 입력창 대화를 계정에 저장(Supabase 모드). 로컬 데모는 이 브라우저에만 남는다.
  const inboxSync = useMemo(
    // inboxTick이 바뀌면 새 객체가 되어 Inbox가 바로 다시 받아 온다.
    () => (store && store.mode === 'supabase' ? { load: () => store.loadInbox(), save: (st: InboxState) => store.saveInbox(st), tick: inboxTick } : undefined),
    [store, inboxTick],
  );

  const visibleTasks = useMemo(() => {
    const list = snap.tasks.filter((t) => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter && snap.projects.some((p) => p.id === projectFilter)) return false;
      if (filter === 'all') return true;
      if (filter === 'open') return t.status !== 'done';
      return t.status === filter;
    });
    return list;
  }, [snap.tasks, snap.projects, filter, projectFilter]);

  // PM 세션이 보낸 계획 옮기기(아래 planInboxRef.current). 업무 기록이 바뀔 때마다 확인한다.
  const importingInbox = useRef(false);
  const planInboxRef = useRef<(() => void) | null>(null);
  /** 업무별 마지막 자동 PR·CI 확인 시각(너무 자주 묻지 않게) */
  const autoPrAt = useRef(new Map<string, number>());
  /** 배포 승인 뒤 main 시험(CI)을 기다리는 업무(v0.4.20). 1분마다 다시 배포를 시도한다 */
  const deployWait = useRef(new Set<string>());
  const deployAt = useRef(new Map<string, number>());
  /** 자동 저장 실패를 한 번만 알리기 위한 받은 계획·결과 id */
  const inboxReported = useRef(new Set<string>());
  /** 이 기기에서 Gemini 견본을 이미 시도한 계획(업무:계획 버전) */
  const prototypeTried = useRef(new Set<string>());
  /** 분배를 이미 다시 시도한 업무:기획서 버전(Gemini 대신·다음 날 재시도, v0.5.20). 한 번만 */
  const planRetried = useRef(new Set<string>());
  const planWatchRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    planInboxRef.current?.();
    planWatchRef.current?.();
  }, [snap]);
  // 기록이 바뀌지 않아도 PR·CI 진행은 1분마다 다시 본다(화면이 보일 때만).
  // 멈춤 감지(내 차례 [!])도 시간이 지나면 다시 계산되게 1분마다 다시 그린다.
  // 휴대폰: 위 머리(이름·사용량)가 화면 밖으로 나가면 맨 위에 얇은 한 줄 머리를 고정한다(v0.4.14).
  const [mini, setMini] = useState(false);
  /** 2단계(v0.5.29 소유자): 더 내리면 사무실을 접고, 얇은 머리의 '사무실' 버튼으로 잠깐 띄워 본다 */
  const [tiny, setTiny] = useState(false);
  const [peek, setPeek] = useState(false);
  const stageRef = useRef({ mini: false, tiny: false });
  /** 얇은 머리 보이기(큰 머리가 화면 밖일 때) */
  const [barOn, setBarOn] = useState(false);
  /** 얇은 머리의 '사용량 보기'로 큰 머리 내용을 펼쳐 본다(v0.5.31 소유자) */
  const [usageOpen, setUsageOpen] = useState(false);
  /** 펼친 업무 카드(v0.4.21): 기본은 접힘(한 줄), 누르거나 다른 곳에서 업무로 오면 펼친다 */
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set());
  /** 업무 카드의 어느 칸으로 갈지(내 차례 '보기'·카드의 ?표시, v0.4.86) */
  const [jump, setJump] = useState<{ taskId: string; step: TurnStep; n: number } | null>(null);
  /** 업무 카드에서 확인 질문에 답한 것을 대화창에도 올린다(v0.4.90) */
  const [chatEcho, setChatEcho] = useState<{ n: number; taskId: string; projectId: string; text: string } | null>(null);
  /** 다른 탭에서 대화 입력칸으로 넘기는 초안 */
  const [draft, setDraft] = useState<{ text: string; n: number; taskId?: string } | null>(null);
  // 얇은 머리·작은 사무실(v0.4.14~, v0.4.35): 켜기 = 위 머리가 화면 밖으로 나갔고, 사무실이 줄어든 뒤에도
  // 페이지가 머리 높이 넘게 내려갈 수 있을 때(짧은 페이지에서 아래 빈 공간이 생기거나 깜빡이지 않게).
  // 끄기 = 맨 위에 닿았을 때만.
  const topEl = useRef<HTMLElement | null>(null);
  const checkMini = useCallback(() => {
    const top = topEl.current;
    if (!top) return;
    const set = (m: boolean, t: boolean) => {
      stageRef.current = { mini: m, tiny: t };
      setMini(m);
      setTiny(t);
      if (!t) setPeek(false);
    };
    // 얇은 머리: 내리기 시작하는 순간 그 자리에서 큰 머리가 얇은 머리로 바뀐다(머리가 화면과 같이 올라가 보이지 않게, v0.5.32 소유자).
    const bar = window.scrollY > 2;
    setBarOn(bar);
    if (!bar) setUsageOpen(false);
    const now = stageRef.current;
    if (window.scrollY <= 2) return set(false, false);
    if (top.getBoundingClientRect().bottom >= 36) return;
    const office = document.querySelector<HTMLElement>('.stage .office');
    const h = office ? office.offsetHeight : 0;
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (!now.mini) {
      if (room - h / 2 > top.offsetHeight) set(true, false);
      return;
    }
    // 2단계: 작은 사무실에서 사무실 절반 높이만큼 더 내리면 접는다. 접으면 글이 그만큼 올라오므로
    // 페이지가 충분히 길 때만 접고(바닥에서 깜빡이지 않게), 다시 올릴 때는 그보다 위에서 편다.
    const enter = top.offsetHeight + h * 0.6;
    const sticky = office?.parentElement && getComputedStyle(office.parentElement).position === 'sticky';
    if (!now.tiny && sticky && window.scrollY > enter && room - h / 2 > enter + 40) set(true, true);
    else if (now.tiny && window.scrollY < enter - h / 2) set(true, false);
  }, []);
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPeek(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peek]);
  const topRef = useCallback((el: HTMLElement | null) => {
    topEl.current = el;
  }, []);
  useEffect(() => {
    window.addEventListener('scroll', checkMini, { passive: true });
    return () => window.removeEventListener('scroll', checkMini);
  }, [checkMini]);
  // Gemini 질문 서버를 앱을 열 때·다시 볼 때 미리 깨운다(v0.4.38). 입력창을 누르자마자 보내도 깨어나기(약 2초)를 기다리지 않게.
  useEffect(() => {
    if (!store || store.mode !== 'supabase') return;
    const warm = () => {
      if (document.visibilityState === 'visible') store?.warmGemini?.();
    };
    warm();
    document.addEventListener('visibilitychange', warm);
    return () => document.removeEventListener('visibilitychange', warm);
  }, [store]);
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setMinuteTick((n) => n + 1);
      planInboxRef.current?.();
      planWatchRef.current?.();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // 결과 점수 평가(v0.4.64): 훅은 아래 이른 반환보다 위에 두고, 실제 처리(reviewTick)는 아래에서 매 렌더 새로 정한다.
  const resultReviewer = useRef(createResultReviewer());
  useEffect(() => { resultReviewer.current = createResultReviewer(); }, [store]);
  const reviewTick = useRef<() => void>(() => undefined);
  useEffect(() => {
    reviewTick.current();
  }, [snap]);

  // 훅은 아래 '일찍 끝내기' 줄보다 먼저 둔다(v0.5.82: 로그인 뒤 훅 수가 달라져 화면이 하얗게 멈추던 것)
  // 데모 주소(v0.5.91): 프로젝트 탭을 열 때 저장소 있는 프로젝트만 한 번 묻는다(실패하면 데모 버튼만 안 보임)
  const [demoUrls, setDemoUrls] = useState<Record<string, string>>({});
  const repoProjectKey = snap.projects.filter((p) => p.repo && !p.sample).map((p) => `${p.id}:${p.repo}`).join(',');
  useEffect(() => {
    if (tab !== 'projects' || !repoProjectKey || !store?.pagesUrls) return;
    let alive = true;
    void store.pagesUrls(repoProjectKey.split(',').map((x) => x.split(':')[0])).then((m) => alive && setDemoUrls(m)).catch(() => undefined);
    return () => { alive = false; };
  }, [tab, repoProjectKey, store]);
  const ciFixTried = useRef(new Set<string>());
  const handoffTried = useRef(new Set<string>());
  if (booting) return <main className="boot">오피스를 여는 중…</main>;
  if (client && !session) return <Login client={client} />;
  if (!store) return <main className="boot">업무를 불러오는 중…</main>;

  // 오늘 사용량(큰 머리와 얇은 머리의 '사용량 보기'가 같이 쓴다)
  const usageList = (
    <ul className="usage" aria-label="오늘 등록된 실행 횟수">
      {AGENTS.filter((a) => a.dailyCap !== null).map((a) => {
        const used = runsToday(snap.usage, a.id);
        const cap = a.dailyCap ?? 0;
        return (
          <li key={a.id} className={used >= cap ? 'is-full' : ''}>
            <span>{a.name}</span>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
            </span>
            <span className="num">
              {used}/{cap}
            </span>
          </li>
        );
      })}
      {store.mode === 'supabase' && (
        <li title="Gemini 무료 API를 부른 횟수와 실제 토큰(오늘, 성공만). 하루 상한은 서버가 관리합니다.">
          <span>Gemini</span>
          <span className="num">
            {(() => {
              const today = (snap.aiCalls ?? []).filter((c) => c.ok && kstDay(new Date(c.createdAt)) === kstDay());
              const tokens = today.reduce((n, c) => n + (c.tokens ?? 0), 0);
              // 실제 토큰(v0.5.50): Gemini가 알려 준 값만 더한다. 없으면 횟수만
              return tokens ? `${today.length}회 · ${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} 토큰` : `${today.length}회`;
            })()}
          </span>
        </li>
      )}
    </ul>
  );

  const mutate = async (fn: () => Promise<void>, ok?: string): Promise<boolean> => {
    try {
      await fn();
      setSnap(await store.load());
      if (ok) say('ok', ok);
      return true;
    } catch (e) {
      say('error', `저장하지 못했습니다: ${(e as Error).message}`);
      return false;
    }
  };

  /**
   * 근무·휴가 바꾸기(v0.4.49): 화면을 바로 바꾸고 저장은 뒤에서 한다(전체를 다시 읽지 않음).
   * 저장이 실패하면 화면을 되돌리고 알린다. 다른 기기에는 실시간 반영으로 간다.
   */
  const setLeaveNow = (agent: AgentId, onLeave: boolean) => {
    const apply = (on: boolean) =>
      setSnap((cur) => {
        const rest = (cur.leave ?? []).filter((a) => a !== agent);
        return { ...cur, leave: on ? [...rest, agent] : rest };
      });
    apply(onLeave);
    // 휴가(v0.4.54, 소유자): 들고 있던 열린 업무는 배정 규칙대로 대신 맡을 AI에게 넘긴다. 맡을 AI가 없으면 그대로 둔다.
    const handed: { task: Task; to: AgentId }[] = [];
    if (onLeave) {
      const nextLeave = [...(snap.leave ?? []).filter((a) => a !== agent), agent];
      for (const t of snap.tasks.filter((x) => x.assignee === agent && x.status !== 'done')) {
        const r = routeTask({ title: t.title, description: t.description, requestedType: t.type }, snap.usage, new Date(), nextLeave);
        if (r.assignee !== agent && !nextLeave.includes(r.assignee)) handed.push({ task: t, to: r.assignee });
      }
      if (handed.length) {
        const now = new Date().toISOString();
        const moved = new Map(handed.map((h) => [h.task.id, { ...h.task, assignee: h.to, routeReason: `${AGENT_BY_ID[agent].name} 휴가 → ${AGENT_BY_ID[h.to].name}`, updatedAt: now }]));
        setSnap((cur) => ({ ...cur, tasks: cur.tasks.map((t) => moved.get(t.id) ?? t) }));
        for (const t of moved.values()) void store.saveTask(t).catch((e: Error) => say('error', `'${t.title}' 넘기기를 저장하지 못했습니다: ${e.message}`));
      }
    }
    const kept = onLeave ? snap.tasks.filter((x) => x.assignee === agent && x.status !== 'done').length - handed.length : 0;
    const handedNote = handed.length
      ? ` 업무 ${handed.length}건을 넘겼어요(${[...new Set(handed.map((h) => AGENT_BY_ID[h.to].name))].join('·')}).`
      : '';
    const keptNote = kept > 0 ? ` 맡을 AI가 없는 업무 ${kept}건은 그대로예요.` : '';
    store.setLeave(agent, onLeave).then(
      () => say('ok', `${AGENT_BY_ID[agent].name}: ${onLeave ? `휴가.${handedNote}${keptNote}` : '근무로 돌아왔어요.'}`),
      (e: Error) => {
        apply(!onLeave);
        say('error', `저장하지 못했습니다: ${e.message}`);
      },
    );
  };

  /** 파일을 순서대로 올린다. 실패한 파일은 이유를 모아 돌려주고 나머지는 계속 올린다. revision: 결과 버전(결과 스크린샷) 또는 계획 버전(견본) */
  const uploadImages = async (
    taskId: string,
    kind: AttachmentKind,
    revision: number | null,
    images: Pick<PendingImage, 'file' | 'role' | 'note'>[],
    startPosition: number,
  ): Promise<string[]> => {
    const errors: string[] = [];
    for (const [i, img] of images.entries()) {
      try {
        await store.addAttachment(
          {
            id: newId(),
            taskId,
            kind,
            resultRevision: kind === 'result' ? revision : null,
            planRevision: kind === 'prototype' ? revision : null,
            position: startPosition + i,
            role: img.role,
            note: img.note.trim(),
            fileName: img.file.name,
            mime: img.file.type,
            sizeBytes: img.file.size,
            sha256: await sha256OfBytes(await img.file.arrayBuffer()),
            createdAt: new Date().toISOString(),
          },
          img.file,
        );
      } catch (e) {
        errors.push(`${img.file.name}: ${explainDbError((e as Error).message)}`);
      }
    }
    return errors;
  };

  const reportUploads = (errors: string[], count: number) => {
    if (errors.length) say('error', `파일 ${errors.length}개를 올리지 못했습니다. ${errors[0]}`);
    else if (count) say('ok', `파일 ${count}개를 ${store.mode === 'local' ? '이 브라우저에' : '비공개 저장소에'} 저장했습니다.`);
  };

  const addTask = async (d: TaskDraft, images: PendingImage[] = []): Promise<Task | null> => {
    const route = routeTask(d, snap.usage, new Date(), snap.leave ?? []);
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      projectId: d.projectId,
      title: d.title,
      description: d.description,
      type: route.type,
      requestedType: d.requestedType,
      priority: d.priority,
      assignee: route.assignee,
      routeReason: route.reason,
      status: 'queued',
      stage: 'received',
      userOriginalText: d.originalText?.trim() || [d.title, d.description.trim()].filter(Boolean).join('\n\n'),
      dispatch: { state: 'none' },
      createdAt: now,
      updatedAt: now,
    };
    if (!(await mutate(() => store.saveTask(task), `${AGENT_BY_ID[route.assignee].name}에게 배정했습니다.`))) return null;
    if (images.length) {
      const errors = await uploadImages(task.id, 'request', null, images, 0);
      setSnap(await store.load());
      reportUploads(errors, images.length);
    }
    return task;
  };

  const setStatus = (task: Task, to: TaskStatus) => {
    if (!canTransition(task, to)) return;
    const agent = AGENT_BY_ID[task.assignee];
    void mutate(async () => {
      const next = { ...task, status: to, updatedAt: new Date().toISOString() };
      // DB의 단계 값도 함께 맞춘다(예: 기획서 없는 업무를 완료 → completed).
      await store.saveTask({ ...next, stage: deriveWorkflow(next, snap.workflow).stage });
      // 수동 인계 에이전트는 사람이 실제로 맡긴 시점(진행 시작)을 실행 1회로 기록한다.
      if (to === 'in_progress' && agent.mode === 'manual') {
        await store.addManualRun({
          id: newId(),
          agent: agent.id,
          taskId: task.id,
          kind: 'manual',
          day: kstDay(),
          createdAt: new Date().toISOString(),
        });
      }
    }, `${task.title}: ${STATUS_LABEL[to]}`);
  };

  const assignTask = (task: Task, to: AgentId) => {
    const from = AGENT_BY_ID[task.assignee].name;
    const name = AGENT_BY_ID[to].name;
    // 여러 번 바꿔도 처음 배정 근거는 하나만 남긴다.
    const first = task.routeReason.replace(/^사용자가 담당을 바꿈: .*? \(처음 배정: (.*)\)$/, '$1');
    void mutate(
      () =>
        store.saveTask({
          ...task,
          assignee: to,
          routeReason: `사용자가 담당을 바꿈: ${from} → ${name} (처음 배정: ${first})`,
          updatedAt: new Date().toISOString(),
        }),
      `${task.title}: 담당을 ${name}(으)로 바꿨습니다.`,
    );
  };

  const copyHandoff = async (task: Task) => {
    const text = buildHandoff(task, projectById.get(task.projectId));
    try {
      await navigator.clipboard.writeText(text);
      setHandoff(null);
      return true;
    } catch {
      setHandoff(text);
      return false;
    }
  };

  const dispatchBlocker = (task: Task): string | null => {
    if (store.mode === 'local' || !client) return '로컬 데모에서는 실행할 수 없습니다. Supabase와 Edge Function을 연결해야 합니다.';
    const project = projectById.get(task.projectId);
    if (!project?.repo) return '프로젝트에 GitHub 저장소(owner/repo)를 먼저 입력하세요.';
    if (runsToday(snap.usage, 'claude') >= (AGENT_BY_ID.claude.dailyCap ?? 0)) return `오늘 Claude Cloud 실행 ${AGENT_BY_ID.claude.dailyCap}회를 모두 썼습니다.`;
    if (!deriveWorkflow(task, snap.workflow).aApproved) return '최신 기획서의 기획 승인이 먼저 필요합니다.';
    return null;
  };

  // DB 기록으로 단계를 다시 계산해 업무에 반영한다(캐릭터 위치도 이 값을 따른다).
  const syncStage = async (taskId: string) => {
    const now = await store.load();
    const t = now.tasks.find((x) => x.id === taskId);
    if (t) {
      const stage = deriveWorkflow(t, now.workflow).stage;
      const status = officeStatus(stage, t.status);
      if (t.stage !== stage || t.status !== status) {
        try {
          await store.saveTask({ ...t, stage, status, updatedAt: new Date().toISOString() });
        } catch {
          // 전송 중에는 상태를 바꿀 수 없다(DB 규칙). 다음 새로고침 때 다시 맞춘다.
        }
      }
    }
    setSnap(await store.load());
  };

  const step = async (taskId: string, fn: () => Promise<void>, ok?: string): Promise<boolean> => {
    try {
      await fn();
      await syncStage(taskId);
      if (ok) say('ok', ok);
      return true;
    } catch (e) {
      say('error', explainDbError((e as Error).message));
      return false;
    }
  };

  const nextRevision = (list: { taskId: string }[], taskId: string, key: (x: never) => number) =>
    Math.max(0, ...list.filter((x) => x.taskId === taskId).map((x) => key(x as never))) + 1;

  /**
   * Gemini 기획서 초안(무료, 서버 저장). 최신 기록으로 ChatGPT용과 같은 기획 요청 문서를 만들어 보낸다.
   * A에서 수정 요청이 있었으면 그 내용도 함께 들어간다. 소유자 결정(2026-10-30): 사용자는 질문·승인·검토·수정 요청만 한다.
   */
  const draftSpec = async (taskId: string): Promise<boolean> => {
    if (store.mode !== 'supabase') return false;
    let now = await store.load();
    const task = now.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    let view = deriveWorkflow(task, now.workflow);
    if (view.aApproved) return false;
    // 사진은 Gemini가 먼저 보고(무료, 아직 분석 안 한 것만·3장까지) 그 내용을 초안에 넣는다(소유자 승인 2026-10-31).
    const unseen = attachmentsOf(now.workflow.attachments, task.id, 'request')
      .filter((a) => isRaster(a.mime) && !now.workflow.imageAnalyses.some((x) => x.attachmentId === a.id))
      .slice(0, 3);
    if (unseen.length) {
      say('ok', `Gemini가 사진 ${unseen.length}장을 먼저 보고 있어요(무료).`);
      for (const a of unseen) {
        try {
          await store.analyzeImage(a.id);
        } catch {
          // 분석이 안 되면 사진 이름·역할만으로 초안을 쓴다.
        }
      }
      now = await store.load();
      view = deriveWorkflow(task, now.workflow);
    }
    const text = buildGptPackage(
      task,
      now.projects.find((p) => p.id === task.projectId),
      view.spec && view.plannerFeedback ? { spec: view.spec, feedback: view.plannerFeedback } : null,
      attachmentsOf(now.workflow.attachments, task.id, 'request'),
      linksOf(now.workflow.links, task.id),
      clarificationsOf(now.workflow.clarifications, task.id),
      now.workflow.imageAnalyses.filter((a) => a.taskId === task.id),
    );
    say('ok', `Gemini가 '${task.title}' 기획서 초안을 쓰고 있어요(무료).`);
    return step(task.id, async () => {
      const r = await store.draftSpec(task.id, text);
      say('ok', r.intent === 'ambiguous' ? `Gemini가 확인 질문을 남겼어요(v${r.revision}). 업무 카드에서 답을 적고 초안을 다시 만드세요.` : `Gemini 기획서 초안 v${r.revision}을 저장했어요. 보고 기획 승인하거나 수정 요청하세요.`);
    });
  };

  /** PM 계획 글을 검증해 계획·배정으로 저장한다. 손으로 붙여넣기와 PM 세션 자동 전송이 같은 규칙을 쓴다. 문제가 있으면 이유 목록. */
  // 시작이 한도(사용량·요청 수) 때문에 실패하면 작업을 '한도 대기'로 표시해 업무 카드에서 다른 AI로 넘길 수 있게 한다(v0.5.73).
  const markQuota = async (a: AgentAssignment, message: string) => {
    if (!quotaHit({ dispatchStatus: a.dispatchStatus, actualProviderStatus: message })) return;
    await store.updateAssignment({ ...a, dispatchStatus: 'blocked_quota', actualProviderStatus: message.slice(0, 200) }).catch(() => undefined);
  };
  const importPlanText = async (task: Task, text: string, source: PmPlan['source'], data: Snapshot, expectedSpecRevision?: number): Promise<string[] | null> => {
    const prepared = preparePlanImport(task, text, source, data, expectedSpecRevision);
    if (prepared.errors) return prepared.errors;
    if (prepared.existing) return null;
    const { plan, assignments } = prepared;
    const planRevision = plan.planRevision;
    const saved = await step(task.id, () => store.addPlan(plan, assignments), `PM 계획 v${planRevision}을 저장했습니다.`);
    return saved ? null : ['저장하지 못했습니다. 위쪽 알림의 이유를 확인하세요.'];
  };

  // 분배가 멈춘 업무 살리기(v0.5.20): Claude PM에 보냈는데 3시간 넘게 계획이 없으면 Gemini가 대신 나누고,
  // 하루 한도로 못 보낸 업무는 다음 날(한국 시간) PM에 한 번 다시 보낸다. 업무·기획서 버전마다 한 번만.
  planWatchRef.current = () => {
    if (store.mode !== 'supabase') return;
    const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const today = kstDay(new Date().toISOString());
    for (const task of snap.tasks) {
      if (task.status === 'done' || !task.dispatch.at) continue;
      const view = deriveWorkflow(task, snap.workflow);
      if (!view.spec || !view.aApproved || snap.workflow.plans.some((p) => p.taskId === task.id && p.approvedSpecRevision === view.spec!.revision)) continue;
      const key = `${task.id}:${view.spec.revision}`;
      if (planRetried.current.has(key)) continue;
      const age = Date.now() - new Date(task.dispatch.at).getTime();
      if (task.dispatch.state === 'dispatched' && age > 3 * 3600_000) {
        planRetried.current.add(key);
        void geminiPlan(task, 'Claude PM이 3시간 넘게 계획을 안 보내서');
      } else if (task.dispatch.state === 'failed' && /모두 썼습니다|HTTP 429|한도/.test(task.dispatch.error ?? '') && kstDay(task.dispatch.at) < today) {
        planRetried.current.add(key);
        void planTask(task, true, { skipSmall: true });
      }
    }
  };

  // PM 세션이 보낸 계획(pm_plan_inbox)을 자동으로 옮긴다(v0.4.2). 먼저 처리함으로 표시한 기기만 저장한다(중복 방지).
  // 훅은 위(첫 return 전)에 있고, 여기서는 매번 최신 snap을 쓰는 함수만 바꿔 끼운다.
  planInboxRef.current = () => {
    if (store.mode !== 'supabase' || importingInbox.current) return;
    importingInbox.current = true;
    void (async () => {
      try {
        await receiveWorkflowInbox({ store, snap, reported: inboxReported.current, importPlanText, step, say });
        // 견본 먼저 계획이 들어왔는데 견본이 없으면 Gemini가 한 번 만든다(계획 버전마다 한 번, v0.4.7).
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.plan || !v.prototypeFirst || v.pApproved || v.prototypeCount > 0 || t.status === 'done') continue;
          const key = `${t.id}:${v.plan.planRevision}`;
          if (prototypeTried.current.has(key)) continue;
          prototypeTried.current.add(key);
          await makePrototype(t.id);
        }
        // 올리기 승인(B) 뒤 PR·CI를 자동으로 확인한다(v0.4.5). 결과가 정해지면(성공·실패·닫힘) 멈춘다. 손으로 다시 확인하는 버튼은 그대로.
        let checked = false;
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.bApproved || v.cApproved) continue;
          if (!t.prUrl && !(v.result?.source === 'claude_session_auto' || v.result?.source === 'claude_manual' || v.result?.source === 'gemini_actions_auto')) continue;
          // 작업 브랜치를 못 올린 Gemini 결과는 PR이 생길 수 없다(v0.5.74: 1분마다 409가 쌓이던 것)
          if (!t.prUrl && resultWithoutBranch(v.result)) continue;
          const c = latestPrCheck(t, snap.workflow);
          if (c && (c.ciState === 'success' || c.ciState === 'failure' || c.prState === 'closed')) continue;
          if (Date.now() - (autoPrAt.current.get(t.id) ?? 0) < 60_000) continue;
          autoPrAt.current.set(t.id, Date.now());
          try {
            await store.checkPr(t.id);
            checked = true;
          } catch {
            // 아직 PR이 열리지 않음 등: 다음 확인 때 다시 본다.
          }
        }
        if (checked) setSnap(await store.load());
        // 한도에 걸린 작업은 다음 AI로 넘기는 새 계획을 자동으로 만든다(v0.5.81, 작업마다 한 번). 실행 승인(E)은 소유자가 한다.
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.plan || !v.spec || t.status === 'done') continue;
          for (const a of v.assignments) {
            if (a.dispatchStatus !== 'blocked_quota' || handoffTried.current.has(a.id)) continue;
            handoffTried.current.add(a.id);
            const repo = (snap.projects.find((p) => p.id === t.projectId)?.repo ?? '').toLowerCase();
            const away = new Set(snap.leave ?? []);
            const to = nextAgent(a.assignee, { claude: away.has('claude'), codex: away.has('codex'), gemini: away.has('studioA') && away.has('studioB') }, OFFICE_REPOS.includes(repo));
            if (!to) continue;
            const failed = await importPlanText(t, reassignPlanText(v.plan, a.workItemId, to, `${a.assignee} 한도`), 'manual', snap, v.spec.revision);
            if (!failed) say('ok', `[${t.title}] ${a.workItemId}이 한도에 걸려 ${PREF_LABEL[to as keyof typeof PREF_LABEL]}에게 넘기는 계획을 만들었어요. 실행 승인하면 이어서 해요.`);
            break;
          }
        }
        // CI(PR 검사)가 실패하면 같은 AI에게 다시 맡기는 새 계획을 자동으로 만든다(v0.5.75, 커밋마다 한 번). 실행 승인(E)은 소유자가 한다.
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.bApproved || v.cApproved || !v.plan || !v.spec || !v.result) continue;
          const c = latestPrCheck(t, snap.workflow);
          if (!c || c.ciState !== 'failure' || c.prState === 'closed') continue;
          if (snap.workflow.plans.some((p) => p.taskId === t.id && ciFixDone(p.plan.mode_reason, c.headSha))) continue;
          const a = v.assignments.find((x) => x.workItemId === v.result!.workItemId);
          if (!a || ciFixTried.current.has(`${t.id}:${c.headSha}`)) continue;
          ciFixTried.current.add(`${t.id}:${c.headSha}`);
          const failed = await importPlanText(t, reassignPlanText(v.plan, a.workItemId, prefOf(a.assignee), ciFixWhy(c)), 'manual', snap, v.spec.revision);
          if (!failed) say('ok', `[${t.title}] PR 검사가 실패해서 같은 AI에게 다시 맡기는 계획을 만들었어요. 업무 카드에서 실행 승인하면 고치기 시작해요.`);
        }
        // 배포 승인 뒤 배포가 안 끝난 업무: main 시험을 기다리는 중이면 1분마다, 앱을 다시 열었는데 배포 기록이 없으면(승인 24시간 이내) 한 번 더 시도한다(v0.4.20).
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.cApproved || !t.prUrl) continue;
          const d = latestDeployment(t, snap.workflow);
          if (d?.ok) continue;
          const waiting = deployWait.current.has(t.id);
          if (!waiting) {
            const c = snap.workflow.approvals.find((a) => a.taskId === t.id && a.gate === 'C' && a.decision === 'approved' && a.approvedRevision === v.result?.revision);
            if (d || !c || Date.now() - Date.parse(c.createdAt) > 24 * 3600_000) continue;
          }
          if (Date.now() - (deployAt.current.get(t.id) ?? 0) < 60_000) continue;
          deployAt.current.set(t.id, Date.now());
          await workflowActions.deploy?.(t, false, true);
        }
      } finally {
        importingInbox.current = false;
      }
    })();
  };

  /** 입력창 알림·내 차례 목록에서 바로 하는 기획·올리기 승인. 업무 카드의 버튼과 같은 규칙(canApprove)을 지난다. */
  const quickApprove = async (task: Task, gate: 'A' | 'B'): Promise<boolean> => {
    const view = deriveWorkflow(task, snap.workflow);
    if (!canApprove(view, gate).ok) return false;
    if (gate === 'A') return view.spec ? workflowActions.decide(task, 'A', view.spec.revision, 'approved') : false;
    return view.result ? workflowActions.decide(task, 'B', view.result.revision, 'approved', '', { result_sha256: view.result.sha256 }) : false;
  };
  const turns = myTurns(snap.tasks, snap.workflow);

  /** 업무 카드로 이동(입력창 알림·사무실 말풍선). 지금 필터에 없으면 '전체'로 바꾼다. */
  const showTask = (id: string, step?: TurnStep) => {
    setTab('tasks');
    setOpenCards((cur) => new Set(cur).add(id));
    // 그 일을 하는 칸까지 바로 내려간다(v0.4.86): 업무 카드가 펼쳐진 뒤 진행 단계 패널이 그 칸을 펼치고 보여 준다.
    if (step) setJump((j) => ({ taskId: id, step, n: (j?.n ?? 0) + 1 }));
    // 사무실에서 그 업무 담당 AI를 같이 표시한다(사무실 ↔ 목록 연결).
    const owner = snap.tasks.find((x) => x.id === id)?.assignee;
    if (owner) setSelected(owner);
    if (!visibleTasks.some((t) => t.id === id)) {
      setFilter('all');
      const t = snap.tasks.find((x) => x.id === id);
      if (t && projectFilter !== 'all' && t.projectId !== projectFilter) setProjectFilter('all');
    }
    if (!step) window.setTimeout(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  openTaskRef.current = (id) => {
    if (!snap.tasks.some((t) => t.id === id)) return;
    pendingTask.current = null;
    showTask(id);
    if (typeof history !== 'undefined' && location.search.includes('task=')) history.replaceState(null, '', location.pathname);
  };
  if (pendingTask.current && snap.tasks.some((t) => t.id === pendingTask.current)) {
    const id = pendingTask.current;
    pendingTask.current = null;
    window.setTimeout(() => openTaskRef.current(id), 0);
  }

  /**
   * Gemini 견본(무료, v0.4.7): 견본 먼저 계획이면 견본 지시서로 HTML 견본 한 장을 만들어 견본으로 올린다.
   * 사용자는 미리보기를 보고 견본 승인(P)만 한다. AI Studio 수동 견본도 그대로 올릴 수 있다.
   */
  const makePrototype = async (taskId: string): Promise<boolean> => {
    if (store.mode !== 'supabase') return false;
    const now = await store.load();
    const task = now.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    const view = deriveWorkflow(task, now.workflow);
    if (!view.plan || !view.spec || !view.prototypeFirst || view.pApproved || view.prototypeCount > 0) return false;
    const item = view.plan.plan.work_items.find((w) => w.assignee_preference === 'gemini_optional') ?? view.plan.plan.work_items[0];
    if (!item) return false;
    const text = [
      '아래는 AI Studio Build용 견본 지시서다. 너는 같은 내용을 HTML 파일 한 장(HTML·CSS만)으로 만든다. 지시서의 React·ZIP 관련 문장은 무시한다.',
      '',
      buildPrototypeHandoff(
        task,
        view.spec,
        item,
        now.projects.find((p) => p.id === task.projectId),
        view.plan.plan.mode_reason ?? '',
        attachmentsOf(now.workflow.attachments, task.id, 'request'),
        linksOf(now.workflow.links, task.id),
      ),
    ].join('\n');
    say('ok', `Gemini가 '${task.title}' 견본을 만들고 있어요(무료, HTML 한 장).`);
    try {
      const r = await store.draftPrototype(task.id, text);
      // v0.4.94: Studio A·B가 하나씩 만든 견본을 둘 다 올리고, 사장님이 보고 하나를 고른다.
      const files = r.drafts.map((d) => ({
        file: new File([d.html], `견본-${d.slot}-v${r.planRevision}.html`, { type: 'text/html' }),
        role: 'prototype' as const,
        note: `Studio ${d.slot} 견본(Gemini 자동, HTML)`,
      }));
      const errors = await uploadImages(task.id, 'prototype', r.planRevision, files, 0);
      setSnap(await store.load());
      if (errors.length) {
        say('error', `견본을 올리지 못했습니다: ${errors[0]}`);
        return false;
      }
      say('ok', r.drafts.length > 1 ? '견본 두 장(Studio A·B)이 올라왔어요. 업무 카드의 4-1에서 둘을 보고 하나를 고르세요.' : '견본이 올라왔어요. 업무 카드의 4-1에서 미리보기를 보고 견본 승인(P)하세요.');
      return true;
    } catch (e) {
      say('error', `Gemini 견본을 만들지 못했습니다: ${(e as Error).message}`);
      return false;
    }
  };

  const workflowActions: WorkflowActions = {
    archify: store.archify ? (taskId, revision) => store.archify!(taskId, revision) : undefined,
    // 담당 바꾸기·한도 넘기기(v0.5.73): 지금 계획에서 그 작업 담당만 바꾼 새 계획 버전을 만든다. 실행 승인(E)은 다시 받는다.
    reassign: async (task, a, to, why) => {
      const data = await store.load();
      const view = deriveWorkflow(task, data.workflow);
      if (!view.plan || !view.spec) {
        say('error', '계획이 없어서 담당을 바꿀 수 없어요.');
        return false;
      }
      const failed = await importPlanText(task, reassignPlanText(view.plan, a.workItemId, to, why), 'manual', data, view.spec.revision);
      if (failed) {
        say('error', `담당을 바꾸지 못했어요: ${failed.join(' / ')}`);
        return false;
      }
      say('ok', `${a.workItemId} 담당을 ${PREF_LABEL[to as keyof typeof PREF_LABEL] ?? to}(으)로 바꾼 새 계획을 만들었어요. 실행 승인하면 시작해요.`);
      return true;
    },
    designCheck: store.designCheck,
    draftSpec: (task) => draftSpec(task.id),
    makePrototype: (task) => makePrototype(task.id),
    // step은 성공 여부(boolean)를 돌려주지만 패널은 완료만 기다린다.
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        setHandoff(null);
        return true;
      } catch {
        setHandoff(text);
        return false;
      }
    },
    saveSpec: (task, f) =>
      step(
        task.id,
        () =>
          store.addSpec({
            id: newId(),
            taskId: task.id,
            revision: nextRevision(snap.workflow.specs, task.id, (x: { revision: number }) => x.revision),
            intent: f.intent,
            planner: 'chatgpt_manual',
            userOriginalText: task.userOriginalText ?? [task.title, task.description].filter(Boolean).join('\n\n'),
            finalPrompt: f.finalPrompt,
            changeScope: f.changeScope,
            preserveConstraints: f.preserveConstraints,
            testCriteria: f.testCriteria,
            answer: f.answer,
            createdAt: new Date().toISOString(),
          }),
        '기획서 새 버전을 저장했습니다.',
      ),
    decide: async (task, gate, revision, decision, workItemId = '', scope = {}) => {
      const ok = await step(
        task.id,
        async () => {
          const previous = snap.workflow.approvals
            .filter((a) => a.taskId === task.id && a.gate === gate && a.decision === 'approved')
            .reduce<number | null>((m, a) => (m === null || a.approvedRevision > m ? a.approvedRevision : m), null);
          const approval: Approval = {
            id: newId(),
            taskId: task.id,
            gate,
            decision,
            approvedRevision: revision,
            previousRevision: previous,
            workItemId,
            scope,
            actor: session?.user.email ?? '로컬 데모',
            createdAt: new Date().toISOString(),
          };
          await store.addApproval(approval);
          if (gate === 'E' && decision === 'approved') {
            const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.planRevision === revision && x.workItemId === workItemId);
            if (a) await store.updateAssignment({ ...a, dispatchStatus: 'ready' });
          }
        },
        decision !== 'approved'
          ? '수정 요청을 기록했습니다. ChatGPT용 자료를 다시 복사해 재기획하세요.'
          : gate === 'C'
            ? '배포 승인을 기록했습니다. 끝난 업무는 열린 업무 목록에서 빠지고 "완료" 필터에 남습니다.'
            : `${gate} 승인을 기록했습니다.`,
      );
      // 소유자 승인(2026-10-31): 실행 승인(E) → Claude 작업 자동 시작, 올리기 승인(B) → Claude 결과면 Claude가 PR을 연다.
      if (ok && decision === 'approved' && store.mode === 'supabase') {
        if (gate === 'E') {
          const a = snap.workflow.assignments.find((x) => x.taskId === task.id && x.planRevision === revision && x.workItemId === workItemId);
          if (a?.assignee === 'claude') await workflowActions.startClaudeDev?.(a, false);
          // Gemini 개발(v0.4.82): 실행 승인 → 서버가 GitHub Actions 워크플로 시작
          if (a?.assignee === 'gemini' && a.executionMode === 'gemini_actions') await workflowActions.startGeminiDev?.(a, false);
        }
        if (gate === 'B') {
          const r = snap.workflow.results.find((x) => x.taskId === task.id && x.revision === revision);
          // Gemini 개발 결과(v0.4.82): 작업 브랜치가 이미 올라가 있어 GitHub에서 PR만 만들면 된다(병합은 배포 승인 뒤 서버가).
          const repo = projectById.get(task.projectId)?.repo;
          if (r?.source === 'gemini_actions_auto' && repo) {
            // v0.5.85(소유자 "이거 자동 안돼?"): Gemini 결과도 PR을 자동으로 연다(GitHub Actions). 안 되면 직접 여는 주소를 알려 준다.
            const branch = codexBranch(task, r.workItemId, 'gemini');
            try {
              await store.openPr?.(task.id);
              say('ok', `올리기 승인했어요. ${branch} 브랜치로 PR을 자동으로 여는 중이에요(1분 안팎, 병합 안 함). PR이 생기면 CI를 자동으로 확인합니다.`);
            } catch (e) {
              say('error', `PR 자동 열기 실패: ${(e as Error).message} — 직접 열기: https://github.com/${repo}/compare/main...${branch}?expand=1`);
            }
          }
          if (r && (r.source === 'claude_session_auto' || r.source === 'claude_manual')) {
            try {
              const sent = await store.dispatchClaudePr(task.id, false);
              say('ok', `Claude가 ${sent.branch} 브랜치로 PR을 여는 중입니다(병합 안 함). PR이 열리면 CI를 자동으로 확인합니다.`);
            } catch (e) {
              say('error', `Claude PR 자동 요청 실패: ${(e as Error).message}`);
            } finally {
              setSnap(await store.load());
            }
          }
        }
      }
      // 소유자 결정(2026-10-30): 배포 승인 = 배포. 승인 뒤 바로 서버가 병합·release 앞당기기를 한다(v0.4.20).
      if (ok && gate === 'C' && decision === 'approved' && store.mode === 'supabase') await workflowActions.deploy?.(task);
      // 소유자 결정(2026-10-30): 기획 승인 한 번이면 PM 전송까지, Gemini 초안에 수정 요청하면 Gemini가 다시 쓴다.
      if (ok && gate === 'A' && store.mode === 'supabase') {
        const spec = snap.workflow.specs.find((x) => x.taskId === task.id && x.revision === revision);
        if (decision === 'approved' && projectById.get(task.projectId)?.repo) await planTask(task, false);
        if (decision === 'rejected' && spec?.planner === 'gemini_draft') await draftSpec(task.id);
      }
      return ok;
    },
    approvePrototype: (task) =>
      step(
        task.id,
        async () => {
          const view = deriveWorkflow(task, snap.workflow);
          if (!view.plan) throw new Error('P must approve the latest plan revision');
          const rev = view.plan.planRevision;
          const approval = (gate: 'P' | 'E', workItemId: string, scope: Record<string, unknown>): Approval => ({
            id: newId(),
            taskId: task.id,
            gate,
            decision: 'approved',
            approvedRevision: rev,
            previousRevision: null,
            workItemId,
            scope,
            actor: session?.user.email ?? '로컬 데모',
            createdAt: new Date().toISOString(),
          });
          await store.addApproval(approval('P', '', { prototypes: view.prototypeCount, plan_revision: rev }));
          // 견본 작업(AI Studio·Gemini)은 견본 승인으로 끝난 것으로 기록한다. 그래야 그 뒤에 잇는 Codex 작업을 시작할 수 있다.
          for (const a of view.assignments.filter((x) => x.assignee === 'gemini' && x.dispatchStatus !== 'completed')) {
            if (!view.eApproved(a.workItemId)) await store.addApproval(approval('E', a.workItemId, { assignee: 'gemini', mode: 'manual_handoff', with: 'P 견본 승인' }));
            await store.updateAssignment({ ...a, dispatchStatus: 'completed' });
          }
        },
        '견본 승인을 기록했습니다. 이제 Codex 작업을 실행 승인하세요. Codex 지시서에 승인된 견본이 들어갑니다.',
      ),
    dispatchPm: async (task, ack) => {
      await dispatch(task, ack);
    },
    replanByPm: (task) => planTask(task, false, { skipSmall: true }),
    importPlan: (task, text) => importPlanText(task, text, task.dispatch.sessionUrl ? 'routine_session_manual_import' : 'manual', snap),
    recordStart: (a, url) =>
      step(
        a.taskId,
        async () => {
          await store.updateAssignment({
            ...a,
            dispatchStatus: 'started',
            statusSource: 'user_reported',
            providerTaskUrl: url.trim() || null,
            actualProviderStatus: 'user_reported_started',
            startedAt: new Date().toISOString(),
          });
          if (AGENT_BY_ID[a.assignee === 'gemini' ? 'studioA' : a.assignee].mode === 'manual') {
            await store.addManualRun({ id: newId(), agent: a.assignee === 'gemini' ? 'studioA' : a.assignee, taskId: a.taskId, kind: 'manual', day: kstDay(), createdAt: new Date().toISOString() });
          }
        },
        '직접 시작했다고 기록했습니다.',
      ),
    stopAssignment: (a) =>
      step(
        a.taskId,
        () => store.updateAssignment({ ...a, dispatchStatus: 'failed', actualProviderStatus: 'user_stopped' }),
        `${a.workItemId} 작업을 중단으로 기록했습니다. 다른 작업을 시작할 수 있습니다.`,
      ),
    addResult: async (task, f, images = []) => {
      const revision = nextRevision(snap.workflow.results, task.id, (x: { revision: number }) => x.revision);
      const ok = await step(
        task.id,
        async () => {
          const assignment = snap.workflow.assignments.find((a) => a.taskId === task.id && a.workItemId === f.workItemId);
          const view = deriveWorkflow(task, snap.workflow);
          await store.addResult({
            id: newId(),
            taskId: task.id,
            revision,
            planRevision: view.plan?.planRevision ?? null,
            workItemId: f.workItemId,
            source: assignment?.assignee === 'codex' ? 'codex_cloud_manual' : assignment?.assignee === 'claude' ? 'claude_manual' : 'manual',
            // 시험 기록·요약의 토큰·키처럼 생긴 글자는 저장 전에 가린다(v0.5.49)
            summary: maskSecrets(f.summary),
            diff: f.diff,
            testLog: maskSecrets(f.testLog),
            remainingIssues: maskSecrets(f.remainingIssues),
            sha256: await sha256Hex(`${f.diff}\n---\n${maskSecrets(f.testLog)}`),
            createdAt: new Date().toISOString(),
          });
        },
        '결과 패키지를 저장했습니다. GitHub에는 아직 올라가지 않았습니다.',
      );
      // 결과를 받은 작업은 끝난 것으로 기록한다(동시 실행 1개 제한이 풀린다).
      // 작업을 고르지 않고 '전체'로 등록하면 이 업무의 시작된 작업을 모두 끝낸다.
      const done = snap.workflow.assignments.filter(
        // 'ready'(실행 승인 뒤 손으로 넘긴 Codex 작업 등)도 결과를 받으면 끝난 것으로(v0.4.20: 안 끝난 작업이 있으면 올리기 승인이 막히므로)
        (a) =>
          a.taskId === task.id &&
          (f.workItemId === '' || a.workItemId === f.workItemId) &&
          (a.dispatchStatus === 'started' || a.dispatchStatus === 'starting' || (a.dispatchStatus === 'ready' && f.workItemId !== '')),
      );
      if (ok && done.length) {
        try {
          for (const a of done) await store.updateAssignment({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'user_reported_result' });
          setSnap(await store.load());
        } catch {
          // 완료 기록 실패는 결과 저장과 별개다. 작업 카드에서 다시 시도할 수 있다.
        }
      }
      if (ok && images.length) {
        const errors = await uploadImages(task.id, 'result', revision, images, 0);
        setSnap(await store.load());
        reportUploads(errors, images.length);
      }
      return ok;
    },
    readLink: async (task, url) => {
      try {
        const link = await store.readLink(task.id, url.trim());
        setSnap(await store.load());
        const okText = link.status === 'ok' ? '링크를 읽었습니다.' : link.status === 'partial' ? `링크를 일부만 읽었습니다. ${link.error}` : link.status === 'blocked' ? `링크를 차단했습니다: ${link.error}` : `링크를 읽지 못했습니다: ${link.error}`;
        say(link.status === 'ok' || link.status === 'partial' ? 'ok' : 'error', okText);
        return true;
      } catch (e) {
        say('error', explainDbError((e as Error).message));
        return false;
      }
    },
    deleteLink: (l) => step(l.taskId, () => store.deleteLink(l), '링크를 지웠습니다.'),
    addClarification: async (task, question, answer) => {
      const latest = snap.workflow.specs.filter((x) => x.taskId === task.id).sort((a, b) => b.revision - a.revision)[0];
      const ok = await step(
        task.id,
        () =>
          store.addClarification({
            id: newId(),
            taskId: task.id,
            specRevision: Math.max(0, ...snap.workflow.specs.filter((x) => x.taskId === task.id).map((x) => x.revision)),
            question: question.trim(),
            answer: answer.trim(),
            createdAt: new Date().toISOString(),
          }),
        '확인 질문·답변을 기록했습니다. 기획 자료에 함께 들어갑니다.',
      );
      // Gemini 초안이 확인 질문을 남겼으면, 답을 받은 즉시 Gemini가 다시 쓴다(사용자는 답만 한다).
      if (ok && latest?.planner === 'gemini_draft' && latest.intent === 'ambiguous') await draftSpec(task.id);
      return ok;
    },
    echoAnswer: (task, text) => setChatEcho((e) => ({ n: (e?.n ?? 0) + 1, taskId: task.id, projectId: task.projectId, text })),
    attachmentUrl: (a) => store.attachmentUrl(a),
    analyzeImage:
      store.mode === 'supabase'
        ? async (a) => {
            try {
              await store.analyzeImage(a.id);
              setSnap(await store.load());
              say('ok', `${a.fileName}을(를) 분석했습니다. 진행 단계 1번에서 "Gemini 분석 보기"를 여세요.`);
              return true;
            } catch (e) {
              say('error', `이미지를 분석하지 못했습니다: ${(e as Error).message}`);
              return false;
            }
          }
        : undefined,
    addAttachments: async (task, kind, resultRevision, files) => {
      const existing = attachmentsOf(snap.workflow.attachments, task.id, kind, resultRevision);
      const errors = await uploadImages(
        task.id,
        kind,
        resultRevision,
        files.map((file, i) => ({
          file,
          note: '',
          role: kind === 'prototype' ? 'prototype' : kind === 'result' ? 'after' : !isImage(file.type) ? 'document' : existing.length + i === 0 ? 'current' : 'target',
        })),
        existing.length ? Math.max(...existing.map((a) => a.position)) + 1 : 0,
      );
      setSnap(await store.load());
      reportUploads(errors, files.length);
      return errors;
    },
    updateAttachment: (a) => step(a.taskId, () => store.updateAttachment(a)),
    // v0.4.94: 두 견본 중 하나를 고르면 나머지는 지우고 견본 승인(P)한다(Codex 지시서에는 고른 견본만 들어간다).
    pickPrototype: async (task, keep) => {
      const others = attachmentsOf(snap.workflow.attachments, task.id, 'prototype', keep.planRevision ?? null).filter((x) => x.id !== keep.id);
      const ok = await step(
        task.id,
        async () => {
          for (const o of others) await store.deleteAttachment(o);
        },
        `${keep.note.split('(')[0].trim() || keep.fileName}을(를) 골랐어요.`,
      );
      if (ok) await workflowActions.approvePrototype(task);
    },
    deleteAttachment: (a) => step(a.taskId, () => store.deleteAttachment(a), `${a.fileName}을(를) 지웠습니다.`),
    moveAttachment: (task, id, delta) =>
      step(task.id, async () => {
        // 옮기는 첨부와 같은 묶음(요청 자료 또는 같은 계획의 견본) 안에서 순서를 바꾼다.
        const target = snap.workflow.attachments.find((x) => x.id === id);
        const list =
          target?.kind === 'prototype'
            ? attachmentsOf(snap.workflow.attachments, task.id, 'prototype', target.planRevision ?? null)
            : attachmentsOf(snap.workflow.attachments, task.id, 'request');
        const next = moved(list, id, delta);
        for (const a of next) {
          if (list.find((x) => x.id === a.id)?.position !== a.position) await store.updateAttachment(a);
        }
      }),
    setPrUrl: (task, url) => step(task.id, () => store.saveTask({ ...task, prUrl: url.trim().replace(/\/$/, '') }), 'PR 주소를 기록했습니다.'),
    checkPr:
      store.mode === 'supabase'
        ? async (task) => {
            try {
              const c = await store.checkPr(task.id);
              setSnap(await store.load());
              const ok = prCheckPasses(c);
              say(ok ? 'ok' : 'error', ok ? `CI 성공을 확인했습니다(${c.merged ? '병합됨' : '병합 전 — 배포 승인 때 서버가 병합'}). 배포 승인을 할 수 있습니다.` : `아직 배포 승인을 할 수 없습니다: CI ${c.ciState === 'pending' ? '진행 중' : c.ciState === 'failure' ? '실패' : c.ciState === 'none' ? '없음' : '성공'}${c.prState === 'closed' && !c.merged ? ', PR이 병합 없이 닫힘' : ''}`);
              return true;
            } catch (e) {
              say('error', `PR을 확인하지 못했습니다: ${(e as Error).message}`);
              return false;
            }
          }
        : undefined,
    startClaudeDev:
      store.mode === 'supabase'
        ? async (a, ack) => {
            try {
              const r = await store.startClaudeDev(a.id, ack);
              say('ok', `Claude 보조 개발 세션을 시작했습니다(완료 아님).${r.sessionUrl ? ' 세션에서 진행을 보고, 마지막 결과 보고를 결과 패키지로 옮기세요.' : ''}`);
              return true;
            } catch (e) {
              say('error', `Claude 보조 개발을 시작하지 못했습니다: ${(e as Error).message}`);
              await markQuota(a, (e as Error).message);
              return false;
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    startCodexLinear:
      store.mode === 'supabase'
        ? async (a, ack, text) => {
            try {
              const r = await store.startCodexLinear(a.id, ack, text);
              say('ok', `Codex에 맡겼어요(Linear ${r.identifier}, 완료 아님). Codex 소식은 업무 카드에 자동으로 들어와요.`);
              return true;
            } catch (e) {
              say('error', `Codex(Linear)에 맡기지 못했어요: ${(e as Error).message} — 지시서 복사로 진행할 수 있어요.`);
              await markQuota(a, (e as Error).message);
              return false;
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    // Codex 소식은 Linear 웹훅이 서버로 바로 보낸다(v0.5.3). 웹훅이 안 오면 손으로 다시 읽는다(읽기만).
    refreshCodex:
      store.mode === 'supabase'
        ? async (a) => {
            try {
              const n = await store.codexLinearStatus(a.id);
              say(n.kind === 'error' ? 'error' : 'ok', n.kind === 'none' ? '아직 Codex 소식이 없어요.' : `Codex 소식: ${n.last}`);
            } catch (e) {
              say('error', `Codex 소식을 읽지 못했어요: ${(e as Error).message}`);
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    startGeminiDev:
      store.mode === 'supabase'
        ? async (a, ack) => {
            try {
              const r = await store.startGeminiDev(a.id, ack);
              say('ok', `Gemini 개발을 시작했습니다(키 ${r.key || '?'}, 완료 아님). GitHub Actions에서 고치고 시험한 뒤 결과를 자동으로 보냅니다.`);
              return true;
            } catch (e) {
              say('error', `Gemini 개발을 시작하지 못했습니다: ${(e as Error).message}`);
              await markQuota(a, (e as Error).message);
              return false;
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    deploy:
      store.mode === 'supabase'
        ? async (task, allowExtra = false, quiet = false) => {
            try {
              const r = await store.deployRelease(task.id, allowExtra);
              if (r.wait) {
                // 처음 한 번만 알리고, 그 뒤 자동 재시도는 조용히
                if (!quiet && !deployWait.current.has(task.id)) say('ok', `배포 대기: ${r.message || 'main 시험(CI)이 끝나면 자동으로 배포해요.'}`);
                deployWait.current.add(task.id);
                return true;
              }
              deployWait.current.delete(task.id);
              say('ok', r.updated ? `운영 배포를 시작했습니다: release를 ${r.to.slice(0, 7)}로 앞당겼습니다. Cloudflare 빌드가 끝나면(1~2분) 사이트에 반영됩니다.` : `release가 이미 최신(${r.to.slice(0, 7)})입니다. 다시 배포할 것이 없습니다.`);
              return true;
            } catch (e) {
              deployWait.current.delete(task.id);
              say('error', `운영 배포를 하지 못했습니다: ${(e as Error).message}`);
              return false;
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    requestRevision: (task, feedback) =>
      step(
        task.id,
        async () => {
          const view = deriveWorkflow(task, snap.workflow);
          if (!view.spec || !view.result) throw new Error('revision request must target the latest result package');
          await store.addRevisionRequest({
            id: newId(),
            taskId: task.id,
            specRevision: view.spec.revision,
            resultRevision: view.result.revision,
            feedback,
            createdAt: new Date().toISOString(),
          });
        },
        '수정 요청을 기록했습니다. Claude PM에 다시 보내 새 계획을 받아요.',
      ).then(async (ok) => {
        // v0.4.20: 결과 수정 요청 → PM 재계획을 자동으로(최종 목표: 사용자는 수정 요청만)
        if (ok && store.mode === 'supabase' && projectById.get(task.projectId)?.repo) await planTask(task, false, { skipSmall: true });
        return ok;
      }),
  };

  // 채점의 중복 방지·대기·오류 재시도는 별도 처리에서 관리한다.
  reviewTick.current = () => {
    if (store.mode === 'supabase' && !client) return;
    resultReviewer.current.tick({ store, snap, setSnap, say, requestRevision: workflowActions.requestRevision });
  };

  const dispatch = async (task: Task, ack: boolean): Promise<boolean> => {
    if (!client) return false;
    const res = await dispatchClaude(client, task.id, ack);
    await reload();
    if (res.ok) say('ok', 'Claude Cloud 세션을 시작했습니다. 세션 링크에서 진행 상황을 확인하세요.');
    else say('error', `실행하지 못했습니다: ${res.error ?? '알 수 없는 오류'}`);
    return res.ok;
  };

  /** Gemini가 대신 분배(v0.5.20): 계획 글을 받아 같은 검증(parsePmPlan)으로 저장한다 */
  const geminiPlan = async (task: Task, why: string) => {
    try {
      const r = await store.draftPlan(task.id);
      const fresh = await store.load();
      const failed = await importPlanText(task, r.plan, 'gemini_fallback', fresh, r.specRevision);
      if (failed) return say('error', `Gemini가 쓴 계획을 쓰지 못했어요(${task.title}): ${failed.join(' / ')}`);
      const cur = fresh.tasks.find((t) => t.id === task.id);
      if (cur?.status === 'blocked') await store.saveTask({ ...cur, status: 'in_progress' });
      setSnap(await store.load());
      say('ok', `${why}라 Gemini가 대신 작업을 나눴어요(${task.title}). 확인하고 실행 승인하세요.`);
    } catch (e) {
      say('error', `Gemini도 계획을 쓰지 못했어요(${task.title}): ${(e as Error).message} Claude 한도가 풀리면 다시 보내요.`);
    }
  };

  /**
   * 분배(v0.5.20, 소유자 "Claude 한도가 차도 업무가 안 멈추게"): 작은 일 → 규칙이 바로 배정(토큰 0),
   * 평소 → Claude PM, Claude가 휴가거나 보내지 못하면 → Gemini 무료가 대신. 실행 승인(E)은 늘 소유자.
   */
  const planTask = async (task: Task, ack: boolean, opts: { skipSmall?: boolean } = {}) => {
    const data = await store.load();
    const view = deriveWorkflow(task, data.workflow);
    const repo = projectById.get(task.projectId)?.repo ?? null;
    const away = new Set(data.leave ?? []);
    const firstPlan = view.spec && !data.workflow.plans.some((p) => p.taskId === task.id && p.approvedSpecRevision === view.spec!.revision);
    if (!opts.skipSmall && view.spec && firstPlan && repo) {
      const want = mentionedAssignee(task.userOriginalText ?? task.description);
      const check = checkSmallTask(view.spec, repo, { codex: away.has('codex'), gemini: away.has('studioA') && away.has('studioB'), claude: away.has('claude') }, want?.preference);
      if (check.ok) {
        const failed = await importPlanText(task, smallPlanText(task.id, repo, view.spec, check), 'rule_small', data);
        if (!failed) {
          say('ok', `작은 일이라 PM 없이 ${check.preference === 'gemini_dev' ? 'Gemini 개발' : check.preference === 'claude_support' ? 'Claude' : 'Codex'}에 바로 배정했어요(${task.title}). 실행 승인하면 시작해요.`);
          return;
        }
      }
    }
    if (!away.has('claude') && (await dispatch(task, ack))) return;
    await geminiPlan(task, away.has('claude') ? 'Claude가 휴가' : 'Claude PM에 보내지 못해서');
  };

  const saveProject = async ({ id, ...fields }: { id?: string; name: string; repo: string | null; description: string; previewHost?: string | null }): Promise<Project | null> => {
    const existing = id ? projectById.get(id) : undefined;
    // 수정해도 id가 같으므로 연결된 업무는 그대로 따라온다.
    const project: Project = existing
      ? { ...existing, ...fields, sample: false }
      : { id: newId(), ...fields, createdAt: new Date().toISOString() };
    return (await mutate(() => store.saveProject(project), `${fields.name} 프로젝트를 ${existing ? '수정' : '등록'}했습니다.`)) ? project : null;
  };

  const createRepo = async (project: Project, name: string): Promise<string | null> => {
    try {
      const r = await store.createRepo(project.id, name);
      setSnap(await store.load());
      say(r.warning ? 'error' : 'ok', r.warning ?? `${r.repo} 비공개 저장소를 만들고 ${project.name}에 연결했습니다.`);
      return r.repo;
    } catch (e) {
      say('error', `저장소를 만들지 못했습니다: ${(e as Error).message}`);
      return null;
    }
  };

  // 이미 있는 AI Office 저장소에 작업 규칙 파일(CLAUDE.md) 넣기(v0.4.60). 있으면 건드리지 않는다.
  const addRepoRules = async (project: Project) => {
    try {
      const r = await store.addRepoRules(project.id);
      say(
        'ok',
        r.created
          ? `${r.repo}에 AI 작업 규칙 파일(CLAUDE.md)을 넣었어요.`
          : r.updated
            ? `${r.repo}의 CLAUDE.md '지켜야 할 것'을 지금 목록과 같게 맞췄어요.`
            : `${r.repo}의 CLAUDE.md는 이미 지금 목록과 같아요.`,
      );
    } catch (e) {
      say('error', `규칙 파일을 넣지 못했습니다: ${(e as Error).message}`);
    }
  };

  const selectAgent = (id: AgentId) => {
    setSelected((cur) => (cur === id && tab === 'agent' ? null : id));
    setTab('agent');
  };

  // 프로젝트 칩을 고르면 상태 칩 숫자도 그 프로젝트 것만 센다. 지운 프로젝트를 고른 채면 전체로 본다.
  const pf = projectFilter !== 'all' && snap.projects.some((p) => p.id === projectFilter) ? projectFilter : 'all';
  // 키 A = Studio A, 키 B = Studio B(v0.4.44). 둘 다 휴가면 Gemini를 부르지 않는다.
  const geminiAway = (snap.leave ?? []).includes('studioA') && (snap.leave ?? []).includes('studioB');
  const chatProjectId = chatProject && snap.projects.some((p) => p.id === chatProject) ? chatProject : null;
  const inProject = pf === 'all' ? snap.tasks : snap.tasks.filter((t) => t.projectId === pf);
  const openCount = inProject.filter((t) => t.status !== 'done').length;
  const counts = (s: TaskStatus) => inProject.filter((t) => t.status === s).length;
  const turnsByProject = new Map<string, number>();
  for (const it of turns) {
    const pid = snap.tasks.find((t) => t.id === it.taskId)?.projectId;
    if (pid) turnsByProject.set(pid, (turnsByProject.get(pid) ?? 0) + 1);
  }
  // 프로젝트가 4개 이상일 때만 접기 버튼. 접힌 칩의 내 차례 수는 버튼에 모아 보인다.
  const fold = snap.projects.length > 3;
  const foldChip = (picked: string | null) => {
    if (!fold) return null;
    const hidden = snap.projects.filter((p) => p.id !== picked);
    const waiting = hidden.reduce((sum, p) => sum + (turnsByProject.get(p.id) ?? 0), 0);
    return (
      <button type="button" className="chip chip-fold" aria-expanded={!chipsFolded} onClick={() => setChipsFolded(!chipsFolded)}>
        {chipsFolded ? `프로젝트 ${hidden.length}개 ▾` : '접기 ▴'}
        {chipsFolded && waiting > 0 && <span className="num num-turn">{waiting}</span>}
      </button>
    );
  };

  return (
    <div className="app">
      <header className="topbar" ref={topRef}>
        <div className="brand-block">
          <span className="brand-line">
            <h1 className="brand">
              minoffia. <span className="ver">v{version}</span>
            </h1>
            <TurnMenu items={turns} onOpen={showTask} />
          </span>
          {store.mode === 'local' ? (
            <span className="mode mode-local" title="데이터는 이 브라우저의 localStorage에만 저장됩니다">
              로컬 데모 · 이 기기에만 저장
            </span>
          ) : (
            <span className="mode mode-cloud">
              Supabase 동기화 · {session?.user.email}
              <button type="button" className="link-btn" onClick={() => void client?.auth.signOut()}>
                로그아웃
              </button>
            </span>
          )}
          {/* 알림 켜기·끄기 아이콘은 밝기 버튼 바로 옆(v0.4.89) */}
          {store.mode === 'supabase' && <PushToggle store={store} />}
          <ThemeToggle />
        </div>
        {usageList}
      </header>

      <div className={`topbar-mini${barOn ? ' is-on' : ''}`} aria-hidden={!barOn}>
        <button type="button" tabIndex={barOn ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="맨 위로">
          minoffia. <span className="ver">v{version}</span>
        </button>
        <TurnMenu items={turns} onOpen={showTask} tabbable={barOn} />
        {/* 머리의 프로젝트 이름: 대화 탭은 대화에서 고른 프로젝트, 다른 탭은 업무 필터 */}
        {(() => {
          const id = tab === 'chat' ? chatProjectId : pf === 'all' ? null : pf;
          return id ? <span className="topbar-project">{snap.projects.find((p) => p.id === id)?.name}</span> : null;
        })()}
        {/* 사무실을 접었을 때만: 눌러서 사무실을 잠깐 띄워 본다(v0.5.29) */}
        {tiny && (
          <button type="button" className={`bar-btn${peek ? ' is-on' : ''}`} tabIndex={barOn ? 0 : -1} aria-expanded={peek} onClick={() => setPeek((v) => !v)}>
            사무실 {peek ? '▴' : '▾'}
          </button>
        )}
        {/* 큰 머리 내용(연결·알림·사용량)을 펼쳐 본다(v0.5.31) */}
        <button type="button" className={`bar-btn${usageOpen ? ' is-on' : ''}`} tabIndex={barOn ? 0 : -1} aria-expanded={usageOpen} onClick={() => setUsageOpen((v) => !v)}>
          사용량 보기
        </button>
        {/* 얇은 머리에도 밝기 버튼(v0.4.34), 오른쪽 끝 */}
        <ThemeToggle tabbable={barOn} />
      </div>
      {usageOpen && barOn && (
        <>
          <div className="usage-pop-backdrop" onClick={() => setUsageOpen(false)} aria-hidden="true" />
          <div className="usage-pop" role="dialog" aria-label="오늘 사용량">
            {store.mode === 'local' ? (
              <span className="mode mode-local">로컬 데모 · 이 기기에만 저장</span>
            ) : (
              <span className="mode mode-cloud">
                Supabase 동기화 · {session?.user.email}
                <button type="button" className="link-btn" onClick={() => void client?.auth.signOut()}>
                  로그아웃
                </button>
              </span>
            )}
            {store.mode === 'supabase' && <PushToggle store={store} />}
            {usageList}
          </div>
        </>
      )}

      {peek && <div className="office-peek-backdrop" onClick={() => setPeek(false)} aria-hidden="true" />}
      <main className={`layout${mini ? ' is-mini' : ''}${tiny ? ' is-tiny' : ''}`}>
        <section className={`stage${mini ? ' is-mini' : ''}${tiny ? ' is-tiny' : ''}${peek ? ' is-peek' : ''}`} aria-label="오피스">
          <OfficeView
            lamps={serviceLamps(snap.workflow, snap.aiCalls ?? [], store.mode === 'supabase')}
            tasks={snap.tasks}
            assignments={snap.workflow.assignments}
            workflow={snap.workflow}
            selected={selected}
            onSelect={selectAgent}
            onOpenTask={(id) => {
              setPeek(false);
              showTask(id);
            }}
            leave={snap.leave ?? []}
          />
          <p className="stage-note">
            캐릭터 위치와 말풍선은 업무 상태만 따릅니다. 진행 중이면 책상, 다른 방 일이면 도우러 가고, 열린 업무가 없으면 휴게실로 갑니다. 캐릭터를 누르면 상세가 열립니다.
          </p>
        </section>

        <aside className="panel">
          <nav className="tabs" role="tablist" ref={watchTabsHeight}>
            <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
              대화
            </button>
            <button type="button" role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}>
              업무
              {turns.length > 0 && (
                <span className="num num-turn" title={`내 차례 ${turns.length}개`} aria-label={`내 차례 ${turns.length}개`}>
                  {turns.length}
                </span>
              )}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'projects'} onClick={() => setTab('projects')}>
              프로젝트 <span className="num num-count">{snap.projects.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'agent'}
              onClick={() => {
                setSelected((s) => s ?? 'mina');
                setTab('agent');
              }}
            >
              에이전트
            </button>
            <button type="button" role="tab" aria-selected={tab === 'team'} onClick={() => setTab('team')}>
              팀 관리
            </button>
          </nav>

          {/* 대화 탭 프로젝트 칩(v0.4.24): '모든 프로젝트' 없이 프로젝트만. 누르면 고르고 다시 누르면 풀린다(기본은 일반 대화). */}
          {tab === 'chat' && snap.projects.length > 0 && (
            <div className="filters project-chips chat-chips" role="group" aria-label="프로젝트(고르면 그 프로젝트 기준으로 대화)" ref={watchChipsHeight}>
              {/* 기본 대화창(일반 대화, v0.4.88 소유자): 늘 맨 앞에, 프로젝트를 안 고르면 이 창 */}
              <button
                type="button"
                className="chip chip-project chip-general"
                aria-pressed={chatProjectId === null}
                onClick={() => setChatProject(null)}
                ref={chatProjectId === null ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
              >
                기본
              </button>
              {snap.projects.filter((p) => !(fold && chipsFolded) || chatProjectId === p.id).map((p) => {
                const n = turnsByProject.get(p.id) ?? 0;
                const on = chatProjectId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="chip chip-project"
                    aria-pressed={on}
                    onClick={() => setChatProject(p.id)}
                    // 프로젝트에서 '요청하기'로 넘어오면 고른 칩이 보이게 가운데로(v0.4.66)
                    ref={on ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
                  >
                    {p.name}
                    {n > 0 && <span className="num num-turn">{n}</span>}
                  </button>
                );
              })}
              {foldChip(chatProjectId)}
            </div>
          )}

          {/* 업무 탭 프로젝트 칩(v0.4.18~). 고르면 내 차례·업무가 그 프로젝트 기준 */}
          {tab === 'tasks' && snap.projects.length > 1 && (
            <div className="filters project-chips" role="group" aria-label="프로젝트" ref={watchChipsHeight}>
              {[{ id: 'all', name: '모든 프로젝트' }, ...snap.projects.filter((p) => !(fold && chipsFolded) || pf === p.id)].map((p) => {
                const n = p.id === 'all' ? turns.length : (turnsByProject.get(p.id) ?? 0);
                return (
                  <button key={p.id} type="button" className="chip chip-project" aria-pressed={pf === p.id} onClick={() => setProjectFilter(p.id)}>
                    {p.name}
                    {n > 0 && <span className="num num-turn">{n}</span>}
                  </button>
                );
              })}
              {foldChip(pf === 'all' ? null : pf)}
            </div>
          )}

          {notice && (
            <p className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              {notice.kind === 'error' && (
                <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="알림 닫기">
                  닫기
                </button>
              )}
            </p>
          )}

          {handoff && (
            <div className="handoff">
              <label className="field">
                <span>지시서 (선택된 상태입니다. Ctrl+C로 복사)</span>
                <textarea id="handoff-text" ref={handoffRef} readOnly value={handoff} rows={8} />
              </label>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setHandoff(null)}>
                닫기
              </button>
            </div>
          )}

          {/* 대화 탭: 탭을 바꿔도 대화·답 받기가 이어지게 늘 붙여 두고 숨기기만 한다 */}
          <div className="stack chat-tab" hidden={tab !== 'chat'}>
              <Inbox
                snap={snap}
                canAskGemini={store.mode === 'supabase' && !geminiAway}
                geminiAway={geminiAway}
                gptAway={(snap.leave ?? []).includes('codex')}
                onWarmGemini={() => store.warmGemini?.()}
                onLinkProject={(id) => setChatProject(id)}
                onCreateTask={(d, images) => addTask(d, images)}
                onCreateProject={(name) => saveProject({ name, repo: null, description: '입력창에서 만든 프로젝트' })}
                onAskGemini={async (q, history, images, onDelta, opts) => {
                  try {
                    return await store.askGemini(q, history, images, onDelta, opts);
                  } finally {
                    // 오늘 Gemini 횟수만 새로 읽는다(답 표시를 기다리게 하지 않음).
                    void store.load().then(setSnap, () => undefined);
                  }
                }}
                onCopy={workflowActions.copy}
                onCreateRepo={store.mode === 'supabase' ? createRepo : undefined}
                sync={inboxSync}
                onArchive={(entries) => store.appendChat(entries)}
                onAutoDraft={store.mode === 'supabase' ? (t) => void draftSpec(t.id) : undefined}
                onClarify={store.mode === 'supabase' ? (t, q, a) => workflowActions.addClarification(t, q, a) : undefined}
                onShowTask={showTask}
                onApprove={quickApprove}
                currentProject={chatProjectId ? (snap.projects.find((p) => p.id === chatProjectId) ?? null) : null}
                draft={draft}
                echo={chatEcho}
              />
          </div>

          {tab === 'tasks' && (
            <div className="stack">
              <MyTurnList
                items={pf === 'all' ? turns : turns.filter((it) => snap.tasks.find((t) => t.id === it.taskId)?.projectId === pf)}
                onOpen={showTask}
                onApprove={async (id, gate) => {
                  const t = snap.tasks.find((x) => x.id === id);
                  return t ? quickApprove(t, gate) : false;
                }}
              />
              <details className="direct-entry">
                <summary className="small">직접 입력(이미지·유형·우선순위 지정)</summary>
                <TaskForm projects={snap.projects} usage={snap.usage} leave={snap.leave ?? []} onSubmit={addTask} />
              </details>
              <div className="filters" role="group" aria-label="업무 필터">
                {(
                  [
                    ['open', `열린 업무 ${openCount}`],
                    ['all', `전체 ${inProject.length}`],
                    ...(['queued', 'in_progress', 'review', 'blocked', 'done'] as TaskStatus[]).map(
                      (s) => [s, `${STATUS_LABEL[s]} ${counts(s)}`] as [Filter, string],
                    ),
                  ] as [Filter, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {visibleTasks.length === 0 ? (
                <p className="empty">이 조건의 업무가 없습니다.</p>
              ) : (
                visibleTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    expanded={openCards.has(t.id)}
                    onToggle={(task) =>
                      setOpenCards((cur) => {
                        const next = new Set(cur);
                        if (!next.delete(task.id)) next.add(task.id);
                        return next;
                      })
                    }
                    turn={(() => {
                      const it = turns.find((x) => x.taskId === t.id);
                      return it ? { word: it.word, alert: it.alert, onJump: it.step ? () => showTask(t.id, it.step) : undefined } : undefined;
                    })()}
                    onAsk={(task) => {
                      // 그 업무의 프로젝트 대화창으로 가고, 보낼 때 업무 상태를 참고로 붙인다(v0.5.1)
                      setChatProject(task.projectId);
                      setTab('chat');
                      setDraft((d) => ({ text: `'${task.title}' 업무: `, n: (d?.n ?? 0) + 1, taskId: task.id }));
                    }}
                    onShowAgent={(task) => {
                      setSelected(task.assignee);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    project={projectById.get(t.projectId)}
                    stageLabel={STAGE_LABEL[deriveWorkflow(t, snap.workflow).stage]}
                    workflow={
                      <WorkflowPanel
                        jump={jump?.taskId === t.id ? jump : undefined}
                        task={t}
                        project={projectById.get(t.projectId)}
                        view={deriveWorkflow(t, snap.workflow)}
                        attachments={snap.workflow.attachments.filter((a) => a.taskId === t.id)}
                        analyses={snap.workflow.imageAnalyses.filter((a) => a.taskId === t.id)}
                        allAssignments={snap.workflow.assignments}
                        prCheck={latestPrCheck(t, snap.workflow)}
                        deployment={latestDeployment(t, snap.workflow)}
                        agentLimits={snap.agentLimits}
                        links={snap.workflow.links}
                        clarifications={snap.workflow.clarifications}
                        projectRules={withBaseRules((snap.projectRules ?? []).filter((r) => r.projectId === t.projectId).map((r) => r.rule))}
                        reviews={(snap.workflow.reviews ?? []).filter((r) => r.taskId === t.id)}
                        canReadLinks={store.mode === 'supabase'}
                        dispatchBlocker={dispatchBlocker(t)}
                        actions={workflowActions}
                      />
                    }
                    onStatus={setStatus}
                    onAssign={assignTask}
                    onDelete={(task) => void mutate(() => store.deleteTask(task.id), '업무를 삭제했습니다.').then((ok) => {
                      // 옵시디언 노트도 지운다(v0.5.62, 실패해도 업무 삭제는 그대로)
                      const project = projectById.get(task.projectId);
                      if (ok && project) void store.notes?.remove(project.name, task.title).catch(() => undefined);
                    })}
                    onCopy={copyHandoff}
                  />
                ))
              )}
              {filter === 'open' && counts('done') > 0 && (
                <button type="button" className="btn btn-small btn-ghost done-link" onClick={() => setFilter('done')}>
                  완료된 업무 {counts('done')}건 보기
                </button>
              )}
            </div>
          )}

          {tab === 'projects' && (
            <ProjectPanel
              projects={snap.projects}
              tasks={snap.tasks}
              turnsByProject={turnsByProject}
              onAsk={(id) => {
                setChatProject(id);
                setTab('chat');
                setDraft((d) => ({ text: '', n: (d?.n ?? 0) + 1 }));
              }}
              onOpen={(id) => {
                setProjectFilter(id);
                setFilter('open');
                setTab('tasks');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSave={saveProject}
              onDelete={(p) => void mutate(() => store.deleteProject(p.id), `${p.name} 프로젝트를 삭제했습니다.`).then((ok) => ok && void store.notes?.remove(p.name).catch(() => undefined))}
              rules={snap.projectRules ?? []}
              reviews={snap.workflow.reviews ?? []}
              onAddRule={(projectId, rule) => void mutate(() => store.addProjectRule(projectId, rule), '지켜야 할 것에 적었어요. 다음 지시서부터 함께 들어가요.')}
              onRemoveRule={(r) => void mutate(() => store.removeProjectRule(r.id), '지켜야 할 것에서 지웠어요.')}
              onCreateRepo={store.mode === 'supabase' ? createRepo : undefined}
              onAddRepoRules={store.mode === 'supabase' ? addRepoRules : undefined}
              shortcutsOf={(id) => projectShortcuts(id, snap.tasks, snap.workflow.results)}
              onOpenTask={(id) => showTask(id)}
              demoUrlOf={(p) => demoUrls[p.id] ?? null}
              lastDeployOf={(p) => (p.repo ? snap.workflow.deployments.filter((d) => d.repo.toLowerCase() === p.repo!.toLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null : null)}
              renderDesign={store.designStandard ? (p) => <DesignStandard approved={p.designMd ?? ''} draft={p.designDraft ?? ''} api={{ draft: () => store.designStandard!.draft(p.id), approve: async (md) => { await store.designStandard!.approve(p.id, md); await reload(); } }} /> : undefined}
              renderHealth={store.healthCheck ? (p) => <HealthCheck api={{ load: () => store.healthCheck!.load(p.id), start: () => store.healthCheck!.start(p.id), map: () => store.healthCheck!.map(p.id), graph: store.notes ? () => store.notes!.graph(p.id) : undefined }} /> : undefined}
              renderStructure={(p) => <RepoStructure load={() => store.repoTree(p.id)} changes={projectChanges(p.id, snap.tasks, snap.workflow.results)} />}
              renderHistory={(p) => <ProjectHistory snap={snap} projectId={p.id} loadChat={(f, t) => store.loadChat(f, t)} onOpenTask={(id) => showTask(id)} />}
            />
          )}
          {tab === 'projects' && <DevlogPanel snap={snap} loadChat={(f, t) => store.loadChat(f, t)} deleteChat={(f, t, p) => store.deleteChat(f, t, p)} onCopy={workflowActions.copy} />}

          {tab === 'agent' && <ReviewLog reviews={snap.workflow.reviews ?? []} tasks={snap.tasks} onOpenTask={(t) => showTask(t.id)} />}
          {tab === 'agent' && (
            <AgentRoster
              snap={snap}
              onLinearProbe={store.mode === 'supabase' ? () => store.linearProbe() : undefined}
              onSetLimit={(kind, n) => void mutate(() => store.setAgentLimit(kind, n), `동시 작업 상한을 ${n}개로 바꿨습니다.`)}
              selected={selected}
              onSelect={(id) => setSelected(id)}
              serverMode={store.mode === 'supabase'}
              onOpenTask={(t) => showTask(t.id)}
            />
          )}

          {tab === 'team' && (
            <TeamPanel
              snap={snap}
              loadKeys={store.keyStatus ? () => store.keyStatus!() : undefined}
              onSetLeave={(agent, onLeave) =>
                setLeaveNow(agent, onLeave)
              }
            />
          )}

          {store.mode === 'local' && (
            <footer className="panel-foot">
              <button
                type="button"
                className="link-btn small"
                onClick={() => {
                  resetLocalDemo();
                  window.location.reload();
                }}
              >
                예시 데이터로 초기화
              </button>
            </footer>
          )}
        </aside>
      </main>
    </div>
  );
}
