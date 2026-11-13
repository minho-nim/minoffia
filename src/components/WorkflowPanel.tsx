import { timelineTime } from '../domain/timeline';
import { PART_LABEL, PASS_SCORE, VERDICT_LABEL, WEIGHTS, type PanelEntry, type Part } from '../domain/review';
import { ArchifyView } from './ArchifyView';
import { uncoveredRequirements } from '../domain/requirements';
import { recommendedReply } from '../domain/recommend';
import type { ResultReview } from '../domain/workflow-types';
import { AGENT_BY_ID } from '../domain/agents';
import { useEffect, useState, type ReactNode } from 'react';
import { attachmentBlocker, attachmentsOf, MAX_PROTOTYPE_FILES, MAX_REQUEST_FILES, MAX_RESULT_FILES, ROLES_FOR, type Attachment, type AttachmentKind, type ImageAnalysis } from '../domain/attachments';
import { AttachmentGallery, ImagePicker, type PendingImage } from './Attachments';
import { RequestContext } from './RequestContext';
import { clarificationsOf, linksOf, type Clarification, type LinkRef } from '../domain/requestContext';
import { ADAPTER_STATE_LABEL, adapterFor } from '../domain/adapters';
import { isSlimProject } from '../data/slimRepos';
import { buildCodexHandoff, buildCodexPrRequest, buildPrototypeHandoff } from '../domain/handoffV2';
import type { Project, Task } from '../domain/types';
import { siteUrl } from '../domain/types';
import { CRITERIA_TAGS, joinCriteria, nextTag, splitCriteria, type CriterionLine } from '../domain/criteriaTag';
import { startBlocker, waitingOn } from '../domain/concurrency';
import { canApprove, canRequestRevision, prCheckPasses, resultWithoutBranch, type WorkflowView } from '../domain/workflow';
import { WaitMap } from './WaitMap';
import { FileTreeView } from './FileTreeView';
import { diffStats } from '../domain/fileTree';
import { mergeDanger } from '../domain/mergeDanger';
import type { AgentAssignment, AssigneePreference, Deployment, Gate, Intent, PrCheck } from '../domain/workflow-types';
import { DEVELOPMENT_MODE_LABEL, DISPATCH_STATUS_LABEL, GATE_LABEL, INTENT_LABEL } from '../domain/workflow-types';
import { addDesignWord, DESIGN_WORDS } from '../domain/designWords';
import { DesignCheckView } from './DesignCheckView';
import { SiteCheckView } from './SiteCheckView';
import { canCompare, COMPARE_WHY, compareTarget, PREF_LABEL, quotaHit, reassignTargets, staleStart } from '../domain/reassign';

const AGENT_NAME: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
import { OFFICE_REPOS } from '../domain/smallTask';
import { nowInfo, type NowAction } from '../domain/nowAction';
import { SIMPLE_LABEL } from '../domain/simpleState';

export interface SpecFields {
  intent: Intent;
  finalPrompt: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  answer: string;
}

export interface ResultFields {
  workItemId: string;
  summary: string;
  diff: string;
  testLog: string;
  remainingIssues: string;
}

export interface WorkflowActions {
  copy: (text: string) => Promise<boolean>;
  /** 바뀐 곳 구조도(Archify) 보기(v0.5.43, 서버 모드만) */
  archify?: (taskId: string, revision: number) => Promise<{ html?: string; started?: boolean }>;
  /** 담당 바꾸기·한도 넘기기(v0.5.73): 그 작업 담당만 바꾼 새 계획 버전을 만든다(실행 승인은 다시) */
  reassign?: (task: Task, a: AgentAssignment, to: AssigneePreference, why: string) => Promise<boolean>;
  /** 두 AI 비교에서 고른 결과를 최신 결과로(같은 변경을 새 버전으로 다시 저장, v0.6.54) */
  pickResult?: (task: Task, r: import('../domain/workflow-types').ResultPackage) => Promise<boolean>;
  /** 디자인 자동 검사(v0.5.56): 미리보기 주소가 있는 결과만 */
  designCheck?: { load(taskId: string, revision: number): Promise<import('../domain/designCheck').DesignReport | null>; start(taskId: string, revision: number): Promise<void> };
  /** 화면 확인(v0.6.9): 실제 미리보기·운영 사이트 */
  siteCheck?: { load(taskId: string): Promise<import('../domain/siteCheck').SiteChecks>; start(taskId: string, kind: 'preview' | 'production'): Promise<void> };
  /** 성공하면 true. 실패 이유는 App이 알림으로 보여준다. */
  saveSpec: (task: Task, fields: SpecFields) => Promise<boolean>;
  /** Gemini 무료 기획서 초안(서버가 새 버전으로 저장) */
  draftSpec: (task: Task) => Promise<boolean>;
  /** Gemini 무료 HTML 견본(견본 먼저 계획) */
  makePrototype: (task: Task) => Promise<boolean>;
  decide: (task: Task, gate: Gate, revision: number, decision: 'approved' | 'rejected', workItemId?: string, scope?: Record<string, unknown>) => Promise<boolean>;
  dispatchPm: (task: Task, acknowledgeRetry: boolean) => Promise<void>;
  /** 작은 일로 바로 배정한 것을 PM에게 다시 나눠 맡기기(v0.5.20). Claude가 안 되면 Gemini가 대신 */
  replanByPm?: (task: Task) => Promise<void>;
  /** Claude 보조 개발: 실행 승인한 Claude 작업을 서버가 두 번째 루틴으로 시작(Supabase 모드만) */
  startClaudeDev?: (assignment: AgentAssignment, acknowledgeRetry: boolean) => Promise<boolean>;
  /** Codex를 Linear로 맡기기(v0.5.2): 지시서는 패널이 만들어 넘긴다 */
  startCodexLinear?: (assignment: AgentAssignment, acknowledgeRetry: boolean, text: string) => Promise<boolean>;
  /** PR 다시 열기(v0.6.31): 결과 승인 뒤 PR이 안 열렸을 때 GitHub Actions로 다시 */
  openPr?: (task: Task) => Promise<void>;
  /** 3중 평가(v0.7.8): 동료 평가를 기다리지 않고 판정 */
  finishReview?: (task: Task, resultRevision: number) => Promise<void>;
  /** Codex 앱에 붙여 넣을 지시서에 결과 자동 제출 절을 붙인다(실패하면 빈 문자열, v0.6.21) */
  codexManualSection?: (assignment: AgentAssignment) => Promise<string>;
  /** Codex 소식 손으로 다시 읽기(웹훅이 안 올 때, v0.5.3) */
  refreshCodex?: (assignment: AgentAssignment) => Promise<void>;
  /** 견본 먼저: 견본 승인 + 견본 작업 끝냄 */
  approvePrototype: (task: Task) => Promise<boolean>;
  /** 두 견본 중 하나 고르기(나머지 지우고 P 승인, v0.4.94) */
  pickPrototype?: (task: Task, keep: Attachment) => Promise<void>;
  importPlan: (task: Task, text: string) => Promise<string[] | null>;
  recordStart: (assignment: AgentAssignment, url: string) => Promise<boolean>;
  /** 시작한 작업을 중단으로 기록(동시 실행 1개 제한을 푼다) */
  stopAssignment: (assignment: AgentAssignment) => Promise<boolean>;
  /** 결과 패키지와 스크린샷(결과를 저장한 뒤 올린다) */
  addResult: (task: Task, fields: ResultFields, images?: PendingImage[]) => Promise<boolean>;
  setPrUrl: (task: Task, url: string) => Promise<boolean>;
  /** 서버가 GitHub에서 PR·CI를 확인(Supabase 모드만) */
  checkPr?: (task: Task) => Promise<boolean>;
  /** 배포 승인 뒤 서버가 release를 앞당긴다(Supabase 모드만) */
  /** allowExtra = 같이 나갈 다른 변경을 확인하고 배포, quiet = 자동 재시도(알림 없음) */
  deploy?: (task: Task, allowExtra?: boolean, quiet?: boolean) => Promise<boolean>;
  /** 결과 검토 → Claude PM 수정 요청 */
  requestRevision: (task: Task, feedback: string) => Promise<boolean>;
  /** 개발 중 추가 요청(v0.6.13) */
  addFollowup?: (task: Task, text: string) => Promise<boolean>;
  attachmentUrl: (attachment: Attachment) => Promise<string>;
  /** 실패한 파일의 이유 목록을 돌려준다(빈 배열 = 모두 성공) */
  addAttachments: (task: Task, kind: AttachmentKind, resultRevision: number | null, files: File[]) => Promise<string[]>;
  updateAttachment: (attachment: Attachment) => Promise<boolean>;
  deleteAttachment: (attachment: Attachment) => Promise<boolean>;
  moveAttachment: (task: Task, id: string, delta: -1 | 1) => Promise<boolean>;
  /** 요청 자료 이미지 Gemini 분석(Supabase 모드만) */
  analyzeImage?: (attachment: Attachment) => Promise<boolean>;
  /** 서버가 링크를 읽어 기록한다 */
  readLink: (task: Task, url: string) => Promise<boolean>;
  deleteLink: (link: LinkRef) => Promise<boolean>;
  addClarification: (task: Task, question: string, answer: string) => Promise<boolean>;
  /** 업무 카드에서 확인 질문에 답했을 때 대화창(기본·프로젝트)에도 같은 문답을 남긴다(v0.4.90) */
  echoAnswer?: (task: Task, answer: string) => void;
}

interface Props {
  /** 이 칸으로 바로 가기(내 차례 '보기'·카드의 ?표시, v0.4.86). n이 바뀔 때마다 다시 간다 */
  jump?: { step: string; n: number };
  task: Task;
  project: Project | undefined;
  view: WorkflowView;
  /** 이 업무의 첨부(요청 자료·결과 스크린샷) */
  attachments: Attachment[];
  /** 이 업무 이미지의 Gemini 분석 */
  analyses: ImageAnalysis[];
  /** 모든 업무의 배정(AI별 동시 작업 상한 규칙에 쓴다) */
  allAssignments: AgentAssignment[];
  /** 이 업무 PR 주소에 대한 최신 서버 확인 */
  prCheck?: PrCheck | null;
  /** 이 업무의 최신 운영 배포 기록 */
  deployment?: Deployment | null;
  /** AI별 동시 작업 상한 */
  agentLimits?: Partial<Record<'codex' | 'claude' | 'gemini', number>>;
  /** 모든 업무의 링크·확인 질문(이 업무 것만 골라 쓴다) */
  links: LinkRef[];
  clarifications: Clarification[];
  /** 이 프로젝트에서 지켜야 할 것(Codex 지시서에 넣는다, v0.4.57) */
  projectRules?: string[];
  /** 이 업무 결과의 점수 평가(v0.4.64) */
  reviews?: ResultReview[];
  /** 링크 읽기는 Supabase 연결 때만 */
  canReadLinks: boolean;
  /** null이면 PM 전송 가능 */
  dispatchBlocker: string | null;
  actions: WorkflowActions;
  /** 이 업무의 개발 중 추가 요청(v0.6.13) */
  followups?: import('../domain/workflow-types').Followup[];
  /** 이 업무 기록 타임라인(v0.6.54) */
  timeline?: import('../domain/timeline').TimelineEvent[];
  /** 이 업무의 모든 결과(두 AI 비교, v0.6.54) */
  results?: import('../domain/workflow-types').ResultPackage[];
}

const CI_LABEL: Record<PrCheck['ciState'], string> = { success: '성공', failure: '실패', pending: '진행 중', none: '없음' };

/** 진행 단계(우리말만, v0.4.22). 누르면 아래 그 칸으로 간다 */
const STEPS = [
  { key: 'plan', label: '기획서' },
  { key: 'A', label: '기획 승인' },
  { key: 'pm', label: '업무 계획' },
  { key: 'E', label: '실행·개발' },
  { key: 'B', label: '결과·올리기' },
  { key: 'C', label: '배포' },
] as const;

function stepIndex(view: WorkflowView): number {
  if (!view.spec || view.spec.intent === 'question' || view.spec.intent === 'ambiguous') return 0;
  if (!view.aApproved) return 1;
  if (!view.planCurrent && !view.result) return 2;
  if (!view.result) return 3;
  if (!view.bApproved) return 4;
  if (!view.cApproved) return 5;
  return 6;
}

const EMPTY_SPEC: SpecFields = { intent: 'change_request', finalPrompt: '', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '' };

/**
 * 기획서의 완료 기준(v0.6.0, 소유자 "기획 승인 화면에서 태그 눌러 바꾸기"): 줄마다 [● 필수] 태그를 누르면 필수 → 권장 → 선택.
 * 기획 승인(A) 전에만 바꿀 수 있고, 바꾼 뒤 '중요도 저장'을 누르면 기획서 새 버전이 된다(감사 기록 유지).
 */
function CriteriaList({ text, editable, onSave }: { text: string; editable: boolean; onSave: (next: string) => Promise<void> }) {
  const [draft, setDraft] = useState<CriterionLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const lines = draft ?? splitCriteria(text);
  const icon = (tag: string | null) => CRITERIA_TAGS.find((c) => c.tag === tag);
  return (
    <div className="small">
      완료 기준{editable ? <span className="muted"> · 태그를 누르면 필수 → 권장 → 선택</span> : null}
      <ul className="crit-list">
        {lines.map((l, i) => {
          const c = icon(l.tag);
          return (
            <li key={i}>
              <button
                type="button"
                className={`criteria-chip criteria-${c?.cls ?? 'none'}`}
                disabled={!editable || saving}
                title={c?.desc ?? '중요도 없음'}
                aria-label={`${l.body} 중요도: ${l.tag ?? '없음'}${editable ? ', 눌러서 바꾸기' : ''}`}
                onClick={() => setDraft(lines.map((x, j) => (j === i ? { ...x, tag: nextTag(x.tag) } : x)))}
              >
                <span aria-hidden="true">{c?.icon ?? '·'}</span> {l.tag ?? '보통'}
              </button>
              <span>{l.body}</span>
            </li>
          );
        })}
      </ul>
      {draft && joinCriteria(draft) !== text && (
        <span className="form-actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
            되돌리기
          </button>
          <button
            type="button"
            className="btn btn-small btn-primary"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(joinCriteria(draft)).finally(() => {
                setSaving(false);
                setDraft(null);
              });
            }}
          >
            중요도 저장(새 버전)
          </button>
        </span>
      )}
    </div>
  );
}

function FollowupBox({ followups, busy, canRedo, onAdd, onRedo }: { followups: import('../domain/workflow-types').Followup[]; busy: boolean; canRedo: boolean; onAdd: (text: string) => Promise<unknown>; onRedo: (n: number) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const pending = followups.filter((f) => !f.usedAt);
  const sent = followups.filter((f) => f.usedAt);
  return (
    // v0.6.37(소유자 "이거 닫아줘, 열려 있네 계속"): 기본은 접어 두고, 대기 중인 추가 요청이 있으면 펼친다
    <details className="wf-followups" open={pending.length > 0}>
      <summary className="small">
        <b>개발 중 추가 요청</b>{' '}
        <span className="muted">{pending.length ? `${pending.length}개 대기 — 다음 다시 개발 때 함께 보내요` : '눌러서 적기(다음 라운드에 함께 보내요)'}</span>
      </summary>
      {pending.length > 0 && (
        <ul className="wf-followup-list">
          {pending.map((f) => (
            <li key={f.id}>{f.text}</li>
          ))}
        </ul>
      )}
      <span className="wf-inline">
        <textarea rows={1} value={text} maxLength={2000} placeholder="예: 버튼 색도 파란색으로" aria-label="개발 중 추가 요청" onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          className="btn btn-small"
          disabled={busy || !text.trim()}
          onClick={() => void onAdd(text.trim()).then(() => setText(''))}
        >
          추가
        </button>
      </span>
      {canRedo && pending.length > 0 && (
        <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void onRedo(pending.length)}>
          추가 요청 {pending.length}개로 다시 개발
        </button>
      )}
      {sent.length > 0 && (
        <details className="small">
          <summary className="muted">보낸 추가 요청 {sent.length}개</summary>
          <ul className="wf-followup-list">
            {sent.map((f) => (
              <li key={f.id} className="muted">{f.text}</li>
            ))}
          </ul>
        </details>
      )}
    </details>
  );
}

/** 같은 AI로 다시(담당 그대로 새 계획 버전) */
const samePref = (assignee: string): AssigneePreference => (assignee === 'claude' ? 'claude_support' : 'codex_primary');

export function WorkflowPanel({ jump, task, project, view, attachments, analyses, allAssignments, agentLimits, prCheck, deployment, links, clarifications, projectRules = [], reviews = [], followups = [], canReadLinks, dispatchBlocker, actions, timeline, results = [] }: Props) {
  const current = stepIndex(view);
  // 지나간 진행 단계는 제목만 남기고 접는다(v0.4.76, 소유자). 제목이나 위 단계 버튼을 누르면 펼친다.
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [qaReply, setQaReply] = useState('');
  const [pmReply, setPmReply] = useState('');
  // 지금 단계(와 그 뒤)도 소유자가 접을 수 있다(v0.5.23). 지난 단계는 기본으로 접혀 있고 누르면 편다.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const flip = (set: (f: (cur: Set<string>) => Set<string>) => void, key: string) =>
    set((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // 기획 승인(A)을 기다릴 때는 바로 앞 기획서 칸을 펼쳐 둔다(v0.5.26 소유자 "기획 승인 내용이 안 보이네": 승인할 내용이 접혀 있었음)
  const past = (key: string, idx: number) => idx < current && !(key === 'plan' && current === 1);
  const toggle = (key: string, idx: number) => flip(past(key, idx) ? setUnfolded : setClosed, key);
  const folded = (key: string, idx: number) => (past(key, idx) ? !unfolded.has(key) : closed.has(key));
  // 바로 가기: 그 칸을 펼치고(지난 단계로 접혀 있어도) 화면에 보이게 내린다. 확인 질문(qa)은 기획 칸 안에 있다.
  useEffect(() => {
    if (!jump) return;
    // 확인 질문은 기획 칸 또는 PM 칸(PM이 계획을 보류하고 물은 경우) 안에 있다
    const keys = jump.step === 'qa' ? ['plan', 'pm'] : [jump.step];
    setMoreOpen(true);
    setUnfolded((cur) => new Set([...cur, ...keys]));
    setClosed((cur) => new Set([...cur].filter((k) => !keys.includes(k))));
    const t = window.setTimeout(() => {
      const el = document.getElementById(`wf-${task.id}-${jump.step}`);
      // 업무 카드의 '진행 단계'가 접혀 있으면 먼저 편다
      const box = el?.closest('details');
      if (box && !box.open) box.open = true;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n]);
  const fold = {
    cls: (key: string, idx: number) => `wf-section${past(key, idx) ? ' is-past' : ''}${folded(key, idx) ? ' is-folded' : ''}`,
    head: (key: string, idx: number, title: ReactNode) => (
      <h4>
        <button type="button" className="wf-fold" aria-expanded={!folded(key, idx)} onClick={() => toggle(key, idx)}>
          <span aria-hidden="true">{folded(key, idx) ? '▸' : '▾'}</span> {title}
          {past(key, idx) ? <span className="wf-fold-done">지난 단계 ✓</span> : idx === current ? <span className="wf-fold-done wf-fold-now">지금 단계</span> : null}
        </button>
      </h4>
    ),
  };
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<SpecFields>(EMPTY_SPEC);
  const [planText, setPlanText] = useState('');
  const [planErrors, setPlanErrors] = useState<string[] | null>(null);
  const [startUrl, setStartUrl] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultFields>({ workItemId: '', summary: '', diff: '', testLog: '', remainingIssues: '' });
  const [showResultForm, setShowResultForm] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [ciChecked, setCiChecked] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 단계별 자세히(v0.6.27): 기본은 접힘. 바로 가기·버튼으로 칸을 열 때 함께 편다 */
  const [moreOpen, setMoreOpen] = useState(false);
  const [aFeedback, setAFeedback] = useState('');
  const [showAFeedback, setShowAFeedback] = useState(false);
  const [revisionText, setRevisionText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // 실패한 Claude 보조 개발을 다시 시작하기 전 '세션 기록 확인함'
  const [devAck, setDevAck] = useState<Record<string, boolean>>({});
  const [resultImages, setResultImages] = useState<PendingImage[]>([]);
  const requestImages = attachmentsOf(attachments, task.id, 'request');
  const analysisById = new Map(analyses.map((a) => [a.attachmentId, a]));
  const taskLinks = linksOf(links, task.id);
  // 견본 먼저 계획의 견본(최신 계획 버전)
  const prototypeFiles = view.plan ? attachmentsOf(attachments, task.id, 'prototype', view.plan.planRevision) : [];
  const taskQa = clarificationsOf(clarifications, task.id);
  const resultShots = view.result ? attachmentsOf(attachments, task.id, 'result', view.result.revision) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const copy = async (key: string, text: string) => {
    const ok = await actions.copy(text);
    setCopied(ok ? key : null);
    if (ok) window.setTimeout(() => setCopied(null), 2500);
  };

  const startEdit = () => {
    setSpec(
      view.spec
        ? {
            intent: view.spec.intent,
            finalPrompt: view.spec.finalPrompt,
            changeScope: view.spec.changeScope,
            preserveConstraints: view.spec.preserveConstraints,
            testCriteria: view.spec.testCriteria,
            answer: view.spec.answer,
          }
        : EMPTY_SPEC,
    );
    setEditing(true);
  };

  const aCheck = canApprove(view, 'A');
  const bCheck = canApprove(view, 'B');
  const cCheck = canApprove(view, 'C');
  // 결과를 만든 Codex 작업(결과 승인 뒤 같은 창에 PR 요청을 붙여넣는다)
  const codexItem = view.assignments.find((a) => a.assignee === 'codex');
  // Claude 보조 개발 세션(서버가 시작함). Codex 작업이 없으면 이 세션에 PR 요청을 붙여넣는다.
  const claudeItem = view.assignments.find((a) => a.assignee === 'claude' && a.providerTaskUrl);
  const failed = task.dispatch.state === 'failed';
  // 수정 요청이 있으면, 요청 뒤에 보냈을 때만 '보냄'으로 본다.
  const sentThisRevision =
    !!view.spec &&
    task.dispatchSpecRevision === view.spec.revision &&
    task.dispatch.state !== 'failed' &&
    (!view.pendingRevision || (!!task.dispatch.at && task.dispatch.at > view.pendingRevision.createdAt));
  const revisionCheck = canRequestRevision(view);

  // 지금 할 일(v0.6.27 소유자 "너무 복잡해"): 맨 위에 상태 한 줄과 버튼 하나. 단계별 기록은 '자세히'에 접어 둔다.
  const now = nowInfo(view, {
    done: task.status === 'done',
    review: view.result ? reviews.find((r) => r.resultRevision === view.result!.revision) ?? null : null,
    ciPassed: actions.checkPr || prCheck ? prCheckPasses(prCheck ?? null) && !!task.prUrl : false,
    prUrl: task.prUrl,
    deploy: deployment ? { ok: deployment.ok, error: deployment.error } : null,
  });
  const goTo = (step: string) => {
    const keys = step === 'qa' ? ['plan', 'pm'] : [step];
    setMoreOpen(true);
    setUnfolded((cur) => new Set([...cur, ...keys]));
    setClosed((cur) => new Set([...cur].filter((k) => !keys.includes(k))));
    window.setTimeout(() => document.getElementById(`wf-${task.id}-${step === 'qa' ? 'plan' : step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  const doNow = (a: NowAction) => {
    if (a.kind === 'jump') return goTo(a.step);
    if (a.kind === 'deploy') return void run(() => (actions.deploy ? actions.deploy(task, (deployment?.error ?? '').startsWith('확인 필요')) : Promise.resolve()));
    if (a.kind === 'openPr') return void run(() => actions.openPr ? actions.openPr(task) : Promise.resolve());
    if (a.kind === 'approveA') return void run(() => actions.decide(task, 'A', view.spec!.revision, 'approved'));
    if (a.kind === 'approveB') return void run(() => actions.decide(task, 'B', view.result!.revision, 'approved', '', { result_sha256: view.result!.sha256 }));
    return void run(async () => {
      const ok = await actions.decide(task, 'C', view.result!.revision, 'approved', '', { pr_url: task.prUrl, ci: prCheck ? { state: prCheck.ciState, merged: prCheck.merged, sha: prCheck.headSha } : 'manual' });
      if (ok && actions.deploy) await actions.deploy(task);
    });
  };

  return (
    <div className="wf">
      <div className={`wf-now is-${now.tone}`} role="status">
        <p>
          <span className={`wf-now-tag is-${now.tone}`}>{SIMPLE_LABEL[now.tone]}</span> {now.text}
        </p>
        {(now.primary || now.secondary) && (
          <p className="wf-now-actions">
            {now.primary && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => doNow(now.primary!.action)}>
                {now.primary.label}
              </button>
            )}
            {now.secondary && (
              <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => doNow(now.secondary!.action)}>
                {now.secondary.label}
              </button>
            )}
          </p>
        )}
      </div>
      {timeline && timeline.length > 0 && (
        // 기록(v0.6.54, 실행 추적): 누가 언제 무엇을 했는지 시간순. 넘겨주기·실패 이유도 여기서 보인다
        <details className="wf-timeline">
          <summary>
            기록 {timeline.length}
            {timeline.some((e) => e.tone === 'bad') ? ' ⚠' : ''}
          </summary>
          <ol>
            {timeline.map((e, i) => (
              <li key={i} className={`tl-${e.tone}`}>
                <time dateTime={e.at}>{timelineTime(e.at)}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {(() => {
        // 두 AI 비교 결과(v0.6.54): Codex·Claude 결과가 둘 다 있으면 AI마다 최신 결과와 점수를 나란히. 최신이 아닌 쪽은 '이 결과로 정하기'
        if (view.bApproved) return null;
        const aiOf = (src: string) => (src.startsWith('codex') ? 'codex' : src.startsWith('claude') ? 'claude' : '');
        const latestBy = new Map<string, import('../domain/workflow-types').ResultPackage>();
        for (const r of [...results].sort((x, y) => x.revision - y.revision)) if (aiOf(r.source)) latestBy.set(aiOf(r.source), r);
        if (latestBy.size < 2 || !view.result) return null;
        const top = view.result.revision;
        return (
          <div className="wf-compare">
            <b>두 AI 비교</b>
            <ul>
              {[...latestBy.entries()].map(([ai, r]) => {
                const rv = reviews.find((x) => x.resultRevision === r.revision);
                const score = rv?.total == null ? '채점 전' : `${rv.total}점${rv.crossTotal != null ? ` · 교차 ${rv.crossTotal}점` : ''}`;
                return (
                  <li key={ai}>
                    <span>
                      {AGENT_NAME[ai]} · 결과 v{r.revision} · {score}
                      {r.revision === top ? ' (지금 올릴 결과)' : ''}
                    </span>
                    {r.revision !== top && actions.pickResult && (
                      <button type="button" className="btn btn-small btn-ghost" disabled={busy || view.waitingWork.length > 0} onClick={() => void run(() => actions.pickResult!(task, r))}>
                        이 결과로 정하기
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="muted small">올리기 승인은 '지금 올릴 결과'로 해요. 다른 쪽이 낫다면 '이 결과로 정하기'를 누르면 같은 변경이 새 버전으로 저장되고 다시 채점돼요.</p>
          </div>
        );
      })()}
      <details className="wf-more" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
        <summary>단계별 자세히</summary>
      <div className="wf-head">
        <ol className="wf-steps" aria-label="진행 단계(누르면 그 칸으로)">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < current ? 'is-done' : i === current ? 'is-current' : ''}>
              <button
                type="button"
                onClick={() => {
                  setUnfolded((cur) => new Set(cur).add(s.key));
                  // 그 칸이 아직 없으면(예: 작업이 0개라 실행 칸이 없음) 견본 칸, 그다음 바로 앞의 있는 칸으로 간다(v0.4.98)
                  const keys = [s.key, ...(s.key === 'E' ? ['P'] : []), ...STEPS.slice(0, i).map((x) => x.key).reverse()];
                  requestAnimationFrame(() => keys.map((k) => document.getElementById(`wf-${task.id}-${k}`)).find(Boolean)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* 1. 기획: Gemini 무료 초안(자동). v0.4.56 소유자: 기획에서 ChatGPT를 뺐다(기획서는 Gemini, 업무 계획은 Claude PM) */}
      <section className={fold.cls('plan', 0)} id={`wf-${task.id}-plan`}>
        {fold.head('plan', 0, <>1. 기획 — Gemini 초안</>)}
        {view.plannerFeedback && (
          <p className="task-error">
            v{view.spec?.revision}에 수정 요청: {view.plannerFeedback} —{' '}
            {'Gemini가 이 내용을 반영해 다시 씁니다(안 되면 아래 "Gemini로 초안 다시 쓰기").'}
          </p>
        )}
        <p className="muted small">
          Gemini(무료)가 기획서 초안을 씁니다. 초안을 보고 기획 승인하거나 수정 요청만 하세요. 링크·확인 질문·이미지 분석도 함께 들어갑니다.
        </p>
        <div className="wf-sub">
          <p className="small">
            <b>요청 자료(이미지·문서)</b> <span className="muted">· 비공개 저장, {MAX_REQUEST_FILES}개까지</span>
          </p>
          <AttachmentGallery
            items={requestImages}
            roles={ROLES_FOR.request}
            blocker={attachmentBlocker(view, 'request', 'add', requestImages.length)}
            max={MAX_REQUEST_FILES}
            urlFor={actions.attachmentUrl}
            onAdd={(files) => actions.addAttachments(task, 'request', null, files)}
            onUpdate={actions.updateAttachment}
            onDelete={actions.deleteAttachment}
            onMove={(id, d) => actions.moveAttachment(task, id, d)}
            emptyText="첨부한 이미지·문서가 없습니다."
            analyses={analysisById}
            onAnalyze={actions.analyzeImage}
            analyzeBlocker={view.aApproved ? '기획 승인 뒤에는 분석을 붙이지 않습니다.' : null}
            allowDocs
          />
        </div>
        <div id={view.spec?.intent === 'ambiguous' ? undefined : `wf-${task.id}-qa`} className="wf-anchor">
          <RequestContext task={task} view={view} links={taskLinks} clarifications={taskQa} canReadLinks={canReadLinks} actions={actions} />
        </div>
        <div className="task-actions">
          {canReadLinks && !view.aApproved && (
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void run(() => actions.draftSpec(task))}>
              {view.spec ? 'Gemini로 초안 다시 쓰기' : 'Gemini 기획서 초안(무료)'}
            </button>
          )}
          {!editing && view.spec && (
            <button type="button" className="btn btn-small" onClick={startEdit}>
              {`기획서 직접 고치기 (지금 v${view.spec.revision})`}
            </button>
          )}
        </div>
        {view.spec && !editing && (
          // 확인 질문이 있으면 '질문' 바로 가기는 이 칸(질문 + 바로 답하기)으로 온다(v0.4.90)
          <div className="wf-spec wf-anchor" id={view.spec.intent === 'ambiguous' ? `wf-${task.id}-qa` : undefined}>
            <p>
              <b>v{view.spec.revision}</b> · {INTENT_LABEL[view.spec.intent]} · {view.spec.planner === 'gemini_draft' ? 'Gemini 초안' : 'ChatGPT 기획'}
            </p>
            {view.spec.intent === 'question' || view.spec.intent === 'ambiguous' ? (
              <>
                {view.spec.intent === 'ambiguous' && <p className="small">확인 질문</p>}
                <p className="wf-pre">{view.spec.answer || '(답변 없음)'}</p>
                {/* 여기서 바로 답하기(v0.4.90 소유자): 답을 기록하면 Gemini가 기획서를 다시 쓰고, 대화창에도 같은 문답이 남는다 */}
                {view.spec.intent === 'ambiguous' && view.stage === 'needs_clarification' && view.spec.answer && (
                  <form
                    className="wf-answer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = qaReply.trim();
                      if (!text) return;
                      void run(async () => {
                        if (await actions.addClarification(task, view.spec!.answer, text)) {
                          actions.echoAnswer?.(task, text);
                          setQaReply('');
                        }
                      });
                    }}
                  >
                    {recommendedReply(view.spec.answer) && (
                      <button type="button" className="btn btn-small" onClick={() => setQaReply(recommendedReply(view.spec!.answer) ?? '')}>
                        추천대로 채우기
                      </button>
                    )}
                    <textarea
                      rows={3}
                      value={qaReply}
                      maxLength={4000}
                      placeholder="여기에 답을 쓰세요(번호별로 짧게 써도 돼요)"
                      aria-label="확인 질문에 답하기"
                      onChange={(e) => setQaReply(e.target.value)}
                    />
                    <button type="submit" className="btn btn-small btn-primary" disabled={busy || !qaReply.trim()}>
                      답하기 — Gemini가 기획서 다시 쓰기
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                <p className="wf-pre">{view.spec.finalPrompt || '(프롬프트 없음)'}</p>
                {view.spec.changeScope && <p className="small">변경 범위: {view.spec.changeScope}</p>}
                {view.spec.preserveConstraints && <p className="small">유지 조건: {view.spec.preserveConstraints}</p>}
                {view.spec.testCriteria && (
                  <CriteriaList
                    key={view.spec.revision}
                    text={view.spec.testCriteria}
                    editable={!view.aApproved && !busy}
                    onSave={async (next) => {
                      const sp = view.spec!;
                      await run(() => actions.saveSpec(task, { intent: sp.intent, finalPrompt: sp.finalPrompt, changeScope: sp.changeScope, preserveConstraints: sp.preserveConstraints, testCriteria: next, answer: sp.answer }));
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
        {editing && (
          <form
            className="task-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (await actions.saveSpec(task, spec)) setEditing(false);
              });
            }}
          >
            {view.aApproved && <p className="task-error">저장하면 새 버전이 되고, 이전 기획 승인은 효력이 없어집니다.</p>}
            <label className="field">
              <span>GPT가 판단한 의도</span>
              <select id={`intent-${task.id}`} value={spec.intent} onChange={(e) => setSpec({ ...spec, intent: e.target.value as Intent })}>
                {(Object.keys(INTENT_LABEL) as Intent[]).map((k) => (
                  <option key={k} value={k}>
                    {INTENT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {spec.intent === 'question' ? (
              <label className="field">
                <span>GPT 답변 (개발로 넘어가지 않습니다)</span>
                <textarea id={`answer-${task.id}`} rows={4} value={spec.answer} onChange={(e) => setSpec({ ...spec, answer: e.target.value })} required />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>최종 개발 프롬프트</span>
                  <textarea
                    id={`prompt-${task.id}`}
                    rows={5}
                    value={spec.finalPrompt}
                    onChange={(e) => setSpec({ ...spec, finalPrompt: e.target.value })}
                    required={spec.intent !== 'ambiguous'}
                  />
                </label>
                <label className="field">
                  <span>변경 범위</span>
                  <input id={`scope-${task.id}`} value={spec.changeScope} onChange={(e) => setSpec({ ...spec, changeScope: e.target.value })} />
                </label>
                <label className="field">
                  <span>유지 조건</span>
                  <input id={`preserve-${task.id}`} value={spec.preserveConstraints} onChange={(e) => setSpec({ ...spec, preserveConstraints: e.target.value })} />
                </label>
                <label className="field">
                  <span>테스트 기준</span>
                  <input id={`tests-${task.id}`} value={spec.testCriteria} onChange={(e) => setSpec({ ...spec, testCriteria: e.target.value })} />
                </label>
              </>
            )}
            <div className="form-foot">
              <span />
              <span className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  새 버전 저장
                </button>
              </span>
            </div>
          </form>
        )}
      </section>

      {/* 2. 기획 승인 */}
      {view.spec && view.spec.intent !== 'question' && (
        <section className={fold.cls('A', 1)} id={`wf-${task.id}-A`}>
          {fold.head('A', 1, <>2. {GATE_LABEL.A}</>)}
          {view.spec.intent === 'ambiguous' ? (
            <p className="muted small">
              {view.spec.planner === 'gemini_draft'
                ? '의도가 불분명합니다. 위 확인 질문에 입력창(또는 확인 질문 칸)에서 답하면 Gemini가 기획서를 다시 씁니다.'
                : '의도가 불분명합니다. ChatGPT의 확인 질문에 답한 뒤 기획서를 다시 저장하세요.'}
            </p>
          ) : view.aApproved ? (
            <p className="ok-text">v{view.spec.revision} 승인됨. 이 버전만 Claude PM에 전달됩니다.</p>
          ) : (
            <>
              {view.aStale && <p className="task-error">기획서가 바뀌어 이전 승인은 효력이 없습니다. v{view.spec.revision}을 다시 승인하세요.</p>}
              <div className="task-actions">
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy || !aCheck.ok}
                  onClick={() => void run(() => actions.decide(task, 'A', view.spec!.revision, 'approved'))}
                >
                  기획 승인 (v{view.spec.revision})
                </button>
                <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => setShowAFeedback((v) => !v)}>
                  {view.spec.planner === 'gemini_draft' ? '수정 요청(Gemini가 다시 씀)' : '수정 요청(ChatGPT로)'}
                </button>
              </div>
              {showAFeedback && (
                <div className="wf-inline">
                  <input
                    id={`afb-${task.id}`}
                    placeholder="무엇을 고칠지 적어 주세요"
                    value={aFeedback}
                    onChange={(e) => setAFeedback(e.target.value)}
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || !aFeedback.trim()}
                    onClick={() =>
                      void run(async () => {
                        if (await actions.decide(task, 'A', view.spec!.revision, 'rejected', '', { feedback: aFeedback.trim() })) {
                          setAFeedback('');
                          setShowAFeedback(false);
                        }
                      })
                    }
                  >
                    수정 요청 기록
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 3. Claude PM */}
      {view.aApproved && (
        <section className={fold.cls('pm', 2)} id={`wf-${task.id}-pm`}>
          {fold.head('pm', 2, <>3. Claude PM — 작업 분해·배정</>)}
          <p className="muted small">Claude는 계획만 만들고 저장소에 쓰지 않습니다. 세션이 시작돼도 계획이 오기 전까지는 완료가 아닙니다.</p>
          {!view.planCurrent && (
            <>
              {view.pendingRevision && (
                <p className="task-error">
                  결과 v{view.pendingRevision.resultRevision} 수정 요청: {view.pendingRevision.feedback} — PM에 다시 보내 새 계획을 받으세요.
                </p>
              )}
              {task.dispatch.sessionUrl && (
                <p className="task-session">
                  PM 세션:{' '}
                  <a href={task.dispatch.sessionUrl} target="_blank" rel="noreferrer">
                    열기
                  </a>{' '}
                  <span className="muted">— 계획은 PM이 자동으로 보내요. 끝났는데 안 오면 마지막 메시지의 JSON을 아래에 붙여넣으세요.</span>
                </p>
              )}
              {!sentThisRevision && (
                <div className="dispatch">
                  {failed && (
                    <label className="check">
                      <input id={`ack-${task.id}`} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      Routines History에서 이전 실행이 없었음을 확인했습니다
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn btn-claude"
                    disabled={busy || Boolean(dispatchBlocker) || (failed && !ack)}
                    onClick={() => void run(() => actions.dispatchPm(task, failed && ack))}
                  >
                    {view.pendingRevision ? `Claude PM에 수정 요청 전달 (v${view.spec!.revision})` : `Claude PM에 v${view.spec!.revision} 전달`}
                  </button>
                  {dispatchBlocker && <p className="muted small">{dispatchBlocker}</p>}
                </div>
              )}
              <label className="field">
                <span>PM 계획 JSON 붙여넣기</span>
                <textarea
                  id={`plan-${task.id}`}
                  rows={4}
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  placeholder='```json { "task_id": ..., "work_items": [...] } ```'
                  spellCheck={false}
                />
              </label>
              {planErrors && (
                <ul className="task-error small">
                  {planErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="task-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || !planText.trim()}
                  onClick={() =>
                    void run(async () => {
                      const errors = await actions.importPlan(task, planText);
                      setPlanErrors(errors);
                      if (!errors) setPlanText('');
                    })
                  }
                >
                  계획 검증 후 저장
                </button>
              </div>
            </>
          )}
          {view.plan && view.planCurrent && (
            <>
              <p className="ok-text">
                계획 v{view.plan.planRevision} 저장됨 (기획서 v{view.plan.approvedSpecRevision} 기준
                {view.plan.targetBaseRevision ? `, main ${view.plan.targetBaseRevision.slice(0, 7)}` : ''})
              </p>
              <p className="small">
                <span className={`pill ${view.prototypeFirst ? 'pill-mode-proto' : ''}`}>개발 방식: {DEVELOPMENT_MODE_LABEL[view.plan.plan.development_mode ?? 'direct']}</span>{' '}
                {view.plan.plan.mode_reason && <span className="muted">{view.plan.plan.mode_reason}</span>}
              </p>
              {/* 누가 나눴는지(v0.5.20): 작은 일 규칙·Gemini 대신. 작은 일은 실행 승인 전이면 PM에게 다시 맡길 수 있다 */}
              {view.plan.source === 'gemini_fallback' && <p className="small muted">Claude PM 대신 Gemini가 나눴어요(무료). 확인하고 실행 승인하세요.</p>}
              {view.plan.source === 'rule_small' && (
                <p className="small muted">
                  작은 일이라 PM 없이 규칙이 바로 배정했어요.{' '}
                  {actions.replanByPm && !view.assignments.some((a) => a.dispatchStatus !== 'awaiting_user_execution_approval') && (
                    <button type="button" className="link-btn" disabled={busy} onClick={() => void run(() => actions.replanByPm!(task))}>
                      PM에게 나눠 맡기기
                    </button>
                  )}
                </p>
              )}
            </>
          )}
          {view.plan?.plan.status === 'needs_clarification' && view.planCurrent && (
            // PM이 계획을 보류하고 물었다(v0.4.93): 여기서 답하면 기록하고 같은 기획서 버전으로 PM에 다시 보낸다.
            <div className="wf-anchor" id={view.spec?.intent === 'ambiguous' ? undefined : `wf-${task.id}-qa`}>
              <p className="small">PM이 계획을 멈추고 물었어요. 답하면 PM이 그 답으로 계획을 다시 짭니다.</p>
              <ol className="wf-pre wf-pm-questions">
                {view.plan.plan.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
              {task.dispatch.at && clarifications.some((c) => c.createdAt > task.dispatch.at!) ? (
                <p className="muted small">답을 보냈어요. PM이 새 계획을 보내면 여기에 나옵니다.</p>
              ) : (
                <form
                  className="wf-answer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = pmReply.trim();
                    if (!text) return;
                    const questions = view.plan!.plan.questions;
                    void run(async () => {
                      const q = questions.map((x, i) => `${i + 1}. ${x}`).join('\n');
                      if (await actions.addClarification(task, `[PM 질문]\n${q}`.slice(0, 2000), text)) {
                        actions.echoAnswer?.(task, text);
                        setPmReply('');
                        await actions.dispatchPm(task, false);
                      }
                    });
                  }}
                >
                  {recommendedReply(view.plan.plan.questions) && (
                    <button type="button" className="btn btn-small" onClick={() => setPmReply(recommendedReply(view.plan!.plan.questions) ?? '')}>
                      추천대로 채우기
                    </button>
                  )}
                  <textarea
                    rows={3}
                    value={pmReply}
                    maxLength={4000}
                    placeholder="번호별로 짧게 답하세요(예: 1. TestRepo 2. 방은 거실·작업실 3. 네)"
                    aria-label="PM 질문에 답하기"
                    onChange={(e) => setPmReply(e.target.value)}
                  />
                  <button type="submit" className="btn btn-small btn-primary" disabled={busy || !pmReply.trim() || Boolean(dispatchBlocker)}>
                    답하고 PM에 다시 보내기
                  </button>
                  {dispatchBlocker && <p className="muted small">{dispatchBlocker}</p>}
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. 배정 + 실행 승인 */}
      {view.planCurrent && view.assignments.length > 0 && (
        <section className={fold.cls('E', 3)} id={`wf-${task.id}-E`}>
          {fold.head('E', 3, <>4. 배정된 작업 — {GATE_LABEL.E}</>)}
          <WaitMap assignments={view.assignments} all={allAssignments} plan={view.plan} />
          {/* 요구사항 번호 검사(v0.5.39): 기획서 완료 기준 중 어느 작업도 맡지 않은 것 */}
          {(() => {
            const missing = view.spec && view.plan ? uncoveredRequirements(view.spec.testCriteria, view.plan.plan.work_items) : [];
            return missing.length > 0 ? (
              <div className="wf-warn" role="status">
                <b>계획에 빠진 요구사항 {missing.length}개</b> — 어느 작업도 맡지 않았어요. 실행 승인 전에 확인하세요.
                <ul>
                  {missing.map((r) => (
                    <li key={r.id}>
                      {r.id}. {r.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}
          <ul className="wf-items">
            {view.assignments.map((a) => {
              const item = view.plan!.plan.work_items.find((w) => w.id === a.workItemId);
              const adapter = adapterFor(a.assignee, a.executionMode);
              // 자동 실행 길: Claude 보조 개발(루틴) 또는 Codex(Linear)
              const auto =
                a.assignee === 'claude' && actions.startClaudeDev
                  ? { start: actions.startClaudeDev, label: 'Claude 보조 개발 시작(자동)', ack: 'Routines 기록에서 실제로 시작되지 않았음을 확인했습니다', note: '실행 승인하면 Claude가 클라우드에서 바로 개발을 시작합니다(PM과 함께 하루 상한).' }
                  : a.assignee === 'codex' && actions.startCodexLinear && item
                      ? {
                          start: (x: AgentAssignment, ack: boolean) =>
                            actions.startCodexLinear!(x, ack, buildCodexHandoff(task, view.spec!, item, project, view.plan!.targetBaseRevision, requestImages, taskLinks, view.pApproved ? prototypeFiles : [], projectRules, isSlimProject(task.projectId))),
                          label: 'Codex에 맡기기(Linear, 자동)',
                          ack: 'Linear 이슈에서 Codex가 실제로 시작하지 않았음을 확인했습니다',
                          note: '실행 승인하면 Linear 이슈를 만들어 Codex에게 맡깁니다(ChatGPT 구독 한도 안). 한도에 걸리면 여기에 알려요.',
                        }
                      : null;
              const eOk = view.eApproved(a.workItemId);
              const eCheck = canApprove(view, 'E', a.workItemId);
              // 실행 승인(E) 기록은 자동·수동 모두 같다. 승인 뒤 Claude·Gemini는 앱이 바로 자동 시작하고, Codex는 여기서 Linear로 맡긴다.
              const approveE = () =>
                run(async () => {
                  const ok = await actions.decide(task, 'E', view.plan!.planRevision, 'approved', a.workItemId, {
                    assignee: a.assignee,
                    mode: 'manual_handoff',
                    plan_revision: view.plan!.planRevision,
                    spec_revision: view.spec!.revision,
                  });
                  // 앞 작업이 아직이면 지금 맡기지 않는다(앞 작업이 끝나면 앱이 자동으로 맡긴다, v0.6.18)
                  if (ok && a.assignee === 'codex' && auto && !startBlocker(a, allAssignments, view.plan, agentLimits)) await auto.start({ ...a, dispatchStatus: 'ready' }, false);
                  return ok;
                });
              const autoWho = a.assignee === 'claude' ? 'Claude' : a.assignee === 'codex' ? 'Codex' : 'Gemini';
              return (
                <li key={a.id} className="wf-item">
                  <div className="wf-item-head">
                    <b>
                      {a.workItemId} · {a.title}
                    </b>
                    <span className="pill">{adapter.label}</span>
                    <span className={`pill pill-adapter-${adapter.state}`}>{ADAPTER_STATE_LABEL[adapter.state]}</span>
                    <span className="pill">{DISPATCH_STATUS_LABEL[a.dispatchStatus]}</span>
                  </div>
                  {item?.goal && <p className="small">{item.goal}</p>}
                  {/* v0.5.74: 끝났지만 브랜치를 못 올린(개발 실패) 결과면 같은 AI로 다시 하거나 다른 AI로 넘긴다 */}
                  {actions.reassign && a.dispatchStatus === 'completed' && resultWithoutBranch(view.result) && view.result?.workItemId === a.workItemId && (
                    <div className="wf-reassign is-quota">
                      <p className="small">⚠️ 개발이 끝까지 못 가서 작업 브랜치가 올라가지 않았어요. 다시 해야 해요.</p>
                      {(['same', ...reassignTargets(a.assignee, OFFICE_REPOS.includes((project?.repo ?? '').toLowerCase()))] as const).map((to) => {
                        const pref: AssigneePreference = to === 'same' ? samePref(a.assignee) : to;
                        return (
                          <button key={to} type="button" className={`chip${to === 'same' ? ' chip-strong' : ''}`} disabled={busy} onClick={() => void run(() => actions.reassign!(task, a, pref, '개발이 끝까지 못 감, 다시 하기'))}>
                            {to === 'same' ? `다시 하기(${AGENT_NAME[a.assignee] ?? a.assignee})` : `${PREF_LABEL[to]}로 다시 하기`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* 두 AI 비교(v0.6.54, Conductor 비교 모드 착안): 끝난 결과를 다른 AI에게도 따로 시켜 본다. 사용량이 2배라 버튼으로만 */}
                  {actions.reassign && canCompare(view, a) && (
                    <div className="wf-reassign">
                      <span className="small muted">비교:</span>
                      <button
                        type="button"
                        className="chip"
                        disabled={busy}
                        onClick={() => void run(() => actions.reassign!(task, a, compareTarget(a.assignee), `${COMPARE_WHY}: ${AGENT_NAME[a.assignee] ?? a.assignee} 결과와 비교`))}
                      >
                        {PREF_LABEL[compareTarget(a.assignee)]}로도 해 보기
                      </button>
                      <span className="small muted"> 같은 일을 따로 해서 점수를 견줘요(사용량 1번 더)</span>
                    </div>
                  )}
                  {/* v0.5.84 '지시 받음' 확인: 시작했는데 소식이 없으면 경고와 다른 AI로 넘기기 */}
                  {actions.reassign && staleStart(a) && (
                    <div className="wf-reassign is-quota">
                      <p className="small">⚠️ {staleStart(a)}</p>
                      <span className="small muted">{busy ? '넘기는 중… 곧 새 담당이 시작해요' : '다시 시도하거나 다른 AI로 넘기기:'}</span>
                      {(['same', ...reassignTargets(a.assignee, OFFICE_REPOS.includes((project?.repo ?? '').toLowerCase()))] as const).map((to) => (
                        <button key={to} type="button" className={`chip${to === 'same' ? ' chip-strong' : ''}`} disabled={busy} onClick={() => void run(() => actions.reassign!(task, a, to === 'same' ? samePref(a.assignee) : to, `${AGENT_NAME[a.assignee] ?? a.assignee} 소식 없음`))}>
                          {to === 'same' ? `다시 시도(${AGENT_NAME[a.assignee] ?? a.assignee})` : PREF_LABEL[to]}
                        </button>
                      ))}
                    </div>
                  )}
                  {actions.reassign && a.dispatchStatus !== 'completed' && a.dispatchStatus !== 'started' && a.dispatchStatus !== 'starting' && (
                    <div className={`wf-reassign${quotaHit(a) || a.dispatchStatus === 'failed' ? ' is-quota' : ''}`}>
                      {quotaHit(a) && <p className="small">⚠️ {AGENT_NAME[a.assignee] ?? a.assignee} 한도에 걸린 것 같아요. 다른 AI로 넘길 수 있어요.</p>}
                      {/* v0.6.80 소유자 "개발 안 됐을 때 다시 시도 버튼": 실패면 같은 AI로 다시 시도가 맨 앞 */}
                      {a.dispatchStatus === 'failed' && !quotaHit(a) && <p className="small">⚠️ 개발이 안 됐어요{a.actualProviderStatus ? `: ${a.actualProviderStatus.replace(/^linear:\s*/, '').slice(0, 120)}` : ''}</p>}
                      {a.dispatchStatus === 'failed' && (
                        <button type="button" className="chip chip-strong" disabled={busy} onClick={() => void run(() => actions.reassign!(task, a, samePref(a.assignee), '실패, 다시 시도'))}>
                          다시 시도({AGENT_NAME[a.assignee] ?? a.assignee})
                        </button>
                      )}
                      <span className="small muted">{busy ? '넘기는 중… 곧 새 담당이 시작해요' : '담당 바꾸기:'}</span>
                      {reassignTargets(a.assignee, OFFICE_REPOS.includes((project?.repo ?? '').toLowerCase())).map((to) => (
                        <button
                          key={to}
                          type="button"
                          className={`chip${quotaHit(a) ? ' chip-strong' : ''}`}
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              actions.reassign!(task, a, to, quotaHit(a) ? `${AGENT_NAME[a.assignee] ?? a.assignee} 한도` : '소유자가 바꿈'),
                            )
                          }
                        >
                          {PREF_LABEL[to]}
                        </button>
                      ))}
                    </div>
                  )}
                  {item && item.dependencies.length > 0 && (() => {
                    // 누가 누구를 기다리나(v0.5.22): 안 끝난 앞 작업만 "⏳ W2(Codex) 결과 대기", 다 끝났으면 ✓
                    const w = waitingOn(a, allAssignments, view.plan);
                    return w.length ? (
                      <p className="small wf-waiting">⏳ {w.map((x) => `${x.workItemId}${x.agent ? `(${x.agent})` : ''}`).join(' · ')} 결과 대기</p>
                    ) : (
                      <p className="muted small">✓ 먼저 끝나야 할 작업({item.dependencies.join(', ')}) 끝남</p>
                    );
                  })()}

                  {/* 자동 실행: 검증된 경로만 버튼이 켜진다 */}
                  {auto ? (
                    <div className="wf-auto">
                      {eOk && (a.dispatchStatus === 'ready' || a.dispatchStatus === 'failed') ? (
                        <span className="wf-inline">
                          {a.dispatchStatus === 'failed' && (
                            <label className="check small">
                              <input type="checkbox" checked={!!devAck[a.id]} onChange={(e) => setDevAck({ ...devAck, [a.id]: e.target.checked })} />
                              {auto.ack}
                            </label>
                          )}
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            disabled={busy || (a.dispatchStatus === 'failed' && !devAck[a.id]) || !!startBlocker(a, allAssignments, view.plan, agentLimits)}
                            onClick={() => void run(() => auto.start(a, !!devAck[a.id]))}
                          >
                            {auto.label}
                          </button>
                        </span>
                      ) : (
                        !eOk && (
                          <>
                            {/* v0.5.69(소유자 "승인 버튼이 수동밖에 없네"): 자동 길이 있으면 이 버튼이 실행 승인이다 */}
                            <button type="button" className="btn btn-small btn-primary" disabled={busy || !eCheck.ok} title={eCheck.ok ? auto.note : eCheck.reason} onClick={() => void approveE()}>
                              실행 승인 → {autoWho} 자동 시작
                            </button>
                            <p className="muted small">{auto.note}</p>
                          </>
                        )
                      )}
                      {/* v0.6.86: Codex가 다른 저장소 환경에서 시작했으면 눈에 띄게(상태 글 앞의 '환경 확인' 문장) */}
                      {a.assignee === 'codex' && a.actualProviderStatus?.includes('환경 확인') && (
                        <p className="task-error small">⚠️ {a.actualProviderStatus.match(/환경 확인 — [^]*?하세요\./)?.[0] ?? '환경 확인 — Codex가 다른 저장소 환경에서 시작했어요.'}</p>
                      )}
                      {a.dispatchStatus === 'failed' && a.actualProviderStatus && a.actualProviderStatus !== 'unknown' && <p className="task-error small">{a.actualProviderStatus.replace(/^linear: /, 'Codex: ')}</p>}
                      {a.assignee === 'codex' && a.dispatchStatus === 'started' && a.actualProviderStatus?.startsWith('linear') && (
                        <p className="small">
                          Codex 소식: {a.actualProviderStatus.replace(/^linear: /, '')}
                          {a.providerTaskUrl && (
                            <>
                              {' '}
                              ·{' '}
                              <a href={a.providerTaskUrl} target="_blank" rel="noreferrer">
                                Linear 이슈
                              </a>
                            </>
                          )}
                          {actions.refreshCodex && (
                            <>
                              {' '}
                              <button type="button" className="link-btn small" disabled={busy} onClick={() => void run(() => actions.refreshCodex!(a))}>
                                소식 다시 읽기
                              </button>
                            </>
                          )}
                        </p>
                      )}
                      <p className="muted small">{adapter.reason}</p>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="btn btn-small" disabled title={adapter.reason}>
                        {a.assignee === 'codex' ? 'Codex 실행 승인' : '실행 승인'} — 자동 실행 준비 중
                      </button>
                      <p className="muted small">{adapter.reason}</p>
                    </>
                  )}

                  {/* 임시 폴백: 수동 인계. 자동 실행 버튼처럼 보이지 않게 따로 둔다 */}
                  <div className="wf-manual">
                    <p className="small">
                      <b>수동 인계(임시)</b> — 실행 승인 후 지시서를 복사해 {a.assignee === 'codex' ? 'Codex Cloud 웹' : '해당 도구'}에서 직접 시작합니다.
                    </p>
                    {!eOk ? (
                      <button type="button" className="btn btn-small btn-ghost" disabled={busy || !eCheck.ok} onClick={() => void approveE()}>
                        {auto ? '자동 시작이 안 될 때만: 수동 인계로 승인' : '실행 승인: 수동 인계로 진행'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          onClick={async () => {
                            if (!item) return;
                            if (view.prototypeFirst && a.assignee === 'gemini') {
                              void copy(a.id, buildPrototypeHandoff(task, view.spec!, item, project, view.plan!.plan.mode_reason ?? '', requestImages, taskLinks));
                              return;
                            }
                            const text = buildCodexHandoff(task, view.spec!, item, project, view.plan!.targetBaseRevision, requestImages, taskLinks, view.pApproved ? prototypeFiles : [], projectRules, isSlimProject(task.projectId));
                            // v0.6.21: Codex는 결과 자동 제출 절을 붙인다(Codex 앱에 붙여 넣으면 결과가 앱으로 바로 옴)
                            const section = a.assignee === 'codex' && actions.codexManualSection ? await actions.codexManualSection(a) : '';
                            void copy(a.id, text + section);
                          }}
                        >
                          {copied === a.id ? '복사됨' : view.prototypeFirst && a.assignee === 'gemini' ? 'AI Studio 견본 지시서 복사' : a.assignee === 'codex' && actions.codexManualSection ? 'Codex 앱용 지시서 복사(결과 자동)' : '지시서 복사'}
                        </button>
                        {a.dispatchStatus === 'completed' ? (
                          <p className="small ok-text">결과를 받아 끝난 작업입니다.</p>
                        ) : a.dispatchStatus !== 'started' ? (
                          <span className="wf-inline">
                            {a.dispatchStatus === 'failed' && <span className="muted small">중단된 작업 · 다시 시작할 수 있습니다</span>}
                            <input
                              id={`start-${a.id}`}
                              placeholder="시작한 작업 주소(선택)"
                              value={startUrl[a.id] ?? ''}
                              onChange={(e) => setStartUrl({ ...startUrl, [a.id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={busy || !!startBlocker(a, allAssignments, view.plan, agentLimits)}
                              onClick={() => void run(() => actions.recordStart(a, startUrl[a.id] ?? ''))}
                            >
                              직접 시작했어요
                            </button>
                            {startBlocker(a, allAssignments, view.plan, agentLimits) && <span className="muted small">{startBlocker(a, allAssignments, view.plan, agentLimits)}</span>}
                          </span>
                        ) : (
                          <p className="small">
                            {a.statusSource === 'server_verified' ? '서버 확인: 세션 시작됨(완료 아님)' : '사용자 기록: 시작함'}
                            {a.providerTaskUrl && (
                              <>
                                {' '}
                                ·{' '}
                                <a href={a.providerTaskUrl} target="_blank" rel="noreferrer">
                                  {a.statusSource === 'server_verified' ? '세션 열기' : '작업 열기'}
                                </a>
                              </>
                            )}{' '}
                            {a.statusSource !== 'server_verified' && <span className="muted">(서버 확인 아님)</span>}{' '}
                            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(() => actions.stopAssignment(a))}>
                              중단 기록
                            </button>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 4-1. 견본 먼저: AI Studio 견본 → 미리보기 검토 → 견본 승인 */}
      {view.planCurrent && view.prototypeFirst && (
        <section className={fold.cls('P', 3)} id={`wf-${task.id}-P`}>
          {fold.head('P', 3, <>4-1. 견본 검토 — {GATE_LABEL.P}</>)}
          <p className="muted small">
            Claude PM이 <b>견본 먼저</b>를 골랐습니다. 계획이 오면 Gemini(무료) Studio A·B가 HTML 견본을 하나씩 만들어 여기에 올립니다. 둘을 보고 하나를 고르세요(고르면 견본 승인 P).
            더 정교한 견본이 필요하면 위 견본 작업의 "AI Studio 견본 지시서"로 Google AI Studio Build에서 만들어 올려도 됩니다. 견본을 승인(P)하면 Codex 지시서에 이 견본이 들어갑니다.
          </p>
          {!view.pApproved && prototypeFiles.length === 0 && view.plan!.plan.status === 'needs_clarification' && (
            <p className="muted small">PM이 계획을 멈추고 질문했어요. 위 PM 칸에서 먼저 답해 주세요. 계획이 오면 견본을 만듭니다.</p>
          )}
          {!view.pApproved && prototypeFiles.length === 0 && canReadLinks && view.plan!.plan.status !== 'needs_clarification' && (
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void run(() => actions.makePrototype(task))}>
              Gemini로 견본 만들기(무료)
            </button>
          )}
          <AttachmentGallery
            items={prototypeFiles}
            roles={ROLES_FOR.prototype}
            blocker={attachmentBlocker(view, 'prototype', 'add', prototypeFiles.length, view.plan!.planRevision)}
            max={MAX_PROTOTYPE_FILES}
            urlFor={actions.attachmentUrl}
            onAdd={(files) => actions.addAttachments(task, 'prototype', view.plan!.planRevision, files)}
            onUpdate={actions.updateAttachment}
            onDelete={actions.deleteAttachment}
            onMove={(id, d) => actions.moveAttachment(task, id, d)}
            emptyText="아직 올린 견본이 없습니다."
            allowDocs
          />
          {!view.pApproved && prototypeFiles.length > 1 && actions.pickPrototype && (
            <div className="wf-pick">
              <p className="small">
                <b>견본 {prototypeFiles.length}장 중 하나를 고르세요.</b> 위에서 눌러 크게 보고 고르면, 나머지는 지우고 견본 승인(P)까지 합니다.
              </p>
              <div className="wf-pick-row">
                {prototypeFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="btn btn-small btn-primary"
                    disabled={busy || !canApprove(view, 'P').ok}
                    onClick={() => void run(() => actions.pickPrototype!(task, f))}
                  >
                    {(f.note.split('(')[0].trim() || f.fileName)}로 고르기
                  </button>
                ))}
              </div>
            </div>
          )}
          {view.pApproved ? (
            <p className="ok-text">견본 승인됨(P). 이제 Codex 작업을 실행 승인하세요.</p>
          ) : (
            <>
              <button type="button" className="btn btn-small btn-primary" disabled={busy || !canApprove(view, 'P').ok} onClick={() => void run(() => actions.approvePrototype(task))}>
                견본 승인
              </button>
              {!canApprove(view, 'P').ok && <p className="muted small">{(canApprove(view, 'P') as { reason: string }).reason}</p>}
            </>
          )}
        </section>
      )}

      {/* 개발 중 추가 요청(v0.6.13, 소유자 "개발 중에 연달아 보내도 알아서"): 도는 개발에는 끼어들 수 없어 모아 두었다가
          다음 PM 재계획(다시 개발)에 함께 보낸다. 결과가 '통과'여도 추가 요청이 있으면 한 번에 다시 개발로 보낼 수 있다. */}
      {view.aApproved && view.plan && !view.cApproved && actions.addFollowup && (
        <FollowupBox
          followups={followups}
          busy={busy}
          canRedo={!!view.result && !view.bApproved && revisionCheck.ok}
          onAdd={(text) => run(() => actions.addFollowup!(task, text))}
          onRedo={(n) => run(() => actions.requestRevision(task, `사장님 추가 요청 ${n}개를 반영해 다시 개발(내용은 '개발 중 사장님이 더한 요청'에 있음)`))}
        />
      )}

      {/* 5. 결과 패키지 + B */}
      {view.aApproved && (view.planCurrent || view.result) && (
        <section className={fold.cls('B', 4)} id={`wf-${task.id}-B`}>
          {fold.head('B', 4, <>5. 결과 검토 — {GATE_LABEL.B}</>)}
          <p className="muted small">
            GitHub에 올리기 전에 여기서 diff와 테스트 결과를 봅니다. Codex 웹의 diff(또는 `codex cloud diff` 출력)를 붙여넣으세요. PR·푸시는 결과 승인 뒤에만 합니다.
          </p>
          {view.result && (
            <div className="wf-result">
              <p>
                <b>결과 v{view.result.revision}</b>
                {view.result.workItemId && ` · ${view.result.workItemId}`} · {view.result.summary || '(요약 없음)'}
              </p>
              <p className="small">
                {view.result.source === 'claude_session_auto'
                  ? '보낸 곳: Claude 세션이 직접 보냄(자동)'
                  : view.result.source === 'codex_linear_auto'
                    ? '보낸 곳: Codex가 직접 보냄(자동, Claude가 채점)'
                    : view.result.source === 'gemini_actions_auto'
                      ? '보낸 곳: Gemini 개발이 직접 보냄(자동)'
                      : '보낸 곳: 사람이 등록(붙여넣기)'}
              </p>
              {(() => {
                // 되돌리기 쉬운가(v0.5.21, pr 스킬의 merge danger): 규칙만, 승인을 막지 않는 안내
                const m = mergeDanger(view.result.diff);
                if (!m.files) return null;
                return (
                  <p className={`small ${m.oneWay ? 'task-error' : 'muted'}`}>
                    {m.oneWay ? `되돌리기 어려움(${m.reasons.join('·')})` : '되돌리기 쉬움'} · 파일 {m.files}개 · 영역 {m.areas}곳
                  </p>
                );
              })()}
              {actions.siteCheck && view.result.previewUrl && (
                <SiteCheckView key={`p-${view.result.revision}`} kind="preview" canStart api={{ load: () => actions.siteCheck!.load(task.id), start: (k) => actions.siteCheck!.start(task.id, k) }} />
              )}
              {view.result.diff && (
                // 바뀐 곳 구조도(v0.5.24): Codex·Claude·Gemini 결과 모두 diff로 그린다(토큰 0)
                <details className="wf-change-tree">
                  <summary className="small">바뀐 곳 구조도</summary>
                  <FileTreeView
                    paths={[]}
                    changes={new Map(diffStats(view.result.diff).map((f) => [f.path, { add: f.add, del: f.del, tasks: [task.title] }]))}
                    emptyText="diff에서 바뀐 파일을 찾지 못했어요."
                  />
                  {actions.archify && <ArchifyView load={() => actions.archify!(task.id, view.result!.revision)} />}
                  {actions.designCheck && view.result.previewUrl && <DesignCheckView key={view.result.revision} api={{ load: () => actions.designCheck!.load(task.id, view.result!.revision), start: () => actions.designCheck!.start(task.id, view.result!.revision) }} />}
                </details>
              )}
              {(() => {
                // 이 결과를 낸 실행(계획 버전 + 작업)을 함께 보여 준다. 실행 기록 없이 등록된 결과는 그렇다고 알린다.
                const r = view.result!;
                const run = allAssignments.find((a) => a.taskId === task.id && a.planRevision === r.planRevision && a.workItemId === r.workItemId);
                if (!run) return <p className="small task-error">실행 기록: 연결된 작업이 없습니다(작업을 고르지 않고 등록한 결과). 내용을 특히 꼼꼼히 확인하세요.</p>;
                return (
                  <p className="small">
                    실행 기록: {run.workItemId} · {AGENT_BY_ID[run.assignee === 'gemini' ? 'studioA' : run.assignee].name} · {DISPATCH_STATUS_LABEL[run.dispatchStatus]}
                    {' · '}
                    {run.statusSource === 'server_verified' ? '시작을 서버가 확인' : run.statusSource === 'user_reported' ? '시작을 사람이 기록' : '시작 기록 없음'}
                    {run.providerTaskUrl && (
                      <>
                        {' · '}
                        <a href={run.providerTaskUrl} target="_blank" rel="noreferrer">
                          작업 열기
                        </a>
                      </>
                    )}
                  </p>
                );
              })()}
              <ReviewCard
                review={reviews.find((r) => r.resultRevision === view.result!.revision) ?? null}
                onFinish={actions.finishReview && !view.bApproved ? () => run(() => actions.finishReview!(task, view.result!.revision)) : undefined}
                busy={busy}
              />
              {view.result.previewUrl && (
                <p className="small">
                  <a className="preview-link" href={view.result.previewUrl} target="_blank" rel="noreferrer">
                    미리보기 열기 ↗
                  </a>{' '}
                  <span className="muted">작업 브랜치 화면(빌드에 1~3분, 아직 PR·배포 아님)</span>
                </p>
              )}
              <p className="muted small mono">
                sha256 {view.result.sha256.slice(0, 16)}… · diff {view.result.diff.length.toLocaleString()}자 · 스크린샷 {resultShots.length}장{view.result.previewUrl ? '' : ' · 미리보기 없음'}
              </p>
              {/* 코드는 길어서 접어 둔다(v0.5.29 소유자 "코드 접기 버튼") */}
              {view.result.diff && (
                <details>
                  <summary className="small">바뀐 코드 ({view.result.diff.split('\n').length.toLocaleString()}줄)</summary>
                  <pre className="diff-view">{view.result.diff}</pre>
                </details>
              )}
              {view.result.testLog && (
                <details>
                  <summary className="small">테스트 로그</summary>
                  <pre className="diff-view">{view.result.testLog}</pre>
                </details>
              )}
              {view.result.remainingIssues && <p className="small">남은 문제: {view.result.remainingIssues}</p>}
              <AttachmentGallery
                items={resultShots}
                roles={ROLES_FOR.result}
                blocker={attachmentBlocker(view, 'result', 'add', resultShots.length, view.result.revision)}
                max={MAX_RESULT_FILES}
                urlFor={actions.attachmentUrl}
                onAdd={(files) => actions.addAttachments(task, 'result', view.result!.revision, files)}
                emptyText="결과 스크린샷 없음"
                onPoint={
                  !view.bApproved && !view.pendingRevision && !view.resultRevised && revisionCheck.ok
                    ? (text) => {
                        setRevisionText((v) => (v.trim() ? `${v.trimEnd()}\n${text}` : text));
                        window.setTimeout(() => document.getElementById(`rev-${task.id}`)?.focus(), 0);
                      }
                    : undefined
                }
              />
            </div>
          )}
          {!view.bApproved && (
            <div className="task-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowResultForm((v) => !v)}>
                {view.result ? '수정 결과 새 버전 등록' : '결과 패키지 등록'}
              </button>
              {view.result && (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy || !bCheck.ok}
                  onClick={() => void run(() => actions.decide(task, 'B', view.result!.revision, 'approved', '', { result_sha256: view.result!.sha256 }))}
                >
                  {(() => {
                    const rv = reviews.find((r) => r.resultRevision === view.result!.revision);
                    return rv && rv.verdict !== 'pass' ? `점수 미달이지만 결과 승인 (v${view.result.revision})` : `결과 승인 → PR 열기 (v${view.result.revision})`;
                  })()}
                </button>
              )}
            </div>
          )}
          {view.result && !view.bApproved && (
            <div className="wf-manual">
              <p className="small">
                <b>수정 요청(Claude PM으로)</b> — 결과를 보고 고칠 점을 적으면, 같은 기획서 v{view.spec?.revision}로 PM에 다시 보내 새 계획을 받습니다. 새 계획의 작업은 실행 승인을 다시 받습니다.
              </p>
              {view.pendingRevision ? (
                <p className="muted small">보낸 수정 요청: {view.pendingRevision.feedback}</p>
              ) : view.resultRevised ? (
                <p className="muted small">이 결과에는 수정 요청을 보냈습니다. 새 계획으로 작업한 결과를 새 버전으로 등록하세요.</p>
              ) : (
                <>
                <span className="design-words" aria-label="디자인 단어로 수정 요청">
                  {DESIGN_WORDS.map((d) => (
                    <button key={d.word} type="button" className="chip" title={d.text} onClick={() => setRevisionText((v) => addDesignWord(v, d.word))}>
                      {d.word}
                    </button>
                  ))}
                </span>
                <span className="wf-inline rev-inline">
                  <textarea
                    id={`rev-${task.id}`}
                    className="rev-input"
                    rows={revisionText.includes('\n') ? 4 : 2}
                    placeholder="예: 버튼 색은 그대로, 크기만 키우기(스크린샷 '짚어서 수정'으로 위치도 넣을 수 있어요)"
                    value={revisionText}
                    onChange={(e) => setRevisionText(e.target.value)}
                    maxLength={4000}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || !revisionText.trim() || !revisionCheck.ok}
                    onClick={() =>
                      void run(async () => {
                        if (await actions.requestRevision(task, revisionText.trim())) setRevisionText('');
                      })
                    }
                  >
                    수정 요청 기록
                  </button>
                </span>
                </>
              )}
            </div>
          )}
          {showResultForm && !view.bApproved && (
            <form
              className="task-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (await actions.addResult(task, result, resultImages)) {
                    setShowResultForm(false);
                    setResult({ workItemId: '', summary: '', diff: '', testLog: '', remainingIssues: '' });
                    setResultImages([]);
                  }
                });
              }}
            >
              <div className="field-row">
                <label className="field">
                  <span>작업</span>
                  <select id={`ritem-${task.id}`} value={result.workItemId} onChange={(e) => setResult({ ...result, workItemId: e.target.value })}>
                    <option value="">전체</option>
                    {view.assignments.map((a) => (
                      <option key={a.id} value={a.workItemId}>
                        {a.workItemId} {a.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>요약</span>
                  <input id={`rsum-${task.id}`} value={result.summary} onChange={(e) => setResult({ ...result, summary: e.target.value })} maxLength={4000} />
                </label>
              </div>
              <label className="field">
                <span>diff (최대 500,000자)</span>
                <textarea id={`rdiff-${task.id}`} rows={6} value={result.diff} onChange={(e) => setResult({ ...result, diff: e.target.value })} maxLength={500000} spellCheck={false} />
              </label>
              <label className="field">
                <span>테스트 로그 (최대 100,000자)</span>
                <textarea id={`rlog-${task.id}`} rows={3} value={result.testLog} onChange={(e) => setResult({ ...result, testLog: e.target.value })} maxLength={100000} spellCheck={false} />
              </label>
              <label className="field">
                <span>남은 문제</span>
                <input id={`rissue-${task.id}`} value={result.remainingIssues} onChange={(e) => setResult({ ...result, remainingIssues: e.target.value })} maxLength={4000} />
              </label>
              <div className="field">
                <span>스크린샷 (변경 후·변경 전, {MAX_RESULT_FILES}장까지)</span>
                <ImagePicker items={resultImages} onChange={setResultImages} roles={ROLES_FOR.result} max={MAX_RESULT_FILES} label="스크린샷 추가" />
              </div>
              <div className="form-foot">
                <span className="muted small">개인정보·비밀키가 diff에 없는지 확인하세요.</span>
                <button type="submit" className="btn btn-primary" disabled={busy || (!result.diff.trim() && !result.summary.trim())}>
                  결과 저장
                </button>
              </div>
            </form>
          )}
          {view.bApproved && (
            <div className="wf-manual">
              <p className="ok-text">결과 v{view.result!.revision} 업로드 승인됨.</p>
              {['codex_linear_auto', 'claude_session_auto', 'claude_manual'].includes(view.result!.source) ? (
                // v0.6.29: Claude·Codex 결과는 GitHub Actions가 승인된 변경 그대로 작업 브랜치로 올리고 PR을 연다
                <p className="small">승인된 변경 그대로 PR을 자동으로 열어요(1~2분, 병합은 안 함). PR이 생기면 아래에 주소와 검사(CI) 결과가 보여요.</p>
              ) : codexItem ? (
                <>
                  <p className="small">
                    이제 결과를 만든 <b>같은 Codex 작업 창</b>에 아래 PR 요청을 붙여넣으세요. Codex가 최신 main 위에 브랜치를 만들고 PR을 엽니다(병합은 안 함). 받은 PR 주소를 기록하면 C 단계에서 씁니다.
                  </p>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => void copy('pr-request', buildCodexPrRequest(task, view.result!.revision, codexItem.workItemId, project))}
                  >
                    {copied === 'pr-request' ? '복사됨' : 'Codex PR 요청 복사'}
                  </button>
                </>
              ) : claudeItem ? (
                <>
                  <p className="small">
                    이제 결과를 만든{' '}
                    <a href={claudeItem.providerTaskUrl!} target="_blank" rel="noreferrer">
                      Claude 세션
                    </a>
                    에 아래 PR 요청을 붙여넣으세요. Claude가 작업 브랜치를 푸시하고 PR을 엽니다(병합은 안 함). 받은 PR 주소를 기록하면 C 단계에서 씁니다.
                  </p>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => void copy('pr-request', buildCodexPrRequest(task, view.result!.revision, claudeItem.workItemId, project, 'claude'))}
                  >
                    {copied === 'pr-request' ? '복사됨' : 'Claude PR 요청 복사'}
                  </button>
                </>
              ) : (
                <p className="small">
                  {view.result!.source === 'gemini_actions_auto'
                    ? 'Gemini 결과는 PR을 자동으로 열어요(1분 안팎). PR이 생기면 아래에 주소와 검사(CI) 결과가 보여요.'
                    : `이제 Claude에게 "결과 v${view.result!.revision} 올려줘"라고 하세요. PR 주소를 기록해 두면 C 단계에서 씁니다.`}
                </p>
              )}
              {task.prUrl ? (
                <p className="small">
                  PR:{' '}
                  <a href={task.prUrl} target="_blank" rel="noreferrer">
                    {task.prUrl}
                  </a>
                </p>
              ) : (
                <span className="wf-inline">
                  <input id={`pr-${task.id}`} placeholder="https://github.com/…/pull/…" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} />
                  <button type="button" className="btn btn-small" disabled={busy || !prUrl.startsWith('https://github.com/')} onClick={() => void run(() => actions.setPrUrl(task, prUrl))}>
                    PR 주소 기록
                  </button>
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* 6. C 운영 배포 */}
      {view.bApproved && (
        <section className={fold.cls('C', 5)} id={`wf-${task.id}-C`}>
          {fold.head('C', 5, <>6. {GATE_LABEL.C}</>)}
          {view.cApproved ? (
            actions.deploy ? (
              <div className="wf-manual">
                {deployment?.ok ? (
                  <>
                  <p className="ok-text">
                    운영 배포됨: release → {deployment.toSha.slice(0, 7)} ({new Date(deployment.createdAt).toLocaleString('ko-KR')}). Cloudflare 빌드가 끝나면 사이트에 반영됩니다.
                    {siteUrl(project) && (
                      <>
                        {' '}
                        <a href={siteUrl(project)!} target="_blank" rel="noopener noreferrer">
                          운영 사이트 열기 ↗
                        </a>
                      </>
                    )}
                  </p>
                  {actions.siteCheck && siteUrl(project) && (
                    <SiteCheckView key={`d-${deployment.toSha}`} kind="production" canStart api={{ load: () => actions.siteCheck!.load(task.id), start: (k) => actions.siteCheck!.start(task.id, k) }} />
                  )}
                  </>
                ) : (
                  <>
                    <p className="small">
                      배포 승인됨. {deployment ? <span className="task-error">마지막 배포 실패: {deployment.error}</span> : '아직 배포하지 않았습니다.'}
                    </p>
                    {deployment?.error.startsWith('확인 필요') ? (
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void run(() => actions.deploy!(task, true))}>
                        같이 나갈 변경까지 배포
                      </button>
                    ) : (
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void run(() => actions.deploy!(task))}>
                        {deployment ? '운영 배포 다시 시도' : '운영 배포'}
                      </button>
                    )}
                  </>
                )}
                <p className="muted small">서버가 release 브랜치를 main으로 앞당깁니다(직접 커밋 없음). 이 버튼은 배포 시작이고, 사이트 반영은 Cloudflare 빌드 뒤입니다.</p>
              </div>
            ) : (
              <>
                <p className="ok-text">배포 승인됨. PC의 저장소 폴더에서 아래 두 줄을 실행하면 운영 사이트(release)에 반영됩니다(로컬 데모).</p>
                <pre className="diff-view">{'git fetch origin\ngit push origin origin/main:refs/heads/release'}</pre>
              </>
            )
          ) : (
            <>
              {actions.checkPr ? (
                <div className="wf-manual">
                  <p className="small">
                    <b>PR·CI 확인</b> — 결과 승인 뒤에는 앱이 1분마다 자동으로 확인합니다. CI가 성공하면 배포 승인을 할 수 있고, 병합은 배포 승인 때 서버가 합니다.
                  </p>
                  {prCheck && (
                    <>
                      <p className="small">
                        <span className={`pill pill-ci-${prCheck.ciState}`}>CI {CI_LABEL[prCheck.ciState]}</span>{' '}
                        <span className={`pill ${prCheck.merged ? 'pill-ci-success' : 'pill-ci-pending'}`}>{prCheck.merged ? '병합됨' : prCheck.prState === 'closed' ? '닫힘(병합 안 됨)' : '병합 전'}</span>{' '}
                        <span className="muted">{new Date(prCheck.checkedAt).toLocaleString('ko-KR')} 확인</span>
                      </p>
                      {prCheck.checks.length > 0 && (
                        <ul className="small ci-list">
                          {prCheck.checks.map((c) => (
                            <li key={c.name}>
                              {c.name}: {c.status === 'completed' ? c.conclusion : c.status}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  <button type="button" className="btn btn-small" disabled={busy || !task.prUrl} onClick={() => void run(() => actions.checkPr!(task))}>
                    {prCheck ? 'PR·CI 다시 확인' : 'PR·CI 확인'}
                  </button>
                </div>
              ) : (
                <label className="check">
                  <input id={`ci-${task.id}`} type="checkbox" checked={ciChecked} onChange={(e) => setCiChecked(e.target.checked)} />
                  PR의 CI(verify) 통과와 main 병합을 확인했습니다 (로컬 데모: 서버 확인 없음)
                </label>
              )}
              <button
                type="button"
                className="btn btn-small btn-primary"
                disabled={busy || !cCheck.ok || !task.prUrl || (actions.checkPr || prCheck ? !prCheckPasses(prCheck ?? null) : !ciChecked)}
                onClick={() =>
                  void run(async () => {
                    const ok = await actions.decide(task, 'C', view.result!.revision, 'approved', '', { pr_url: task.prUrl, ci: prCheck ? { state: prCheck.ciState, merged: prCheck.merged, sha: prCheck.headSha } : 'manual' });
                    // 소유자 결정(2026-10-30): 배포 승인 = 운영 배포. 승인이 기록되면 바로 서버가 release를 앞당긴다.
                    if (ok && actions.deploy) await actions.deploy(task);
                  })
                }
              >
                {actions.deploy ? '배포 승인 + 배포' : '배포 승인'}
              </button>
              {!task.prUrl && <p className="muted small">PR이 열리면 주소가 자동으로 기록됩니다(Claude 결과). 다른 경우 PR 주소를 기록하세요.</p>}
            </>
          )}
        </section>
      )}
      </details>
    </div>
  );
}

const MARK: Record<'met' | 'partial' | 'unmet', string> = { met: '✓', partial: '△', unmet: '✗' };

/** 결과 점수표(v0.4.64): 규칙 검사·AI 점수·판정. 올리기 승인은 늘 사람이 한다.
 *  v0.7.8 3중 평가: Gemini A(요청·사용자)·Gemini B(코드 품질·안전)·동료 개발 AI 점수를 각각, 그리고 평균. */
function ReviewCard({ review, onFinish, busy }: { review: ResultReview | null; onFinish?: () => void; busy?: boolean }) {
  if (!review) return <p className="muted small review-wait">AI 평가 중… (규칙 검사 → Gemini A·B → 동료 AI)</p>;
  const bad = review.gates.filter((g) => !g.ok);
  const panel = review.panel ?? [];
  const waiting = panel.some((p) => p.status === 'pending');
  // 옛 기록(v0.6.26 교차 채점): 두 점수와 평균
  const cross = panel.length ? null : (review.crossTotal ?? null);
  const avg = cross !== null && review.total !== null ? Math.round((review.total + cross) / 2) : review.total;
  const totals = panel.length ? panel.filter((p) => p.status === 'done').map((p) => p.total ?? 0) : cross !== null && review.total !== null ? [review.total, cross] : [];
  const split = totals.length >= 2 && Math.max(...totals) - Math.min(...totals) >= 20;
  const name = (p: PanelEntry) => (p.who === 'peer' ? p.judge : `Gemini ${p.who}`) + (p.judge.includes('파일 확인') ? ' · 파일 확인' : '');
  return (
    <div className={`review-card is-${waiting ? 'wait' : review.verdict}`}>
      <p className="review-head">
        <b>AI 평가{avg === null ? '' : totals.length >= 2 ? ` 평균 ${avg}점` : ` ${avg}점`}</b>
        <span className={`review-verdict is-${waiting ? 'wait' : review.verdict}`}>{waiting ? '점수 모으는 중' : VERDICT_LABEL[review.verdict]}</span>
        <span className="muted small">{review.judge}</span>
      </p>
      {panel.length > 0 && (
        <ul className="review-panel small">
          {panel.map((p) => (
            <li key={p.who} className={`is-${p.status}`}>
              <span className="review-who">
                <b>{name(p)}</b> <span className="muted">· {p.perspective}</span>
              </span>
              <span className={`mono review-score${p.status === 'done' && (p.total ?? 0) < PASS_SCORE ? ' is-low' : ''}`}>{p.status === 'done' ? `${p.total}점` : p.status === 'pending' ? '기다리는 중' : '빠짐'}</span>
              {p.status === 'done' && (p.summary || p.points.length > 0) && (
                <details className="review-who-more">
                  <summary>{p.points.length ? `지적 ${p.points.length}개` : '총평'}</summary>
                  {p.summary && <p>{p.summary}</p>}
                  {p.points.length > 0 && (
                    <ul>
                      {p.points.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
              {p.status !== 'done' && p.note && <span className="muted review-who-more">{p.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {cross !== null && (
        <p className="small">
          {review.judge.split(' ·')[0]} {review.total ?? '-'}점 · {review.crossJudge ?? '교차'} {cross}점
          {review.crossReasons && review.crossReasons.length > 0 && <span className="muted"> — {review.crossJudge} 지적: {review.crossReasons.join(' / ')}</span>}
        </p>
      )}
      {split && (
        <p className="small">
          <b className="warn-text">채점이 엇갈려요(20점 넘게 차이). 직접 확인해 주세요.</b>
        </p>
      )}
      {waiting && onFinish && (
        <p className="small">
          <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={onFinish} title="동료 AI 점수를 기다리지 않고 지금 모인 점수(평균·과반)로 판정해요">
            기다리지 않고 지금 판정
          </button>
        </p>
      )}
      {review.score && panel.filter((p) => p.status === 'done').length > 1 && <p className="muted small">항목별 평균</p>}
      {review.score && (
        <ul className="review-parts">
          {(Object.keys(WEIGHTS) as Part[]).map((k) => (
            <li key={k}>
              <span>{PART_LABEL[k]}</span>
              <span className="review-bar" aria-hidden="true">
                <span style={{ width: `${(100 * review.score!.parts[k]) / WEIGHTS[k]}%` }} />
              </span>
              <span className="mono small">
                {review.score!.parts[k]}/{WEIGHTS[k]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!panel.length && review.score?.summary && <p className="small">{review.score.summary}</p>}
      {review.score && review.score.criteria.length > 0 && (
        <details>
          <summary className="small">완료 기준 {review.score.criteria.filter((c) => c.status === 'met').length}/{review.score.criteria.length} 충족</summary>
          <ul className="review-criteria small">
            {review.score.criteria.map((c, i) => (
              <li key={i} className={`is-${c.status}`}>
                <b>{MARK[c.status]}</b> {c.text}
                {c.evidence && <span className="muted"> — {c.evidence}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {bad.length > 0 && (
        <ul className="review-gates small">
          {bad.map((g) => (
            <li key={g.id} className={g.blocking ? 'is-block' : ''}>
              {g.blocking ? '막힘' : '참고'} · {g.label}: {g.detail}
            </li>
          ))}
        </ul>
      )}
      {!waiting && review.verdict !== 'pass' && review.reasons.length > 0 && (
        <p className="small">
          {review.verdict === 'redo' ? '자동으로 다시 개발을 보냈어요: ' : '사장님이 정해 주세요: '}
          {review.reasons.join(' / ')}
        </p>
      )}
    </div>
  );
}
