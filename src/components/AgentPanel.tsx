import { VERDICT_LABEL } from '../domain/review';
import type { ResultReview } from '../domain/workflow-types';
import { coverFor } from '../domain/router';
import { speechFor } from '../office/speech';
import { markFor, type AgentMark } from '../office/marks';
import { buildScene } from '../office/scene';
import { useState } from 'react';
import type { LinearProbe } from '../data/store';
import { ADAPTER_STATE_LABEL, ADAPTERS, geminiAdapter } from '../domain/adapters';
import { AGENT_BY_ID, AGENTS, MODE_LABEL } from '../domain/agents';
import { quotaFor, QUOTA_STATE_LABEL, type QuotaInfo } from '../domain/quota';
import { limitFor, MAX_AGENT_LIMIT } from '../domain/concurrency';
import type { AgentKind } from '../domain/workflow-types';
import type { AgentAssignment } from '../domain/workflow-types';
import { remainingToday, runsToday } from '../domain/usage';
import type { AgentId, AiCall, Snapshot, Task, UsageRun } from '../domain/types';
import { STATUS_LABEL } from '../domain/types';
import { spriteFor } from '../office/sprites';

interface Props {
  agentId: AgentId;
  /** 사무실 말풍선과 같은 표시(없으면 휴식) */
  speech?: AgentMark;
  /** 휴가 중이면 표시를 '휴가'로 */
  leave?: boolean;
  /** 휴가인 AI 대신 맡은 일(v0.4.51) */
  cover?: string[];
  tasks: Task[];
  usage: UsageRun[];
  assignments: AgentAssignment[];
  onOpenTask: (task: Task) => void;
  /** Gemini 실제 호출 기록(연결 상태 표시용) */
  aiCalls?: AiCall[];
  /** 서버(Supabase) 모드인가 */
  serverMode?: boolean;
  /** 오늘 한도 상태 */
  quota?: QuotaInfo;
  /** 동시 작업 상한(이 에이전트가 개발 작업을 맡는 AI일 때) */
  limit?: { kind: AgentKind; value: number; running: number; onSet: (n: number) => void };
  /** Codex: Linear 연결 확인(읽기만) */
  onLinearProbe?: () => Promise<LinearProbe>;
  /** 결과 점수 평가 기록(AI별 성적, v0.4.64) */
  reviews?: ResultReview[];
}

/** AI별 성적(v0.4.64): 이 AI가 만든 결과의 평가 통과 수·평균 점수. 나중에 배정 순서에 쓴다 */
export function reportCard(reviews: ResultReview[], kind: string | undefined): { total: number; passed: number; avg: number | null } | null {
  if (!kind) return null;
  const mine = reviews.filter((r) => r.assignee === kind);
  if (!mine.length) return null;
  const scored = mine.filter((r) => r.total !== null);
  return {
    total: mine.length,
    passed: mine.filter((r) => r.verdict === 'pass').length,
    avg: scored.length ? Math.round(scored.reduce((s, r) => s + (r.total ?? 0), 0) / scored.length) : null,
  };
}

/** 오피스 캐릭터 → 개발 작업을 맡는 AI(동시 작업 상한 대상) */
const KIND_OF: Partial<Record<AgentId, AgentKind>> = { codex: 'codex', claude: 'claude', grok: 'grok', studioA: 'gemini', studioB: 'gemini' };

/** 오피스 캐릭터 → 실행 경로(어댑터) */
const ADAPTER_OF: Partial<Record<AgentId, string>> = { claude: 'claude', codex: 'codex', grok: 'grok', studioA: 'gemini_vision', studioB: 'gemini_vision' };

/** Codex for Linear 연결 확인(읽기만). 결정 문서 docs/archive/CODEX_LINEAR_DECISION_2026-10-30.md 4-1단계 */
function LinearCheck({ onProbe }: { onProbe: () => Promise<LinearProbe> }) {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<LinearProbe | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="wf-manual">
      <p className="small">
        <b>Codex for Linear 연결 확인</b> — Linear에서 Codex를 찾을 수 있는지, 이슈를 맡길 수 있는지만 읽어 봅니다(아무것도 만들지 않음).
      </p>
      <button
        type="button"
        className="btn btn-small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr('');
          try {
            setR(await onProbe());
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '확인 중…' : 'Linear 연결 확인'}
      </button>
      {err && <p className="task-error small">{err}</p>}
      {r && !r.connected && <p className="small task-error">연결 안 됨: {r.reason}</p>}
      {r?.connected && (
        <ul className="small mini-list">
          <li>Linear 접속: 됨({r.viewer})</li>
          <li>팀: {r.teams?.length ? r.teams.map((t) => `${t.name}(${t.key})`).join(', ') : '없음'}</li>
          <li>Codex: {r.codexUser ? `찾음(${r.codexUser})` : '못 찾음 — Codex 설정에서 Codex for Linear를 설치하고 이슈에 @Codex로 계정을 연결하세요'}</li>
          <li>이슈 맡기기(위임): {r.canDelegate ? '가능' : '공식 칸 없음 — 다른 방법 검토 필요'}</li>
        </ul>
      )}
    </div>
  );
}

/** 에이전트 상태는 사무실 말풍선과 같은 표시 하나만(v0.4.35): ! 막힘 > ? 내 차례 > … 일하는 중 > 휴식 */
function SpeechMark({ speech, leave, onOpen }: { speech?: AgentMark; leave?: boolean; onOpen?: (taskId: string) => void }) {
  if (leave) return <span className="pill pill-mark pill-mark-leave">휴가</span>;
  if (!speech) return <span className="pill pill-mark pill-mark-rest">휴식</span>;
  // 표시를 누르면 그 업무 카드로(v0.4.65, 소유자)
  if (onOpen && speech.taskId)
    return (
      <button type="button" className={`pill pill-mark pill-mark-${speech.kind} pill-link`} title={`${speech.label} — 업무 카드 열기`} onClick={() => onOpen(speech.taskId!)}>
        {speech.text}
      </button>
    );
  return (
    <span className={`pill pill-mark pill-mark-${speech.kind}`} title={speech.label}>
      {speech.text}
    </span>
  );
}

export function AgentPanel({ agentId, tasks, usage, onOpenTask, aiCalls = [], serverMode = false, quota, limit, onLinearProbe, speech, leave, cover, reviews = [] }: Props) {
  const card = reportCard(reviews, KIND_OF[agentId]);
  const a = AGENT_BY_ID[agentId];
  const adapter = ADAPTER_OF[agentId] === 'gemini_vision' ? geminiAdapter(aiCalls, serverMode) : ADAPTERS.find((x) => x.agent === ADAPTER_OF[agentId]);
  // 미니엉은 담당자가 아니라 접수 데스크를 지킨다: 사무실과 같은 기준(끝나지 않았고 진행 중이 아닌 업무)으로 보여 준다(v0.4.65).
  const isDesk = agentId === 'mina';
  const mine = isDesk ? tasks.filter((t) => t.status !== 'done' && t.status !== 'in_progress') : tasks.filter((t) => t.assignee === agentId);
  const used = runsToday(usage, agentId);
  const left = remainingToday(usage, agentId);

  return (
    <div className="stack">
      <div className="agent-card">
        <img className={`agent-portrait${spriteFor(a, 'stand').art ? ' is-art' : ''}`} src={spriteFor(a, 'stand').src} alt="" />
        <div>
          <h3>{a.name}</h3>
          <p className="muted">
            {leave ? '휴가 중' : a.role}
            {!leave && cover?.length ? <span className="cover-roles"> + {cover.join(', ')}</span> : null} · {a.provider}
          </p>
          <p>
            <span className="pill">{MODE_LABEL[a.mode]}</span>{' '}
            <SpeechMark
              speech={speech}
              leave={leave}
              onOpen={(id) => {
                const t = tasks.find((x) => x.id === id);
                if (t) onOpenTask(t);
              }}
            />
          </p>
        </div>
      </div>
      <p>{a.note}</p>
      {adapter && (
        <div className="wf-manual">
          <p className="small">
            <b>{adapter.label}</b> · <span className={`pill pill-adapter-${adapter.state}`}>{ADAPTER_STATE_LABEL[adapter.state]}</span>
            {' '}· PC 꺼도 {adapter.worksWithPcOff ? '동작' : '불가'}
          </p>
          <p className="muted small">
            {adapter.reason} (확인 {adapter.checkedAt})
          </p>
        </div>
      )}
      {agentId === 'codex' && serverMode && onLinearProbe && <LinearCheck onProbe={onLinearProbe} />}
      {quota && (
        <p className="small">
          오늘 한도 <span className={`pill pill-quota-${quota.state}`}>{QUOTA_STATE_LABEL[quota.state]}</span> {quota.label !== QUOTA_STATE_LABEL[quota.state] && quota.label}
          <br />
          <span className="muted">{quota.detail}</span>
        </p>
      )}
      {limit && (
        <div className="small agent-limit">
          동시 작업 상한 · 지금 {limit.running}개 진행
          <span className="att-roles" role="group" aria-label="동시 작업 상한">
            {Array.from({ length: MAX_AGENT_LIMIT }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className="att-role" aria-pressed={limit.value === n} onClick={() => limit.onSet(n)}>
                {n}
              </button>
            ))}
          </span>
          <span className="muted">같은 AI에게 동시에 시작할 수 있는 개발 작업 수. 계획의 순서(앞 작업)는 따로 지킵니다.</span>
        </div>
      )}
      <p className="small">
        오늘 등록된 실행 <b className="num">{used}</b>
        {a.dailyCap !== null ? (
          <>
            {' '}
            / {a.dailyCap}회 · 남은 횟수 <b className="num">{left}</b>
          </>
        ) : (
          ' · 상한 없음'
        )}
        <br />
        <span className="muted">공급자의 잔여 토큰이 아니라 이 오피스에 기록된 실행 횟수입니다.</span>
      </p>
      {card && (
        <p className="small">
          결과 평가 통과 <b className="num">{card.passed}</b> / {card.total}건{card.avg !== null && <> · 평균 <b className="num">{card.avg}</b>점</>}
        </p>
      )}
      <h4>
        {isDesk ? '접수 데스크의 업무' : '맡은 업무'} {mine.length}
      </h4>
      {mine.length === 0 ? (
        <p className="empty">{isDesk ? '접수·검토·막힌 업무가 없어 휴게실에서 쉬고 있습니다.' : '맡은 업무가 없어 휴게실에서 쉬고 있습니다.'}</p>
      ) : (
        <ul className="mini-list">
          {mine.map((t) => (
            <li key={t.id}>
              <button type="button" className="link-btn" onClick={() => onOpenTask(t)}>
                <span className={`pill pill-${t.status}`}>{STATUS_LABEL[t.status]}</span> {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 에이전트 탭: 모든 에이전트를 보여 주고, 고른 에이전트는 맨 위에 자세히 펼친다.
 * 나머지는 한 줄 요약(지금 하는 일·오늘 한도·맡은 업무 수)이고 누르면 펼쳐진다.
 */
export function AgentRoster({
  snap,
  selected,
  onSelect,
  onOpenTask,
  serverMode,
  onSetLimit,
  onLinearProbe,
}: {
  onLinearProbe?: () => Promise<LinearProbe>;
  snap: Snapshot;
  onSetLimit: (kind: AgentKind, n: number) => void;
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
  onOpenTask: (task: Task) => void;
  serverMode: boolean;
}) {
  const speechMap = speechFor(snap.tasks, snap.workflow, snap.leave ?? []);
  const scene = buildScene(snap.tasks, snap.workflow.assignments);
  const markOf = (id: AgentId) => markFor(id, scene, speechMap);
  const leave = snap.leave ?? [];
  // 휴가인 AI는 맨 아래로(v0.4.51). 펼친 AI는 맨 위 그대로.
  const byDuty = [...AGENTS.filter((a) => !leave.includes(a.id)), ...AGENTS.filter((a) => leave.includes(a.id))];
  const ordered = selected ? [AGENT_BY_ID[selected], ...byDuty.filter((a) => a.id !== selected)] : byDuty;
  const covers = coverFor(leave);
  return (
    <div className="stack">
      {ordered.map((a) => {
        if (a.id === selected) {
          return (
            <section key={a.id} className="agent-expanded" aria-label={`${a.name} 자세히`}>
              <AgentPanel
                agentId={a.id}
                speech={markOf(a.id)}
                leave={leave.includes(a.id)}
                cover={covers[a.id]}
                tasks={snap.tasks}
                usage={snap.usage}
                assignments={snap.workflow.assignments}
                reviews={snap.workflow.reviews ?? []}
                aiCalls={snap.aiCalls ?? []}
                serverMode={serverMode}
                quota={quotaFor(a.id, snap)}
                limit={
                  KIND_OF[a.id]
                    ? {
                        kind: KIND_OF[a.id]!,
                        value: limitFor(KIND_OF[a.id]!, snap.agentLimits),
                        running: snap.workflow.assignments.filter((x) => x.assignee === KIND_OF[a.id] && (x.dispatchStatus === 'started' || x.dispatchStatus === 'starting')).length,
                        onSet: (n) => onSetLimit(KIND_OF[a.id]!, n),
                      }
                    : undefined
                }
                onOpenTask={onOpenTask}
                onLinearProbe={onLinearProbe}
              />
            </section>
          );
        }
        const q = quotaFor(a.id, snap);
        return (
          <button key={a.id} type="button" className="agent-row" onClick={() => onSelect(a.id)} aria-label={`${a.name} 펼치기`}>
            <img className={`agent-row-portrait${spriteFor(a, 'stand').art ? ' is-art' : ''}`} src={spriteFor(a, 'stand').src} alt="" />
            <span className="agent-row-main">
              <b>{a.name}</b>{' '}
              <span className="muted small">
                {leave.includes(a.id) ? '휴가 중' : a.role}
                {!leave.includes(a.id) && covers[a.id]?.length ? <span className="cover-roles"> + {covers[a.id]!.join(', ')}</span> : null}
              </span>
              <span className="agent-row-pills">
                <SpeechMark speech={markOf(a.id)} leave={leave.includes(a.id)} />
                <span className={`pill pill-quota-${q.state}`} title={q.detail}>
                  {q.label}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 결과 평가 기록(v0.4.66, 소유자 "채점 결과 확인"): 최근 평가를 점수·판정과 함께. 누르면 그 업무 카드로 */
export function ReviewLog({ reviews, tasks, onOpenTask }: { reviews: ResultReview[]; tasks: Task[]; onOpenTask: (task: Task) => void }) {
  const [all, setAll] = useState(false);
  const list = [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = all ? list : list.slice(0, 5);
  return (
    <section className="review-log" aria-label="결과 평가 기록">
      <h3>
        결과 평가 <span className="num num-count">{reviews.length}</span>
      </h3>
      {!reviews.length ? (
        <p className="muted small">아직 평가한 결과가 없어요. 개발 결과가 오면 규칙 검사와 Claude 채점(안 되면 Gemini)이 자동으로 돌아요.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const t = tasks.find((x) => x.id === r.taskId);
            return (
              <li key={r.id}>
                <button type="button" className="link-btn review-log-row" disabled={!t} onClick={() => t && onOpenTask(t)}>
                  <span className={`review-verdict is-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                  <b className="num">{r.total === null ? '–' : `${r.total}점`}</b>
                  <span className="review-log-title">
                    {t?.title ?? '(지운 업무)'} · 결과 v{r.resultRevision}
                  </span>
                  <span className="muted small">{r.assignee ? AGENT_NAME_OF[r.assignee] ?? r.assignee : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 5 && (
        <button type="button" className="link-btn small" onClick={() => setAll((v) => !v)}>
          {all ? '접기' : `모두 보기(${list.length})`}
        </button>
      )}
    </section>
  );
}

const AGENT_NAME_OF: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', grok: 'Grok' };
