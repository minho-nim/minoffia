// 누가 누구를 기다리나 그림(v0.5.24, 소유자 "말풍선 좋은데 사무실 그림에는 말고 업무 카드에"):
// 앞 작업을 맡은 캐릭터 → 점선 → 기다리는 캐릭터 위에 말풍선. 계획의 dependencies로만 그린다(꾸며낸 활동 없음, 토큰 0).
import { AGENT_BY_ID } from '../domain/agents';
import { waitingOn } from '../domain/concurrency';
import type { AgentId } from '../domain/types';
import type { AgentAssignment, PmPlan } from '../domain/workflow-types';
import { characterUrl } from '../office/assets';

const idOf = (a: AgentAssignment): AgentId => (a.assignee === 'gemini' ? 'studioA' : a.assignee);

const stateOf = (a: AgentAssignment | undefined): string =>
  !a ? '없음' : a.dispatchStatus === 'started' || a.dispatchStatus === 'starting' ? '하는 중' : a.dispatchStatus === 'failed' || a.dispatchStatus.startsWith('blocked') ? '막힘' : '시작 전';

function Who({ a, bubble, wait }: { a: AgentAssignment | undefined; bubble: string; wait?: boolean }) {
  const url = a ? characterUrl(idOf(a), 'stand') : null;
  return (
    <div className="wait-who">
      <span className={`wait-bubble${wait ? ' is-wait' : ''}`}>{bubble}</span>
      {url ? <img src={url} alt="" width={24} height={40} /> : <span className="wait-dot" aria-hidden="true" />}
      <span className="wait-name">{a ? `${AGENT_BY_ID[idOf(a)].name} · ${a.workItemId}` : '-'}</span>
    </div>
  );
}

export function WaitMap({ assignments, all, plan }: { assignments: AgentAssignment[]; all: AgentAssignment[]; plan: PmPlan | null }) {
  const rows = assignments.flatMap((a) =>
    waitingOn(a, all, plan).map((w) => ({ waiter: a, dep: assignments.find((x) => x.workItemId === w.workItemId), depId: w.workItemId })),
  );
  if (!rows.length) return null;
  return (
    <div className="wait-map" aria-label="작업끼리 기다리는 관계">
      {rows.slice(0, 4).map((r) => (
        <div key={`${r.depId}-${r.waiter.id}`} className="wait-row">
          <Who a={r.dep} bubble={`${r.depId} ${stateOf(r.dep)}`} />
          <span className="wait-line" aria-hidden="true" />
          <Who a={r.waiter} bubble={`⏳ ${r.depId} 기다림`} wait />
        </div>
      ))}
      {rows.length > 4 && <p className="muted small">외 {rows.length - 4}개 더 기다리는 중</p>}
    </div>
  );
}
