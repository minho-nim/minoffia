import { ADAPTER_STATE_LABEL, ADAPTERS, geminiAdapter } from '../domain/adapters';
import { AGENT_BY_ID, AGENTS, MODE_LABEL } from '../domain/agents';
import { quotaFor, QUOTA_STATE_LABEL, type QuotaInfo } from '../domain/quota';
import { limitFor, MAX_AGENT_LIMIT } from '../domain/concurrency';
import type { AgentKind } from '../domain/workflow-types';
import type { AgentAssignment } from '../domain/workflow-types';
import { remainingToday, runsToday } from '../domain/usage';
import type { AgentId, AiCall, Snapshot, Task, UsageRun } from '../domain/types';
import { STATUS_LABEL } from '../domain/types';
import { ACTIVITY_LABEL, buildScene } from '../office/scene';
import { spriteFor } from '../office/sprites';

interface Props {
  agentId: AgentId;
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
}

/** 오피스 캐릭터 → 개발 작업을 맡는 AI(동시 작업 상한 대상) */
const KIND_OF: Partial<Record<AgentId, AgentKind>> = { codex: 'codex', claude: 'claude', grok: 'grok', studioA: 'gemini', studioB: 'gemini' };

/** 오피스 캐릭터 → 실행 경로(어댑터) */
const ADAPTER_OF: Partial<Record<AgentId, string>> = { claude: 'claude', codex: 'codex', grok: 'grok', studioA: 'gemini_vision', studioB: 'gemini_vision', mina: 'gpt' };

export function AgentPanel({ agentId, tasks, usage, assignments, onOpenTask, aiCalls = [], serverMode = false, quota, limit }: Props) {
  const a = AGENT_BY_ID[agentId];
  const scene = buildScene(tasks, assignments).find((s) => s.agent === agentId);
  const adapter = ADAPTER_OF[agentId] === 'gemini_vision' ? geminiAdapter(aiCalls, serverMode) : ADAPTERS.find((x) => x.agent === ADAPTER_OF[agentId]);
  const mine = tasks.filter((t) => t.assignee === agentId);
  const used = runsToday(usage, agentId);
  const left = remainingToday(usage, agentId);

  return (
    <div className="stack">
      <div className="agent-card">
        <img className={`agent-portrait${spriteFor(a, 'stand').art ? ' is-art' : ''}`} src={spriteFor(a, 'stand').src} alt="" />
        <div>
          <h3>{a.name}</h3>
          <p className="muted">
            {a.role} · {a.provider}
          </p>
          <p>
            <span className="pill">{MODE_LABEL[a.mode]}</span>{' '}
            {scene && <span className={`pill pill-act-${scene.activity}`}>{ACTIVITY_LABEL[scene.activity]}</span>}
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
      <h4>맡은 업무 {mine.length}</h4>
      {mine.length === 0 ? (
        <p className="empty">맡은 업무가 없어 휴게실에서 쉬고 있습니다.</p>
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
}: {
  snap: Snapshot;
  onSetLimit: (kind: AgentKind, n: number) => void;
  selected: AgentId | null;
  onSelect: (id: AgentId) => void;
  onOpenTask: (task: Task) => void;
  serverMode: boolean;
}) {
  const scene = buildScene(snap.tasks, snap.workflow.assignments);
  const ordered = selected ? [AGENT_BY_ID[selected], ...AGENTS.filter((a) => a.id !== selected)] : AGENTS;
  return (
    <div className="stack">
      {ordered.map((a) => {
        if (a.id === selected) {
          return (
            <section key={a.id} className="agent-expanded" aria-label={`${a.name} 자세히`}>
              <AgentPanel
                agentId={a.id}
                tasks={snap.tasks}
                usage={snap.usage}
                assignments={snap.workflow.assignments}
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
              />
            </section>
          );
        }
        const s = scene.find((x) => x.agent === a.id);
        const q = quotaFor(a.id, snap);
        const open = snap.tasks.filter((t) => t.assignee === a.id && t.status !== 'done').length;
        return (
          <button key={a.id} type="button" className="agent-row" onClick={() => onSelect(a.id)} aria-label={`${a.name} 펼치기`}>
            <img className={`agent-row-portrait${spriteFor(a, 'stand').art ? ' is-art' : ''}`} src={spriteFor(a, 'stand').src} alt="" />
            <span className="agent-row-main">
              <b>{a.name}</b> <span className="muted small">{a.role}</span>
              <span className="agent-row-pills">
                {s && <span className={`pill pill-act-${s.activity}`}>{ACTIVITY_LABEL[s.activity]}</span>}
                <span className={`pill pill-quota-${q.state}`} title={q.detail}>
                  {q.label}
                </span>
                <span className="muted small">업무 {open}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
