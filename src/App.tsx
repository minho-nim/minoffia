import { projectShortcuts } from './domain/shortcuts';
import { WikiView } from './components/WikiView';
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
import { setupIssues } from './domain/projectSetup';
import { orderProjects } from './domain/projectOrder';
import { taskTimeline } from './domain/timeline';
import { TaskBoard } from './components/TaskBoard';
import { SkillsPanel } from './components/SkillsPanel';
import { forgetMaps, StructureMaps } from './components/StructureMaps';
import { freshReport, savedReport } from './data/mapCache';
import { installedSkillsOf, isSlimProject, setSkillTitles, setSlimProjects, skillTitleOf } from './data/slimRepos';
import { skillPickRule } from './domain/skillPick';
import { endDrawing, startDrawing } from './office/drawing';
import { advanceDemo, DEMO_TAG, demoTask, newDemoTask } from './demo/demoServer';

/** 점검(앱 지도 그리기)을 시작한 시각, 프로젝트별(v0.7.4 미노 말풍선) */
const drawStarted = new Map<string, number>();
import { RelationLoader } from './components/RelationMap';
import { NoticeToast } from './components/NoticeToast';
import { OfficeMap } from './components/OfficeMap';
import { FormPopup } from './components/FormPopup';
import { ProjectSkills } from './components/ProjectSkills';
import { SKILLS_REPO, skillUsage, toSkillView } from './domain/skills';
import { ProjectOrder } from './components/ProjectOrder';
import { ProjectViews } from './components/ProjectViews';
import { KeyStatusList } from './components/KeyStatusList';
import { TaskCard } from './components/TaskCard';
import { TaskForm, type TaskDraft } from './components/TaskForm';
import type { PendingImage } from './components/Attachments';
import { WorkflowPanel, type WorkflowActions } from './components/WorkflowPanel';
import { createLocalStore, resetLocalDemo } from './data/localStore';
import { newId, type InboxState, type OfficeStore } from './data/store';
import { AGENT_BY_ID, AGENTS } from './domain/agents';
import { attachmentsOf, isImage, isRaster, moved, sha256OfBytes, type AttachmentKind } from './domain/attachments';
import { buildHandoff } from './domain/handoff';
import { buildCodexHandoff, buildGptPackage, buildPrototypeHandoff, codexBranch } from './domain/handoffV2';
import { startBlocker } from './domain/concurrency';
import { AUTO_E_NOTE, autoApproved, autoExecutionTargets, serverTurn } from './domain/autoExecute';
import { simpleStates, stateCounts, SIMPLE_LABEL } from './domain/simpleState';
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
import { installPopupClose } from './components/popupClose';
import { ciFixDone, ciFixWhy, nextAgent, PREF_LABEL, prefOf, quotaHit, reassignPlanText } from './domain/reassign';

type Tab = 'chat' | 'tasks' | 'projects' | 'agent' | 'team' | 'skills' | 'settings';
type Filter = 'open' | 'all' | TaskStatus | 'st:working' | 'st:turn' | 'st:stuck';

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
    ['B must approve the latest', '최신 결과만 결과 승인할 수 있습니다.'],
    ['C requires B', '같은 결과의 결과 승인이 먼저 필요합니다.'],
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

/** 구조도 파일 목록 기억(앱을 켜 있는 동안) */
const treeCache = new Map<string, { at: number; p: Promise<string[]> }>();

export function App() {
  const [booting, setBooting] = useState(true);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  // 데모판(v0.7.7, 소유자 "/portfolio는 포트폴리오, /demo는 데모판, 기본 주소는 그대로"): /demo로 들어오면 로그인 없이 예시 데이터로 이 기기에서만.
  // 소유자 클라우드(Supabase)·AI는 부르지 않는다. 기본 주소(/)는 늘 로그인
  const [trying] = useState(() => typeof location !== 'undefined' && (location.pathname.replace(/\/+$/, '') === '/demo' || location.hash === '#demo'));
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<OfficeStore | null>(null);
  const [rawSnap, setSnap] = useState<Snapshot>(EMPTY);
  // 프로젝트 순서(v0.6.46 소유자 "설정에서 바꾼 순서가 모두 연동"): 모든 화면이 설정의 순서로 프로젝트를 본다.
  const snap = useMemo(() => ({ ...rawSnap, projects: orderProjects(rawSnap.projects) }), [rawSnap]);
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
  useEffect(() => installPopupClose(), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = await getSupabase();
      if (cancelled) return;
      if (!sb || trying) {
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
    if (!client || !session || trying) return;
    let alive = true;
    void import('./data/supabaseStore').then(({ createSupabaseStore }) => {
      if (alive) setStore(createSupabaseStore(client));
    });
    return () => {
      alive = false;
    };
  }, [client, session]);

  /** 체험 업무(v0.7.7): 정해진 업무 하나를 만들고, AI·서버 몫은 이 기기 안의 체험 서버가 채운다(승인 3번만 직접) */
  const startDemoTask = async () => {
    if (!store || store.mode !== 'local') return;
    const cur = await store.load();
    if (demoTask(cur)) return say('ok', '체험 업무가 이미 진행 중이에요. 업무 탭에서 이어서 해 보세요.');
    const project = cur.projects[0];
    if (!project) return say('error', '프로젝트가 없어 체험 업무를 만들 수 없어요. 예시 데이터로 초기화해 주세요.');
    await store.saveTask(newDemoTask(project.id));
    setSnap(await store.load());
    setTab('tasks');
    say('ok', `체험 업무를 '${project.name}'에 만들었어요. 승인 3번(기획 → 올리기 → 배포)만 누르면 AI 팀이 나머지를 해요. 실제 서버·AI는 쓰지 않아요.`);
  };

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      setSnap(await store.load());
    } catch (e) {
      say('error', `불러오기 실패: ${(e as Error).message}`);
    }
  }, [store, say]);

  // 체험 서버(v0.7.7): 로컬 데모일 때만 1.5초마다 체험 업무를 한 걸음씩(AI·서버 몫). 실제 서버·AI는 부르지 않는다
  const demoSnap = useRef<Snapshot | null>(null);
  demoSnap.current = snap;
  useEffect(() => {
    if (!store || store.mode !== 'local') return;
    let busy = false;
    const t = window.setInterval(() => {
      const cur = demoSnap.current;
      if (busy || !cur || !demoTask(cur)) return;
      busy = true;
      void advanceDemo(store, cur)
        .then(async (msg) => {
          if (!msg) return;
          setSnap(await store.load());
          say('ok', msg);
        })
        .catch((e) => say('error', `체험 진행 실패: ${(e as Error).message}`))
        .finally(() => {
          busy = false;
        });
    }, 1500);
    return () => window.clearInterval(t);
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

  // 1분 시계(아래 1분마다 도는 확인이 올린다)
  const [minuteTick, setMinuteTick] = useState(0);
  // 업무 상태 다섯 가지(v0.6.15): 진행 중·내 차례·멈춤·실패·끝남. 1분마다(minuteTick) 다시 센다
  const states = useMemo(() => simpleStates(snap.tasks, snap.workflow), [snap.tasks, snap.workflow, minuteTick]);
  const visibleTasks = useMemo(() => {
    const list = snap.tasks.filter((t) => {
      if (projectFilter !== 'all' && t.projectId !== projectFilter && snap.projects.some((p) => p.id === projectFilter)) return false;
      if (filter === 'all') return true;
      if (filter === 'open') return t.status !== 'done';
      if (filter === 'st:working') return states.get(t.id) === 'working';
      if (filter === 'st:turn') return states.get(t.id) === 'turn';
      if (filter === 'st:stuck') return states.get(t.id) === 'stalled' || states.get(t.id) === 'failed';
      return t.status === filter;
    });
    return list;
  }, [snap.tasks, snap.projects, filter, projectFilter, states]);

  // PM 세션이 보낸 계획 옮기기(아래 planInboxRef.current). 업무 기록이 바뀔 때마다 확인한다.
  const importingInbox = useRef(false);
  const planInboxRef = useRef<(() => void) | null>(null);
  /** 업무별 마지막 자동 PR·CI 확인 시각(너무 자주 묻지 않게) */
  const autoPrAt = useRef(new Map<string, number>());
  /** 배포 승인 뒤 main 시험(CI)을 기다리는 업무(v0.4.20). 1분마다 다시 배포를 시도한다 */
  const deployWait = useRef(new Set<string>());
  const deployAt = useRef(new Map<string, number>());
  /** 지금 배포 요청 중인 업무(v0.7.37: 배포 승인 직후 자동 재시도가 겹쳐 두 번 병합을 요청해 실패했다) */
  const deploying = useRef(new Set<string>());
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
  // 프로젝트 칸 '스킬'(v0.6.66): 스킬 모음과 프로젝트별 상태를 한 번 읽어 모든 프로젝트가 나눠 쓴다
  // 사무실 지도 팝업(역할·클라우드)
  const [officePop, setOfficePop] = useState<'role' | 'cloud' | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  // 탭을 바꾸면 띄운 사무실과 '…' 펼침을 닫는다(탭마다 같은 시작 모습)
  useEffect(() => {
    setPeek(false);
    setDockOpen(false);
    setPicOpen(false);
  }, [tab]);
  const [picOpen, setPicOpen] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  // 대화 탭 프로젝트 칩 접기(v0.6.72). v0.7.47 소유자 "대화창에 프로젝트들은 기본으로 닫혀 있도록": 켤 때마다 접힌 채로 시작(고른 프로젝트 하나만 보임)
  const [chatChipsOpen, setChatChipsOpenState] = useState(false);
  const setChatChipsOpen = (f: (v: boolean) => boolean) => setChatChipsOpenState(f);
  // 스킬 탭의 '구조 보기'·'점검' 칸(v0.6.70): 열었을 때만 그린다
  const [skillMapsOpen, setSkillMapsOpen] = useState(false);
  const [skillCheckOpen, setSkillCheckOpen] = useState(false);
  // 스킬 자료를 GitHub에서 새로 읽을 때마다 1씩(v0.7.47 소유자 "게임 탭은 있는데 구조 보기에 연결이 안 됨, 앞으로도 연동되게"):
  // 저장해 둔 옛 자료로 먼저 그린 관계 지도·프로젝트 스킬이 새 자료로 다시 그려지게
  const [skillsVer, setSkillsVer] = useState(0);
  const skillsData = useRef<{ at: number; p: Promise<{ files: import('./domain/skills').SkillFile[]; map: import('./domain/skills').SkillMapData; mcp: Record<string, string[]> }> } | null>(null);
  // 스킬 목록·프로젝트 상태는 한 번 읽어 10분 동안 나눠 쓴다(v0.6.67 소유자 "스킬은 켤 때마다 불러와야 돼?"). '다시 읽기'·넣기 뒤에는 새로 읽는다
  // 앱을 다시 켜도 '읽는 중' 없이 바로 보이게(v0.6.70 소유자 "켤 때 스킬을 불러온다고 계속 나와", "서버로 올리면 안 돼?"):
  // 서버에 저장해 둔 것(skill_cache 한 행)을 먼저 쓰고, 저장한 지 10분이 지났으면 뒤에서 GitHub에서 새로 읽는다(서버가 다시 저장).
  const loadSkillsData = (force = false) => {
    if (!force && skillsData.current && Date.now() - skillsData.current.at <= 600_000) return skillsData.current.p;
    if (!force && !skillsData.current && store?.skillCache) {
      const p = store
        .skillCache()
        .catch(() => null)
        .then((c) => {
          if (!c || !c.files.length) return fetchSkills(true);
          if (!(Date.now() - Date.parse(c.updatedAt) < 600_000)) void fetchSkills(true).catch(() => null);
          setSlimProjects(c.map);
          setSkillTitles(c.files.map(toSkillView));
          return { files: c.files, map: c.map, mcp: c.mcp };
        });
      skillsData.current = { at: Date.now(), p };
      p.catch(() => {
        if (skillsData.current?.p === p) skillsData.current = null;
      });
      return p;
    }
    return fetchSkills();
  };
  /** GitHub에서 새로 읽기(서버 함수가 읽으면서 skill_cache에도 저장). background면 지금 보이는 것은 그대로 두고 끝나면 바꿔 둔다 */
  const fetchSkills = (background = false) => {
    const p2 = Promise.all([store!.skills!(), store!.skillMap!(), store!.mcpMap ? store!.mcpMap().catch(() => ({})) : Promise.resolve({})]).then(([files, map, mcp]) => ({ files, map, mcp: mcp as Record<string, string[]> }));
    p2.then(
      (d) => {
        skillsData.current = { at: Date.now(), p: Promise.resolve(d) };
        setSlimProjects(d.map);
        setSkillTitles(d.files.map(toSkillView));
        setSkillsVer((v) => v + 1);
      },
      () => {
        if (skillsData.current?.p === p2) skillsData.current = null;
      },
    );
    if (!background) skillsData.current = { at: Date.now(), p: p2 };
    return p2;
  };
  // 켤 때 한 번 스킬 상태를 읽어 둔다(v0.6.82): 지시서를 짧게 보낼 수 있는 프로젝트(규칙 칸·개발 스킬 있음)를 알아 두려고. 서버에 저장된 한 행이라 가볍다
  useEffect(() => {
    if (store?.skillCache && store.skills && store.skillMap) void loadSkillsData().catch(() => null);
  }, [store]);
  // 스킬 탭에서 넣기 창을 바로 열 스킬(프로젝트 칸에서 넘어올 때)
  const [skillToInstall, setSkillToInstall] = useState<{ name: string; n: number } | null>(null);
  // 반복되는 문제 → 스킬 만들기 창(v0.6.59)
  const [skillPrefill, setSkillPrefill] = useState<{ what: string; rules: string; n: number } | null>(null);
  // 업무 보기 방식(v0.6.54): 보드 | 목록. 이 기기에만 기억(화면 편의). 기본은 보드(v0.6.72 소유자 "보드가 먼저 보이게")
  const [taskView, setTaskViewState] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem('taskView') === 'list' ? 'list' : 'board';
    } catch {
      return 'board';
    }
  });
  const setTaskView = (v: 'list' | 'board') => {
    setTaskViewState(v);
    try {
      localStorage.setItem('taskView', v);
    } catch {
      // 저장 못 해도 화면은 그대로
    }
  };
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
  const [draft, setDraft] = useState<{ text: string; n: number; taskId?: string; send?: boolean } | null>(null);
  // 얇은 머리·작은 사무실(v0.4.14~, v0.4.35): 켜기 = 위 머리가 화면 밖으로 나갔고, 사무실이 줄어든 뒤에도
  // 페이지가 머리 높이 넘게 내려갈 수 있을 때(짧은 페이지에서 아래 빈 공간이 생기거나 깜빡이지 않게).
  // 끄기 = 맨 위에 닿았을 때만.
  const topEl = useRef<HTMLElement | null>(null);
  // v0.6.25(소유자 "채팅창 위로 올릴 때 흔들림", 화면 녹화): 위로 빠르게 올리는 도중에 사무실이 펴지며(높이가 바뀌어)
  // 글이 아래로 밀렸다. 접기는 바로, 펴기는 스크롤이 멈춘 뒤(0.25초)에만 한다.
  const settleTimer = useRef(0);
  const checkMini = useCallback((settled = false) => {
    const top = topEl.current;
    if (!top) return;
    if (!settled) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => checkMini(true), 90);
    }
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
    // v0.6.81 소유자 "사무실 펴지는 반응이 느려": 맨 위에 닿으면 기다리지 않고 바로 편다(맨 위라 글이 밀려 흔들릴 일이 없다)
    if (window.scrollY <= 2) return set(false, false);
    if (top.getBoundingClientRect().bottom >= 46) return; // 얇은 머리 높이(--mini-h)와 같게
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
    else if (settled && now.tiny && window.scrollY < enter - h / 2) set(true, false);
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
    const onScroll = () => checkMini();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(settleTimer.current);
    };
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
  // 앞 작업이 끝나면 기다리던 작업 자동 시작(v0.6.18, 소유자 "전체적으로 복잡하네"). 실제 처리는 아래 chainTick.
  const chainTick = useRef<() => void>(() => undefined);
  const chainTried = useRef(new Set<string>());
  useEffect(() => {
    chainTick.current();
    // 1분마다도 다시 본다: 서버가 1분 안에 못 한 것을 앱이 이어받는다(v0.6.28)
  }, [snap, minuteTick]);

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
  // UI 코드 검사가 들어 있는 프로젝트(2026-11-16): 프로젝트 탭을 열 때 한 번 묻는다(실패하면 준비 칸에 상태만 안 보임)
  const [uiCheckHas, setUiCheckHas] = useState<Record<string, boolean> | null>(null);
  const [uiCheckKick, setUiCheckKick] = useState(0);
  useEffect(() => {
    if (tab !== 'projects' || !repoProjectKey || !store?.uiCheckStatus) return;
    let alive = true;
    void store.uiCheckStatus().then((m) => alive && setUiCheckHas(m)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tab, repoProjectKey, store, uiCheckKick]);
  const ciFixTried = useRef(new Set<string>());
  const handoffTried = useRef(new Set<string>());
  // Gemini 시안 자동 그리기(v0.7.13): 기획서가 '새 디자인 필요'라고 하면 기획 승인 전에 한 번만 그린다(기획서 버전마다, 실패해도 다시 안 부름)
  const drewDesign = useRef(new Set<string>());
  useEffect(() => {
    if (!store || store.mode !== 'supabase' || !store.drawDesign) return;
    for (const t of snap.tasks) {
      if (t.status === 'done' || t.stage === 'cancelled') continue;
      const v = deriveWorkflow(t, snap.workflow);
      if (!v.spec?.sizeHint?.needs_design || v.aApproved) continue;
      const key = `${t.id}:${v.spec.revision}`;
      if (drewDesign.current.has(key) || (snap.workflow.designDrafts ?? []).some((d) => d.taskId === t.id && d.specRevision === v.spec!.revision)) continue;
      drewDesign.current.add(key);
      void store
        .drawDesign(t.id)
        .then(() => store.load())
        .then(setSnap)
        .catch(() => undefined);
    }
  }, [store, snap.tasks, snap.workflow]);
  if (booting) return <main className="boot">오피스를 여는 중…</main>;
  if (client && !session && !trying) return <Login client={client} />;
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

  /** 업무 취소(v0.6.50): 끝나지 않은 AI 작업은 '실패(소유자 취소)'로 멈추고 업무는 취소 단계로. 서버도 취소한 업무는 더 시작하지 않는다. */
  const cancelTask = (task: Task) =>
    void mutate(async () => {
      for (const a of snap.workflow.assignments.filter((x) => x.taskId === task.id && x.dispatchStatus !== 'completed' && x.dispatchStatus !== 'failed')) {
        await store!.updateAssignment({ ...a, dispatchStatus: 'failed', statusSource: 'user_reported', actualProviderStatus: '소유자가 업무를 취소함' });
      }
      await store!.saveTask({ ...task, status: 'done', stage: 'cancelled' });
    }, '업무를 취소했어요. 기록은 남아 있어요.');
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
    if (trying && task.title.startsWith(DEMO_TAG)) return '체험: Claude PM이 계획을 만드는 중이에요(몇 초).';
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
      // v0.6.12: 서버가 '다시 개발' 수정 요청은 기록했는데 PM 전송이 실패했으면(휴가·한도 등) 앱이 기존 대체 경로로 한 번 다시 보낸다
      const lastRev = snap.workflow.revisionRequests.filter((r) => r.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const latestPlanAt = snap.workflow.plans.filter((p) => p.taskId === task.id).reduce((m, p) => (p.createdAt > m ? p.createdAt : m), '');
      if (lastRev && lastRev.createdAt > latestPlanAt && task.dispatch.state === 'failed' && !planRetried.current.has(`rev:${lastRev.id}`)) {
        planRetried.current.add(`rev:${lastRev.id}`);
        void planTask(task, true, { skipSmall: true });
        continue;
      }
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
        // 결과 승인(B) 뒤 PR·CI를 자동으로 확인한다(v0.4.5). 결과가 정해지면(성공·실패·닫힘) 멈춘다. 손으로 다시 확인하는 버튼은 그대로.
        let checked = false;
        for (const t of snap.tasks) {
          const v = deriveWorkflow(t, snap.workflow);
          if (!v.bApproved || v.cApproved) continue;
          if (!t.prUrl && !(v.result?.source === 'claude_session_auto' || v.result?.source === 'claude_manual' || v.result?.source === 'gemini_actions_auto' || v.result?.source === 'codex_linear_auto')) continue;
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
            // v0.6.30: Codex가 '시작 못 함'(환경 없음 등)이어도 Claude로 넘긴다. 보통은 서버(linear-webhook)가 먼저 넘기므로 1분 기다린다
            const codexFail = a.assignee === 'codex' && a.dispatchStatus === 'failed' && /^linear: 시작 못 함/.test(a.actualProviderStatus ?? '') && Date.now() - Date.parse(a.updatedAt) > 60_000;
            if ((a.dispatchStatus !== 'blocked_quota' && !codexFail) || handoffTried.current.has(a.id)) continue;
            handoffTried.current.add(a.id);
            const repo = (snap.projects.find((p) => p.id === t.projectId)?.repo ?? '').toLowerCase();
            const away = new Set(snap.leave ?? []);
            const to = nextAgent(a.assignee, { claude: away.has('claude'), codex: away.has('codex'), gemini: away.has('studioA') && away.has('studioB') }, OFFICE_REPOS.includes(repo));
            if (!to) continue;
            const target = codexFail && !away.has('claude') ? 'claude_support' : to;
            const failed = await importPlanText(t, reassignPlanText(v.plan, a.workItemId, target, codexFail ? 'Codex 시작 못 함' : `${a.assignee} 한도`), 'manual', snap, v.spec.revision);
            if (!failed) say('ok', `[${t.title}] ${a.workItemId}을 ${PREF_LABEL[target as keyof typeof PREF_LABEL]}에게 넘겼어요(${codexFail ? 'Codex 시작 못 함' : '한도'}). 바로 이어서 해요.`);
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
  const quickApprove = async (task: Task, gate: 'A' | 'B' | 'C'): Promise<boolean> => {
    const view = deriveWorkflow(task, snap.workflow);
    if (!canApprove(view, gate).ok) return false;
    // 배포 승인 바로 하기는 체험(로컬 데모)에서만(v0.7.7). 실제 앱은 업무 카드에서
    if (gate === 'C') {
      if (store.mode !== 'local' || !view.result) return false;
      const ok = await workflowActions.decide(task, 'C', view.result.revision, 'approved', '', { pr_url: task.prUrl, ci: 'demo' });
      if (ok) await store.deployRelease(task.id).catch(() => null);
      setSnap(await store.load());
      return ok;
    }
    if (gate === 'A') return view.spec ? workflowActions.decide(task, 'A', view.spec.revision, 'approved') : false;
    return view.result ? workflowActions.decide(task, 'B', view.result.revision, 'approved', '', { result_sha256: view.result.sha256 }) : false;
  };
  // 체험(로컬 데모)에서는 '배포' 차례에 [배포 승인] 바로 버튼(v0.7.7)
  const turns = myTurns(snap.tasks, snap.workflow).map((it) => (store.mode === 'local' && it.word === '배포' && !it.alert && !it.quick ? { ...it, quick: 'C' as const } : it));

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
    // 미노(CI)가 구조도를 그리는 동안 말풍선(v0.7.4): 시작했으면 켜고, 그림이 오면 끈다
    archify: store.archify
      ? (taskId, revision) =>
          store.archify!(taskId, revision).then((r) => {
            if (r.html) endDrawing(`archify:${taskId}:${revision}`);
            else if (r.started) startDrawing(`archify:${taskId}:${revision}`, '구조도');
            return r;
          })
      : undefined,
    // 담당 바꾸기·한도 넘기기(v0.5.73): 지금 계획에서 그 작업 담당만 바꾼 새 계획 버전을 만든다. 실행 승인(E)은 다시 받는다.
    pickResult: async (task, r) => {
      // 두 AI 비교에서 고른 결과(v0.6.54): 같은 변경·같은 출처를 새 버전으로 다시 저장해 최신 결과로 만든다(올리기 승인은 최신 결과만 받는다).
      const revision = nextRevision(snap.workflow.results, task.id, (x: { revision: number }) => x.revision);
      return step(
        task.id,
        async () => {
          await store.addResult({ ...r, id: newId(), revision, summary: `[비교에서 고름: 결과 v${r.revision}] ${r.summary}`.slice(0, 20000), createdAt: new Date().toISOString() });
        },
        `결과 v${r.revision}를 올릴 결과로 정했어요(새 버전 v${revision}). 채점이 끝나면 올리기 승인을 눌러 주세요.`,
      );
    },
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
      // v0.6.80 소유자 "넘기는 중에 버튼을 두 번 눌러야 했다": 새 계획을 바로 읽어 자동 시작(실행 승인 자동 기록 → 시작)이 이번 화면에서 이어지게 한다
      setSnap(await store.load());
      say('ok', `${a.workItemId}을(를) ${PREF_LABEL[to as keyof typeof PREF_LABEL] ?? to}에게 넘겼어요. 곧 자동으로 시작해요(다시 누르지 않아도 돼요).`);
      return true;
    },
    designCheck: store.designCheck,
    addFollowup: store.addFollowup
      ? async (task, text) => {
          try {
            await store.addFollowup!(task.id, text);
            setSnap(await store.load());
            say('ok', `추가 요청을 적어 뒀어요(${task.title}). 다음 다시 개발 때 함께 보내요.`);
            return true;
          } catch (e) {
            say('error', `추가 요청을 적지 못했어요: ${(e as Error).message}`);
            return false;
          }
        }
      : undefined,
    siteCheck: store.siteCheck,
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
          ? gate === 'A' && snap.workflow.specs.find((x) => x.taskId === task.id && x.revision === revision)?.planner === 'gemini_draft'
            ? '수정 요청을 기록했습니다. Gemini가 기획서를 다시 써요.'
            : '수정 요청을 기록했습니다. ChatGPT용 자료를 다시 복사해 재기획하세요.'
          : gate === 'C'
            ? '배포 승인을 기록했습니다. 끝난 업무는 열린 업무 목록에서 빠지고 "완료" 필터에 남습니다.'
            : `${gate} 승인을 기록했습니다.`,
      );
      // 소유자 승인(2026-10-31): 실행 승인(E) → Claude 작업 자동 시작, 결과 승인(B) → Claude 결과면 Claude가 PR을 연다.
      if (ok && decision === 'approved' && store.mode === 'supabase') {
        if (gate === 'E') {
          const found = snap.workflow.assignments.find((x) => x.taskId === task.id && x.planRevision === revision && x.workItemId === workItemId);
          // 앞 작업이 아직이면 지금 시작하지 않는다(서버가 거절함). 앞 작업이 끝나면 chainTick이 시작한다.
          const blocked = found ? startBlocker(found, snap.workflow.assignments, deriveWorkflow(task, snap.workflow).plan, snap.agentLimits) : null;
          if (blocked) say('ok', `실행 승인했어요. ${blocked.replace('시작할 수 있습니다.', '자동으로 시작해요.')}`);
          const a = blocked ? undefined : found;
          if (a?.assignee === 'claude') await workflowActions.startClaudeDev?.(a, false);
        }
        if (gate === 'B') {
          const r = snap.workflow.results.find((x) => x.taskId === task.id && x.revision === revision);
          // Gemini 개발 결과(v0.4.82): 작업 브랜치가 이미 올라가 있어 GitHub에서 PR만 만들면 된다(병합은 배포 승인 뒤 서버가).
          const repo = projectById.get(task.projectId)?.repo;
          // v0.6.29(소유자 "PC 전에 더 해둘 것"): Gemini·Claude·Codex 자동 결과 모두 GitHub Actions가 PR을 연다(한 길).
          // Claude·Codex는 승인된 diff를 그대로 기본 브랜치에 적용해 작업 브랜치로 올린다(세션의 push 권한과 상관없이).
          const auto = r && ['gemini_actions_auto', 'claude_session_auto', 'claude_manual', 'codex_linear_auto'].includes(r.source);
          if (r && auto && repo) {
            const tool = r.source === 'gemini_actions_auto' ? 'gemini' : r.source === 'codex_linear_auto' ? 'codex' : 'claude';
            const branch = codexBranch(task, r.workItemId, tool);
            try {
              await store.openPr?.(task.id);
              say('ok', `결과 승인했어요. ${branch} 브랜치로 PR을 자동으로 여는 중이에요(1~2분, 병합 안 함). PR이 생기면 CI를 자동으로 확인합니다.`);
            } catch (e) {
              say('error', `PR 자동 열기 실패: ${(e as Error).message}`);
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
      store.mode === 'supabase' || trying
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
    codexManualSection:
      store.mode === 'supabase' && store.codexManualSection
        ? async (a) => {
            try {
              const section = await store.codexManualSection!(a.id);
              say('ok', `${a.workItemId} 지시서를 복사했어요. Codex 앱에서 이 프로젝트 환경을 골라 붙여 넣으면, 끝난 뒤 결과가 자동으로 들어와요(Codex 환경에 결과 보낼 주소 허용 필요).`);
              return section;
            } catch (e) {
              say('error', `결과 자동 제출 준비 실패: ${(e as Error).message} — 지시서만 복사했어요. 결과는 직접 붙여 넣어 주세요.`);
              return '';
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    // 체험(v0.7.12): 데모판은 Codex 자동 길 모양으로 보이게 한다(실제로 맡기지는 않음, 체험 서버가 진행)
    startCodexLinear:
      trying
        ? async () => {
            say('ok', '체험에서는 Codex가 자동으로 시작해요(실제로 맡기지는 않아요).');
            return true;
          }
        : store.mode === 'supabase'
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
    openPr:
      store.mode === 'supabase' && store.openPr
        ? async (task) => {
            try {
              await store.openPr!(task.id);
              say('ok', 'PR을 다시 여는 중이에요(1~2분, 병합 안 함). 열리면 CI를 자동으로 확인해요.');
            } catch (e) {
              say('error', `PR을 열지 못했어요: ${(e as Error).message}`);
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    finishReview:
      store.mode === 'supabase' && store.finishReview
        ? async (task, rev) => {
            try {
              const r = await store.finishReview!(task.id, rev);
              say('ok', `모인 점수로 판정했어요${r.total === null ? '' : `(평균 ${r.total}점)`}.`);
            } catch (e) {
              say('error', `판정하지 못했어요: ${(e as Error).message}`);
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    // Gemini 시안(v0.7.13): 그리기는 서버(Gemini A·B), 고르기는 기록 한 줄(승인 아님)
    drawDesign:
      store.mode === 'supabase' && store.drawDesign
        ? async (task) => {
            try {
              const drafts = await store.drawDesign!(task.id);
              say('ok', `Gemini가 시안 ${drafts.length}장을 그리고 서로 평가했어요. 업무 카드에서 보고 하나를 고르세요.`);
            } catch (e) {
              say('error', `시안을 그리지 못했어요: ${(e as Error).message}`);
            } finally {
              setSnap(await store.load());
            }
          }
        : undefined,
    pickDesign: store.pickDesign
      ? async (task, draft) => {
          try {
            await store.pickDesign!(task.id, draft.specRevision, draft.id);
            say('ok', `Gemini ${draft.who} 시안을 골랐어요. 기획 승인하면 개발 AI에게 이 시안이 같이 넘어가요.`);
          } catch (e) {
            say('error', `시안을 고르지 못했어요: ${(e as Error).message}`);
          } finally {
            setSnap(await store.load());
          }
        }
      : undefined,
    deploy:
      store.mode === 'supabase' || trying
        ? async (task, allowExtra = false, quiet = false) => {
            if (deploying.current.has(task.id)) return true;
            deploying.current.add(task.id);
            try {
              const r = await store.deployRelease(task.id, allowExtra);
              if (r.wait) {
                // 처음 한 번만 알리고, 그 뒤 자동 재시도는 조용히
                if (!quiet && !deployWait.current.has(task.id)) say('ok', `배포 대기: ${r.message || 'main 시험(CI)이 끝나면 자동으로 배포해요.'}`);
                deployWait.current.add(task.id);
                return true;
              }
              deployWait.current.delete(task.id);
              say('ok', r.updated ? `운영 배포를 시작했습니다: release를 ${r.to.slice(0, 7)}로 앞당겼습니다. Cloudflare 빌드가 끝나면(1~2분) 사이트에 반영되고, 운영 화면을 자동으로 찍어 확인해요.` : `release가 이미 최신(${r.to.slice(0, 7)})입니다. 다시 배포할 것이 없습니다.`);
              // 배포 뒤 운영 화면 확인(v0.6.9): 운영 주소가 있는 프로젝트만. 실패해도 배포는 그대로
              if (r.updated) void store.siteCheck?.start(task.id, 'production').catch(() => undefined);
              return true;
            } catch (e) {
              deployWait.current.delete(task.id);
              say('error', `운영 배포를 하지 못했습니다: ${(e as Error).message}`);
              return false;
            } finally {
              deploying.current.delete(task.id);
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

  // 기다리던 작업 자동 시작(v0.6.18): 실행 승인(E)이 있고, 앞 작업이 있었고, 지금은 막힌 게 없는 '준비' 작업만.
  // 같은 작업은 앱이 열려 있는 동안 한 번만 시도한다(한도·오류로 실패하면 카드의 시작 버튼으로).
  // 앱을 닫아 둬도: 계획·결과가 들어올 때 서버(submit-plan·submit-result·linear-webhook의 autoRun)가 먼저 이어서 하고, 앱은 1분 뒤 남은 것만.
  // shortcut: 서버 호출이 실패하고 앱도 닫혀 있으면 다시 시도할 곳이 없다(10분 알림 push_stale_work가 알려 줌), 실패가 잦아지면 서버 정기 재시도를 더할 때.
  chainTick.current = () => {
    if (store.mode !== 'supabase' || !client) return;
    // 승인 3개(v0.6.22): 기획 승인한 업무의 계획이 오면 실행 승인(E)을 자동으로 기록한다(감사 기록에 '기획 승인에 포함'으로 남김).
    // shortcut: 앱이 열려 있을 때만 기록·시작한다, 서버가 계획을 받을 때 바로 하게 고칠 때.
    for (const task of snap.tasks) {
      if (task.status === 'done') continue;
      const view = deriveWorkflow(task, snap.workflow);
      // 서버가 받은 계획은 서버가 먼저 실행 승인·시작한다(v0.6.28). 1분 지나도 그대로면 앱이 한다.
      if (view.plan && serverTurn(view.plan.createdAt, view.plan.source === 'routine_session_auto')) continue;
      for (const a of autoExecutionTargets(view)) {
        if (chainTried.current.has(`e:${a.id}`)) continue;
        chainTried.current.add(`e:${a.id}`);
        void (async () => {
          try {
            await store.addApproval({
              id: newId(), taskId: task.id, gate: 'E', decision: 'approved', approvedRevision: a.planRevision, previousRevision: null,
              workItemId: a.workItemId, scope: { auto: true, note: AUTO_E_NOTE, assignee: a.assignee, plan_revision: a.planRevision, spec_revision: view.spec?.revision ?? null },
              actor: session?.user.email ?? '', createdAt: new Date().toISOString(),
            });
            await store.updateAssignment({ ...a, dispatchStatus: 'ready' });
            say('ok', `${task.title} — ${a.workItemId} 실행 승인을 기획 승인에 포함해 기록했어요. 곧 자동으로 시작해요.`);
          } catch (e) {
            say('error', `${a.workItemId} 실행 승인 자동 기록 실패: ${(e as Error).message} — 업무 카드에서 직접 승인해 주세요.`);
          } finally {
            setSnap(await store.load());
          }
        })();
      }
    }
    for (const a of snap.workflow.assignments) {
      if (a.dispatchStatus !== 'ready' || chainTried.current.has(a.id)) continue;
      const task = snap.tasks.find((t) => t.id === a.taskId);
      if (!task) continue;
      const view = deriveWorkflow(task, snap.workflow);
      const item = view.plan?.plan.work_items.find((w) => w.id === a.workItemId);
      if (!view.plan || view.plan.planRevision !== a.planRevision || !item || !view.eApproved(a.workItemId)) continue;
      // 앞 작업이 있던 작업이거나, 실행 승인이 자동 기록된 작업만(손으로 승인한 것은 승인 때 이미 시작함)
      if (!item.dependencies?.length && !autoApproved(snap.workflow.approvals, a)) continue;
      // 서버가 기록한 승인은 서버가 시작한다(1분 지나도 준비 그대로면 앱이 시작)
      const eRow = snap.workflow.approvals.find((x) => x.taskId === a.taskId && x.gate === 'E' && x.approvedRevision === a.planRevision && x.workItemId === a.workItemId);
      if (eRow && serverTurn(eRow.createdAt, eRow.scope?.by === 'server')) continue;
      if (startBlocker(a, snap.workflow.assignments, view.plan, snap.agentLimits)) continue;
      chainTried.current.add(a.id);
      say('ok', item.dependencies?.length ? `앞 작업이 끝나서 ${a.workItemId}을(를) 자동으로 시작해요.` : `${a.workItemId}을(를) 자동으로 시작해요.`);
      if (a.assignee === 'claude') void workflowActions.startClaudeDev?.(a, false);
      else if (a.assignee === 'codex' && view.spec) {
        const project = projectById.get(task.projectId);
        const rules = [...withBaseRules((snap.projectRules ?? []).filter((r) => r.projectId === task.projectId).map((r) => r.rule)), ...skillPickRule(task.skills)];
        const text = buildCodexHandoff(task, view.spec, item, project, view.plan.targetBaseRevision, attachmentsOf(snap.workflow.attachments, task.id, 'request'), linksOf(snap.workflow.links, task.id), view.pApproved ? attachmentsOf(snap.workflow.attachments, task.id, 'prototype', view.plan.planRevision) : [], rules, isSlimProject(task.projectId));
        void workflowActions.startCodexLinear?.(a, false, text);
      }
    }
  };

  // 채점의 중복 방지·대기·오류 재시도는 별도 처리에서 관리한다.
  reviewTick.current = () => {
    if (store.mode === 'supabase' && !client) return;
    resultReviewer.current.tick({ store, snap, setSnap, say, requestRevision: workflowActions.requestRevision });
  };

  const dispatch = async (task: Task, ack: boolean): Promise<boolean> => {
    if (!client || store.mode === 'local') return false;
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
          say('ok', `작은 일이라 PM 없이 ${check.preference === 'claude_support' ? 'Claude' : 'Codex'}에 바로 배정했어요(${task.title}). 실행 승인하면 시작해요.`);
          return;
        }
      }
    }
    if (!away.has('claude') && (await dispatch(task, ack))) return;
    await geminiPlan(task, away.has('claude') ? 'Claude가 휴가' : 'Claude PM에 보내지 못해서');
  };

  const saveProject = async ({ id, ...fields }: { id?: string; name: string; repo: string | null; description: string; previewHost?: string | null; demoUrl?: string | null }): Promise<Project | null> => {
    const existing = id ? projectById.get(id) : undefined;
    // 수정해도 id가 같으므로 연결된 업무는 그대로 따라온다.
    const project: Project = existing
      ? { ...existing, ...fields, sample: false }
      : { id: newId(), ...fields, position: Math.max(-1, ...snap.projects.map((p) => p.position ?? 0)) + 1, createdAt: new Date().toISOString() };
    return (await mutate(() => store.saveProject(project), `${fields.name} 프로젝트를 ${existing ? '수정' : '등록'}했습니다.`)) ? project : null;
  };

  const createRepo = async (project: Project, name: string): Promise<string | null> => {
    try {
      const r = await store.createRepo(project.id, name);
      setSnap(await store.load());
      say(r.warning ? 'error' : 'ok', r.warning ?? `${r.repo} 비공개 저장소를 만들고 ${project.name}에 연결했습니다.`);
      // 기본 스킬(v0.6.60): 새 저장소에 '기본' 표시가 있는 스킬을 자동으로 넣는다(실패해도 저장소 만들기는 끝난 것)
      if (store.skills && store.installSkill) {
        void (async () => {
          try {
            const defaults = (await store.skills!()).map(toSkillView).filter((s) => s.isDefault);
            for (const s of defaults) await store.installSkill!(s.name, [project.id], 'add');
            if (defaults.length) say('ok', `새 저장소에 기본 스킬 ${defaults.length}개(${defaults.map((s) => s.title).join(', ')})를 넣기 시작했어요(1~2분).`);
            // UI 코드 검사도 새 저장소에 넣는다(2026-11-16 소유자 "UI에 쓰는 거라 웬만하면 모두")
            await store.installUiCheck?.([project.id]).catch(() => null);
          } catch {
            // 스킬 넣기 실패는 저장소 만들기와 별개(스킬 탭에서 다시 넣을 수 있다)
          }
        })();
      }
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
  // 프로젝트 칩은 한 줄로 옆으로 밀어 본다(v0.6.42 소유자 "한 줄로, 오른쪽으로 밀어서"). 순서는 설정 탭에서 바꾼다.
  const ordered = snap.projects;
  // 스킬 만들기·찾기를 접수할 프로젝트(v0.6.65): 스킬 원본 저장소(minoffia-skills) 프로젝트, 없으면 이 저장소(minoffia)
  const skillsProject = snap.projects.find((p) => (p.repo ?? '').toLowerCase() === SKILLS_REPO && !p.sample) ?? null;
  const officeProject =
    snap.projects.find((p) => (p.repo ?? '').toLowerCase() === SKILLS_REPO && !p.sample) ??
    snap.projects.find((p) => OFFICE_REPOS.includes((p.repo ?? '').toLowerCase()) && !p.sample) ??
    null;
  // 구조도·앱 지도(프로젝트 탭과 업무 카드가 같이 쓴다, v0.6.45)
  // 구조도 파일 목록은 프로젝트마다 10분 동안 한 번만 읽는다(v0.6.72 소유자 "켤 때마다 로딩해야 돼?")
  const loadTree = (id: string) => {
    const c = treeCache.get(id);
    if (c && Date.now() - c.at < 600_000) return c.p;
    // 점검 때 저장한 파일 목록이 있으면 그것을(이 기기에 저장한 것 → 없으면 점검 결과 파일), 없을 때만 GitHub(v0.6.78)
    const health = store.healthCheck;
    const p = (async () => {
      const saved = await savedReport(id).catch(() => null);
      if (saved?.tree?.length) return saved.tree;
      const fresh = health ? await freshReport(id, { load: () => health.load(id) }).catch(() => null) : null;
      if (fresh?.tree?.length) return fresh.tree;
      return store.repoTree(id);
    })();
    treeCache.set(id, { at: Date.now(), p });
    p.catch(() => treeCache.delete(id));
    return p;
  };
  const renderStructure = (p: Project) => <RepoStructure load={() => loadTree(p.id)} changes={projectChanges(p.id, snap.tasks, snap.workflow.results)} />;
  // 사무실 지도(v0.6.71): 확인된 상태만(마지막 운영 배포, 휴가)
  const officeDeploy = snap.workflow.deployments.filter((d) => d.ok && OFFICE_REPOS.includes(d.repo.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const renderOffice = (t: 'role' | 'cloud') => <OfficeMap tab={t} state={{ lastDeploy: officeDeploy?.createdAt, onLeave: snap.leave ?? [] }} />;
  // 관계 지도에 나오는 프로젝트(저장소 있음, 예시·MinLab 제외, 프로젝트 순서대로)
  const relProjects = ordered.filter((p) => p.repo && !p.sample && p.repo.toLowerCase() !== 'minho-nim/minlab').map((p) => ({ id: p.id, name: p.name }));
  // '구조 보기'와 '점검'을 나눈다(v0.6.70): 프로젝트 칸과 스킬 탭이 같은 모양
  // 점검 문제 '고치기 요청'(v0.6.95): 그 프로젝트 대화창으로 가서 입력칸에 써 둔다(보내기는 소유자가)
  const fixInChat = (p: Project) => (text: string) => {
    setChatProject(p.id);
    setTab('chat');
    setDraft((d) => ({ text, n: (d?.n ?? 0) + 1 }));
  };
  const renderCheck = store.healthCheck ? (p: Project) => <HealthCheck maps={false} onFix={fixInChat(p)} api={{ load: () => store.healthCheck!.load(p.id).then((r) => (r && drawStarted.get(p.id) && Date.parse(r.checkedAt) >= drawStarted.get(p.id)! - 60_000 && endDrawing(`map:${p.id}`), r)), start: (force?: boolean) => (forgetMaps(p.id), drawStarted.set(p.id, Date.now()), startDrawing(`map:${p.id}`, '앱 지도'), store.healthCheck!.start(p.id, force)), map: () => store.healthCheck!.map(p.id) }} /> : undefined;
  const renderMaps = (p: Project) => (
    <StructureMaps
      id={p.id}
      health={store.healthCheck && p.repo ? { load: () => store.healthCheck!.load(p.id), map: () => store.healthCheck!.map(p.id) } : undefined}
      structure={() => renderStructure(p)}
      office={OFFICE_REPOS.includes((p.repo ?? '').toLowerCase()) ? renderOffice : undefined}
      relation={store.skills && store.skillMap ? () => <RelationLoader load={() => loadSkillsData()} ver={skillsVer} projects={relProjects} focus={p.repo && p.repo.toLowerCase() !== SKILLS_REPO ? p.id : undefined} /> : undefined}
    />
  );
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
              {trying ? '데모판 · 예시 데이터' : '로컬 데모 · 이 기기에만 저장'}
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
      {/* 체험 띠(v0.7.7): 휴대폰에서도 보이게 머리 아래에. 체험 업무 시작·끝내기 */}
      {store.mode === 'local' && (
        <div className="demo-band" role="region" aria-label="체험 모드">
          <span>{trying ? '데모판 · 예시 데이터로 이 기기에서만 돌아가요(실제 서버·AI 안 씀)' : '로컬 데모 · 이 기기에만 저장'}</span>
          <span className="demo-band-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => void startDemoTask()}>
              체험 업무 시작
            </button>
            {trying && (
              <a className="btn btn-small btn-ghost" href="/portfolio">
                포트폴리오로
              </a>
            )}
          </span>
        </div>
      )}

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
        {/* 사무실 띄워 보기는 모든 탭에서 오른쪽 아래 '…' 하나로(v0.6.79 소유자 "대화에서 사무실 일관성이 없다"): 얇은 머리의 '사무실 ▾'는 뺐다 */}
        {/* 큰 머리 내용(연결·알림·사용량)을 펼쳐 본다(v0.5.31) */}
        <button type="button" className={`bar-btn bar-btn-usage${usageOpen ? ' is-on' : ''}`} tabIndex={barOn ? 0 : -1} aria-expanded={usageOpen} onClick={() => setUsageOpen((v) => !v)}>
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

      {officePop && (
        <FormPopup wide title={officePop === 'role' ? '역할 지도' : '클라우드 관계도'} onClose={() => setOfficePop(null)}>
          {renderOffice(officePop)}
        </FormPopup>
      )}
      {peek && <div className="office-peek-backdrop" onClick={() => setPeek(false)} aria-hidden="true" />}
      <main className={`layout${mini ? ' is-mini' : ''}${tiny ? ' is-tiny' : ''} tab-${tab === 'skills' ? 'settings tab-skills' : tab}`}>
        {/* 사무실을 숨긴 탭(휴대폰)에서만 보이는 버튼: 누르고 있는 동안 사무실이 뜬다 */}
        {/* 오른쪽 아래 '…'(v0.6.77 소유자 "위치는 오른쪽 아래, 위로 열림, 대화·에이전트 탭에서는 사무실이 2단으로 열리게"): 모든 탭 */}
        {(
          <span className="office-dock">
          {/* v0.6.74 소유자 "… 하나만, 열면 사무실·역할·클라우드": 평소엔 … 하나, 누르면 펼친다. 역할·클라우드는 열린 채로 팝업 */}
          {dockOpen && (
            <>
          <button type="button" className="office-dock-btn" onClick={() => { setOfficePop('role'); setDockOpen(false); }}>
            역할
          </button>
          <button type="button" className="office-dock-btn" onClick={() => { setOfficePop('cloud'); setDockOpen(false); }}>
            클라우드
          </button>
          {/* v0.7.24 소유자 "누르고 있는 동안 보기는 별로": 모든 탭에서 에이전트 탭처럼 눌러서 띄우고 다시 누르거나 바깥을 누르면 닫는다.
              대화·에이전트 탭은 그대로(사무실이 다 보이면 맨 위로, 줄었으면 띄우기). 사무실을 숨긴 탭(휴대폰)은 늘 띄운다 */}
          <button
            type="button"
            className={`office-hold${peek ? ' is-on' : ''}`}
            aria-pressed={peek}
            onClick={() => {
              setDockOpen(false);
              const hidden = tab !== 'chat' && tab !== 'agent' && window.matchMedia('(max-width: 1039px)').matches;
              if (!hidden && !stageRef.current.mini) window.scrollTo({ top: 0, behavior: 'smooth' });
              else setPeek((v) => !v);
            }}
          >
            사무실
          </button>
            </>
          )}
          <button type="button" className="office-dock-btn office-dock-more" aria-expanded={dockOpen} aria-label={dockOpen ? '닫기' : '사무실·역할·클라우드 보기'} onClick={() => setDockOpen((v) => !v)}>
            {dockOpen ? '✕' : '…'}
          </button>
          </span>
        )}
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
          <span className="office-map-btns" aria-label="사무실 지도">
            {picOpen && (
              <>
                <button type="button" onClick={() => { setOfficePop('role'); setPicOpen(false); }}>
                  역할
                </button>
                <button type="button" onClick={() => { setOfficePop('cloud'); setPicOpen(false); }}>
                  클라우드
                </button>
              </>
            )}
            <button type="button" aria-expanded={picOpen} aria-label={picOpen ? '닫기' : '역할·클라우드 보기'} onClick={() => setPicOpen((v) => !v)}>
              {picOpen ? '✕' : '…'}
            </button>
          </span>
          <p className="stage-note">
            캐릭터 위치와 말풍선은 업무 상태만 따릅니다. 진행 중이면 책상, 다른 방 일이면 도우러 가고, 열린 업무가 없으면 휴게실로 갑니다. 캐릭터를 누르면 상세가 열립니다.
          </p>
        </section>

        <aside className="panel">
          <nav className="tabs" role="tablist" ref={watchTabsHeight}>
            <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
              대화
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
            {/* 스킬 탭(v0.6.55 소유자 "설정 탭 왼쪽으로 skills 탭") */}
            <button type="button" role="tab" aria-selected={tab === 'skills'} onClick={() => setTab('skills')}>
              스킬
            </button>
            {/* 설정 탭(v0.6.42 소유자 "설정 탭 별도"): 프로젝트 순서·밝기·알림·사용량·계정 */}
            <button type="button" role="tab" aria-selected={tab === 'settings' || tab === 'team'} onClick={() => setTab('settings')}>
              설정
            </button>
          </nav>

          {/* 대화 탭 프로젝트 칩(v0.4.24): '모든 프로젝트' 없이 프로젝트만. 누르면 고르고 다시 누르면 풀린다(기본은 일반 대화). */}
          {tab === 'chat' && snap.projects.length > 0 && (
            <div className={`filters filters-scroll project-chips chat-chips${chatChipsOpen ? '' : ' is-folded'}`} role="group" aria-label="프로젝트(고르면 그 프로젝트 기준으로 대화)" ref={watchChipsHeight}>
              {/* 접기·펴기(v0.6.72 소유자 "대화의 프로젝트 나열은 꽉 찬 오른쪽 삼각형으로 접기 펴기"): 접으면 고른 것 하나만 */}
              <button type="button" className="chip-fold" aria-expanded={chatChipsOpen} aria-label={chatChipsOpen ? '프로젝트 목록 접기' : '프로젝트 목록 펴기'} onClick={() => setChatChipsOpen((v) => !v)}>
                {chatChipsOpen ? '▼' : '▶'}
              </button>
              {/* 기본 대화창(일반 대화, v0.4.88 소유자): 늘 맨 앞에, 프로젝트를 안 고르면 이 창 */}
              {(chatChipsOpen || chatProjectId === null) && (
              <button
                type="button"
                className="chip chip-project chip-general"
                aria-pressed={chatProjectId === null}
                onClick={() => setChatProject(null)}
                ref={chatProjectId === null ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
              >
                기본
              </button>
              )}
              {ordered.map((p) => {
                const n = turnsByProject.get(p.id) ?? 0;
                const on = chatProjectId === p.id;
                if (!chatChipsOpen && !on) return null;
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
            </div>
          )}

          {/* 업무 탭 프로젝트 칩(v0.4.18~). 고르면 내 차례·업무가 그 프로젝트 기준 */}
          {tab === 'tasks' && snap.projects.length > 1 && (
            <div className="filters filters-scroll project-chips" role="group" aria-label="프로젝트" ref={watchChipsHeight}>
              {[{ id: 'all', name: '모든 프로젝트' }, ...ordered].map((p) => {
                const n = p.id === 'all' ? turns.length : (turnsByProject.get(p.id) ?? 0);
                return (
                  <button key={p.id} type="button" className="chip chip-project" aria-pressed={pf === p.id} onClick={() => setProjectFilter(p.id)}>
                    {p.name}
                    {n > 0 && <span className="num num-turn">{n}</span>}
                  </button>
                );
              })}
              {/* 맨 끝 '수정': 설정 탭의 프로젝트 순서로 간다(v0.6.46) */}
              <button
                type="button"
                className="chip chip-project chip-edit"
                onClick={() => {
                  setTab('settings');
                  setTimeout(() => document.getElementById('project-order')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
                }}
              >
                수정
              </button>
            </div>
          )}

          {notice && <NoticeToast kind={notice.kind} text={notice.text} onClose={() => setNotice(null)} />}

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
                onAskClaude={
                  store.mode === 'supabase' && store.askClaudeResearch && !(snap.leave ?? []).includes('claude')
                    ? async (q) => {
                        const r = await store.askClaudeResearch!(q);
                        void store.load().then(setSnap, () => undefined);
                        return r;
                      }
                    : undefined
                }
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
                onCancelTask={cancelTask}
                skillPick={{ installed: installedSkillsOf, titleOf: skillTitleOf, save: (task, skills) => mutate(() => store.saveTask({ ...task, skills }), skills.length ? `개발에 쓸 스킬을 저장했어요: ${skills.join(', ')}` : '개발 스킬은 AI가 알아서 고르게 했어요.') }}
                onAutoDraft={store.mode === 'supabase' ? (t) => void draftSpec(t.id) : undefined}
                onClarify={store.mode === 'supabase' ? (t, q, a) => workflowActions.addClarification(t, q, a) : undefined}
                onShowTask={showTask}
                onAddFollowup={store.addFollowup ? (taskId, text) => { const t = snap.tasks.find((x) => x.id === taskId); return t && workflowActions.addFollowup ? workflowActions.addFollowup(t, text) : Promise.resolve(false); } : undefined}
                onApprove={quickApprove}
                onReviseSpec={async (t, feedback) => {
                  const v = deriveWorkflow(t, snap.workflow);
                  return v.spec && !v.aApproved ? workflowActions.decide(t, 'A', v.spec.revision, 'rejected', '', { feedback }) : false;
                }}
                onRedo={(t, feedback) => workflowActions.requestRevision(t, feedback)}
                onDeployApprove={async (t) => {
                  const v = deriveWorkflow(t, snap.workflow);
                  if (!v.result || !canApprove(v, 'C').ok) return false;
                  if (store.mode === 'local') return quickApprove(t, 'C');
                  const pc = latestPrCheck(t, snap.workflow);
                  if (!t.prUrl || !pc || !prCheckPasses(pc)) return false;
                  // 업무 카드의 [배포 승인 + 배포]와 같은 기록(decide가 승인 뒤 배포까지 한다)
                  return workflowActions.decide(t, 'C', v.result.revision, 'approved', '', { pr_url: t.prUrl, ci: { state: pc.ciState, merged: pc.merged, sha: pc.headSha } });
                }}
                onPickDraft={workflowActions.pickDesign}
                active={tab === 'chat'}
                onDrawDesign={workflowActions.drawDesign ? (t) => workflowActions.drawDesign!(t).then(() => undefined) : undefined}
                onResultImages={async (t, revision) => {
                  // v0.7.25: 결과 스크린샷(AI가 보낸 것)과 미노가 찍은 결과 화면(빌드·미리보기, 이 결과 뒤에 찍은 것만)
                  const out: { src: string; name: string }[] = [];
                  const result = snap.workflow.results.find((r) => r.taskId === t.id && r.revision === revision);
                  for (const a of attachmentsOf(snap.workflow.attachments, t.id, 'result', revision).filter((x) => isRaster(x.mime)).slice(0, 2)) {
                    const src = await store.attachmentUrl(a).catch(() => '');
                    if (src) out.push({ src, name: a.fileName });
                  }
                  if (out.length < 2 && store.siteCheck && result) {
                    const checks = await store.siteCheck.load(t.id).catch(() => ({}) as import('./domain/siteCheck').SiteChecks);
                    for (const c of [checks.build, checks.preview]) {
                      const after = c && c.result.checkedAt >= result.createdAt ? c.result.targets.find((x) => x.key === 'after') : undefined;
                      const shot = after?.shots.find((x) => x.size === 'mobile') ?? after?.shots[0];
                      if (c && shot && c.images[shot.file]) {
                        out.push({ src: c.images[shot.file], name: `결과 화면(${shot.size === 'mobile' ? '휴대폰' : 'PC'})` });
                        break;
                      }
                    }
                  }
                  return out.slice(0, 2);
                }}
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
              {/* 직접 입력은 팝업으로(v0.6.72) */}
              <button type="button" className="fold-btn direct-entry" onClick={() => setDirectOpen(true)}>
                ＋ 직접 입력
              </button>
              {directOpen && (
                <FormPopup title="업무 직접 입력" onClose={() => setDirectOpen(false)}>
                  <TaskForm
                    projects={snap.projects}
                    usage={snap.usage}
                    leave={snap.leave ?? []}
                    onSubmit={async (...args: Parameters<typeof addTask>) => {
                      const r = await addTask(...args);
                      setDirectOpen(false);
                      return r;
                    }}
                  />
                </FormPopup>
              )}
              {/* 상태 고르기는 드롭다운 하나로(v0.6.43 소유자 "필터가 두 줄") */}
              {(() => {
                const c = stateCounts(states, inProject.map((t) => t.id));
                const options: [Filter, string][] = [
                  ['open', `열린 업무 ${openCount}`],
                  ['st:turn', `${SIMPLE_LABEL.turn} ${c.turn}`],
                  ['st:working', `${SIMPLE_LABEL.working} ${c.working}`],
                  ['st:stuck', `멈춤·실패 ${c.stuck}`],
                  ['all', `전체 ${inProject.length}`],
                  ...(['queued', 'in_progress', 'review', 'blocked', 'done'] as TaskStatus[]).map((st) => [st, `${STATUS_LABEL[st]} ${counts(st)}`] as [Filter, string]),
                ];
                return (
                  <div className="task-view-bar">
                  <span className="view-toggle" role="group" aria-label="보기 방식">
                    <button type="button" aria-pressed={taskView === 'board'} onClick={() => setTaskView('board')}>
                      보드
                    </button>
                    <button type="button" aria-pressed={taskView === 'list'} onClick={() => setTaskView('list')}>
                      목록
                    </button>
                  </span>
                  {taskView === 'list' && (
                  <label className="filter-select">
                    <span className="sr-only">업무 상태</span>
                    <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                      {options.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  )}
                  </div>
                );
              })()}
              {taskView === 'board' ? (
                <TaskBoard
                  tasks={inProject}
                  states={states}
                  projects={projectById}
                  onOpen={(task) => {
                    setTaskView('list');
                    showTask(task.id);
                  }}
                />
              ) : visibleTasks.length === 0 ? (
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
                    simple={states.get(t.id)}
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
                    views={projectById.get(t.projectId) ? <ProjectViews project={projectById.get(t.projectId)!} maps={renderMaps} check={renderCheck} /> : undefined}
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
                        projectRules={[...withBaseRules((snap.projectRules ?? []).filter((r) => r.projectId === t.projectId).map((r) => r.rule)), ...skillPickRule(t.skills)]}
                        reviews={(snap.workflow.reviews ?? []).filter((r) => r.taskId === t.id)}
                        followups={(snap.workflow.followups ?? []).filter((f) => f.taskId === t.id)}
                        designDrafts={(snap.workflow.designDrafts ?? []).filter((d) => d.taskId === t.id)}
                        designPicks={(snap.workflow.designPicks ?? []).filter((d) => d.taskId === t.id)}
                        timeline={taskTimeline(t.id, snap.workflow)}
                        results={snap.workflow.results.filter((r) => r.taskId === t.id)}
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
                    onCancel={cancelTask}
                    onCopy={copyHandoff}
                  />
                ))
              )}
              {taskView === 'list' && filter === 'open' && counts('done') > 0 && (
                <button type="button" className="btn btn-small btn-ghost done-link" onClick={() => setFilter('done')}>
                  완료된 업무 {counts('done')}건 보기
                </button>
              )}
            </div>
          )}

          {tab === 'projects' && (
            <ProjectPanel
              onMakeSkill={
                store.skills
                  ? (p, issue) => {
                      setSkillPrefill((cur) => ({ what: `${p.name}에서 반복되는 실수 막기: ${issue}`.slice(0, 200), rules: issue, n: (cur?.n ?? 0) + 1 }));
                      setTab('skills');
                    }
                  : undefined
              }
              setupIssuesOf={(p) => setupIssues(p.id, snap.tasks, snap.workflow)}
              uiCheckOf={uiCheckHas ? (p) => uiCheckHas[p.id] ?? false : undefined}
              onInstallUiCheck={
                store.installUiCheck
                  ? async (p) => {
                      try {
                        await store.installUiCheck!([p.id]);
                        say('ok', `${p.name}에 UI 코드 검사를 넣기 시작했어요(Actions, 1분 안팎). 끝나면 준비 칸이 체크돼요.`);
                        window.setTimeout(() => setUiCheckKick((n) => n + 1), 90_000);
                      } catch (e) {
                        say('error', `UI 코드 검사를 넣지 못했어요: ${(e as Error).message}`);
                      }
                    }
                  : undefined
              }
              projects={ordered}
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
              renderWiki={store.wiki ? (p) => <WikiView projectId={p.id} api={store.wiki!} /> : undefined}
              renderSkills={
                store.skills && store.skillMap
                  ? (p) => (
                      <ProjectSkills
                        projectId={p.id}
                        load={() => loadSkillsData()}
                        ver={skillsVer}
                        onManage={(skill) => {
                          // 팝업을 닫고(뒤 화면 잠금도 풀고) 스킬 탭으로. 이름이 있으면 그 스킬의 넣기 창을 연다
                          document.querySelectorAll<HTMLDetailsElement>('.project-sections > details[open]').forEach((d) => (d.open = false));
                          document.documentElement.classList.remove('popup-open');
                          if (skill) setSkillToInstall((cur) => ({ name: skill, n: (cur?.n ?? 0) + 1 }));
                          setTab('skills');
                        }}
                      />
                    )
                  : undefined
              }
              renderDesign={store.designStandard ? (p) => <DesignStandard approved={p.designMd ?? ''} draft={p.designDraft ?? ''} api={{ draft: (refs) => store.designStandard!.draft(p.id, refs), approve: async (md) => { await store.designStandard!.approve(p.id, md); await reload(); } }} /> : undefined}
              renderHealth={renderCheck}
              renderMaps={renderMaps}
              renderStructure={renderStructure}
              renderHistory={(p) => <ProjectHistory snap={snap} projectId={p.id} loadChat={(f, t) => store.loadChat(f, t)} onOpenTask={(id) => showTask(id)} />}
            />
          )}
          {tab === 'projects' && <DevlogPanel snap={snap} loadChat={(f, t) => store.loadChat(f, t)} deleteChat={(f, t, p) => store.deleteChat(f, t, p)} onCopy={workflowActions.copy} />}

          {tab === 'agent' && <ReviewLog reviews={snap.workflow.reviews ?? []} tasks={snap.tasks} onOpenTask={(t) => showTask(t.id)} />}
          {tab === 'agent' && (
            <AgentRoster
              snap={snap}
              onLinearProbe={store.mode === 'supabase' ? () => store.linearProbe() : undefined}
              onCredits={store.searchCredits ? () => store.searchCredits!() : undefined}
              onSetLimit={(kind, n) => void mutate(() => store.setAgentLimit(kind, n), `동시 작업 상한을 ${n}개로 바꿨습니다.`)}
              selected={selected}
              onSelect={(id) => setSelected(id)}
              serverMode={store.mode === 'supabase'}
              onOpenTask={(t) => showTask(t.id)}
            />
          )}

          {/* 설정(v0.6.43 소유자: 사용량 → 프로젝트 순서 → 팀 관리 → 알림 → 화면 → 계정, 팀 관리 탭을 여기로) */}
          {tab === 'skills' && store.skills && (
            <SkillsPanel
              load={(force) => (store.skillMap ? loadSkillsData(force).then((d) => d.files) : store.skills!())}
              usage={skillUsage(snap.workflow.results)}
              prefill={skillPrefill}
              installRequest={skillToInstall}
              renderMap={
                skillsProject ? (
                  <div className="project-sections skill-sections">
                    <details className="project-rules project-maps" onToggle={(e) => setSkillMapsOpen((e.currentTarget as HTMLDetailsElement).open)}>
                      <summary>구조 보기</summary>
                      {skillMapsOpen && renderMaps(skillsProject)}
                    </details>
                    {renderCheck && (
                      <details className="project-rules project-health" onToggle={(e) => setSkillCheckOpen((e.currentTarget as HTMLDetailsElement).open)}>
                        <summary>점검</summary>
                        {skillCheckOpen && renderCheck(skillsProject)}
                      </details>
                    )}
                  </div>
                ) : undefined
              }
              projects={snap.projects
                .filter((p) => p.repo && !p.sample && p.repo.toLowerCase() !== 'minho-nim/minlab')
                .map((p) => ({ id: p.id, name: p.name, repo: p.repo! }))}
              status={store.skillStatus ? (name) => store.skillStatus!(name) : undefined}
              install={
                store.installSkill
                  ? (name, ids, mode) => {
                      skillsData.current = null; // 넣기·빼기 뒤에는 프로젝트 상태를 새로 읽게
                      return store.installSkill!(name, ids, mode);
                    }
                  : undefined
              }
              refreshAll={store.refreshSkills ? () => store.refreshSkills!() : undefined}
              canRequest={!!officeProject}
              onSend={(text) => {
                if (!officeProject) return;
                // 스킬 업무는 이 저장소(minoffia) 프로젝트 대화창에서 접수한다(결과는 늘 PR·올리기 승인). 입력 창에서 쓴 글을 바로 보낸다(v0.6.57)
                setChatProject(officeProject.id);
                setTab('chat');
                setDraft((d) => ({ text, n: (d?.n ?? 0) + 1, send: true }));
              }}
            />
          )}
          {(tab === 'settings' || tab === 'team') && (
            <section className="settings" aria-label="설정">
              <div className="settings-box">
                <h3>오늘 사용량</h3>
                {usageList}
              </div>
              {/* v0.6.44 소유자: 팀 관리를 프로젝트 순서 앞으로, 키 상태는 따로, 알림·화면은 작은 칸 둘로 */}
              <div className="settings-box">
                <h3>팀 관리(근무·휴가)</h3>
                <TeamPanel snap={snap} onSetLeave={(agent, onLeave) => setLeaveNow(agent, onLeave)} />
              </div>
              <div className="settings-box" id="project-order">
                <ProjectOrder projects={ordered} onSave={store.reorderProjects ? (ids) => mutate(() => store.reorderProjects!(ids)) : undefined} />
              </div>
              <div className="settings-pair">
                {store.mode === 'supabase' && (
                  <div className="settings-box settings-mini">
                    <h3>휴대폰 알림</h3>
                    <PushToggle store={store} />
                  </div>
                )}
                <div className="settings-box settings-mini">
                  <h3>화면</h3>
                  <ThemeToggle />
                </div>
              </div>
              {store.keyStatus && (
                <div className="settings-box">
                  <h3>AI 키 상태</h3>
                  <KeyStatusList load={() => store.keyStatus!()} />
                </div>
              )}
              <div className="settings-box">
                <h3>계정</h3>
                {store.mode === 'local' ? (
                  <p className="muted small">로컬 데모 · 이 기기에만 저장</p>
                ) : (
                  <p className="small">
                    {session?.user.email}{' '}
                    <button type="button" className="link-btn" onClick={() => void client?.auth.signOut()}>
                      로그아웃
                    </button>
                  </p>
                )}
              </div>
            </section>
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
