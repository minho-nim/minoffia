// 얇은 머리의 주고받기 한 줄(v0.7.62): 캐릭터 얼굴과 사이를 지나가는 점. 지금 일하는 칸은 진하게.
import { Fragment, useMemo } from 'react';
import { AGENT_BY_ID } from '../domain/agents';
import { flowNow } from '../domain/flowNow';
import type { WorkflowData } from '../domain/workflow-types';
import { characterUrl } from '../office/assets';
import { useResearchPhase } from '../office/webResearch';

export function FlowStrip({ workflow }: { workflow: WorkflowData }) {
  const research = useResearchPhase();
  const flow = useMemo(() => flowNow(workflow, research ? { step: research.step, studio: research.studio } : null), [workflow, research]);
  if (!flow) return null;
  return (
    <span className="flow-strip" role="status" aria-label={flow.label} title={flow.label}>
      {flow.steps.map((id, i) => (
        <Fragment key={`${id}-${i}`}>
          {i > 0 && (
            <span className={`flow-arrow${i - 1 === flow.active ? ' is-moving' : ''}`} aria-hidden="true">
              <i />
            </span>
          )}
          <img className={i === flow.active ? 'is-on' : ''} src={characterUrl(id, 'stand') ?? ''} alt={AGENT_BY_ID[id]?.name ?? id} />
        </Fragment>
      ))}
    </span>
  );
}
