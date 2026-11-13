// 사무실 지도(v0.6.71, 소유자 "역할 지도, 클라우드 관계도도"): 미노피아 전체 지도. 역할 = 누가 업무의 어디를 맡나(승인 3개),
// 클라우드 = 서비스끼리 무엇이 오가나. 목록과 선은 지금 구조(CLAUDE.md·FLOW) 그대로 코드에 적어 두고, 상태는 앱이 이미 가진 확인된 것만 붙인다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSvg, NetView, type NetStyle } from './RelationMap';
import type { RelEdge, RelNode } from '../domain/relation';

export interface OfficeState {
  /** 마지막 운영 배포(확인된 기록) */
  lastDeploy?: string;
  /** 휴가 중인 에이전트 이름 */
  onLeave?: string[];
}
type N = [id: string, label: string, type: string, desc: string];

const ROLE: { nodes: N[]; links: [string, string][] } = {
  nodes: [
    ['owner', '나(소유자)', 'person', '요청하고, 승인 3개(기획·올리기·배포)만 누른다.'],
    ['pm', 'Claude PM', 'agent', '요청을 기획서와 작업으로 나누고 담당을 정한다.'],
    ['codex', 'Codex', 'agent', '주 개발. Linear로 받아 저장소에서 개발하고 결과를 보낸다.'],
    ['claude', 'Claude', 'agent', '보조 개발. 루틴으로 받아 개발한다.'],
    ['gemini', 'Gemini', 'agent', '결과 채점(기본)과 분배 보조. 무료 키.'],
    ['server', '서버(자동)', 'server', '실행 승인 자동 기록, PR 열기, 배포, 알림.'],
    ['skills', '저장소 스킬', 'skill', '개발 AI가 필요할 때 꺼내 쓰는 작업 설명서(프로젝트마다).'],
    ['s-req', '요청', 'stage', '대화창에 쓴 요청.'],
    ['s-plan', '기획', 'stage', '기획서와 작업 나누기.'],
    ['g-a', '기획 승인', 'gate', '소유자가 누름. 실행 승인도 함께 자동 기록.'],
    ['s-dev', '개발', 'stage', '작업 브랜치에서 개발·시험.'],
    ['s-rev', '채점', 'stage', '결과 점수. 낮으면 다시 개발.'],
    ['g-b', '올리기 승인', 'gate', '소유자가 결과를 보고 누름.'],
    ['s-pr', 'PR', 'stage', '서버가 PR을 열고 검사.'],
    ['g-c', '배포 승인', 'gate', '소유자가 누름.'],
    ['s-dep', '배포', 'stage', '서버가 운영에 올림.'],
  ],
  links: [['owner', 's-req'], ['owner', 'g-a'], ['owner', 'g-b'], ['owner', 'g-c'], ['pm', 's-plan'], ['codex', 's-dev'], ['claude', 's-dev'], ['gemini', 's-rev'], ['server', 'g-a'], ['server', 's-pr'], ['server', 's-dep'], ['codex', 'skills'], ['claude', 'skills'],
    ['s-req', 's-plan'], ['s-plan', 'g-a'], ['g-a', 's-dev'], ['s-dev', 's-rev'], ['s-rev', 'g-b'], ['g-b', 's-pr'], ['s-pr', 'g-c'], ['g-c', 's-dep']],
};
const CLOUD: { nodes: N[]; links: [string, string, string][] } = {
  nodes: [
    ['app', '휴대폰 앱', 'person', '아이폰 홈 화면 앱(미노피아).'],
    ['cf', 'Cloudflare Pages', 'svc', '화면 파일을 내려 준다(release 브랜치).'],
    ['sb', 'Supabase', 'svc', 'DB · 서버 함수 · 알림 · 파일.'],
    ['gh', 'GitHub', 'svc', '저장소와 Actions(검사·배포·스킬 넣기·점검).'],
    ['linear', 'Linear', 'ext', 'Codex에게 업무를 넘기는 통로.'],
    ['codexc', 'Codex 클라우드', 'agent', '주 개발 AI가 일하는 곳.'],
    ['routine', 'Claude 루틴', 'agent', '보조 개발 AI가 일하는 곳.'],
    ['gem', 'Gemini API', 'ext', '채점·초안·질문 답(무료 키).'],
    ['exa', 'Exa 검색', 'ext', '웹 조사: 찾은 글을 Gemini가 정리(무료 사용량).'],
    ['notes', '노트 보관함', 'ext', '앱 지도·버전 노트(Obsidian, 저장소가 있을 때).'],
  ],
  links: [['app', 'cf', '화면 받기'], ['app', 'sb', '로그인 · 자료'], ['sb', 'gh', '저장소 읽기 · Actions'], ['sb', 'linear', '업무 맡기기'], ['linear', 'codexc', '위임'], ['codexc', 'sb', '결과 보내기'], ['sb', 'routine', '업무 맡기기'], ['routine', 'sb', '결과 보내기'], ['sb', 'gem', '채점 · 초안'], ['sb', 'exa', '웹 조사'], ['gh', 'cf', '배포'], ['gh', 'notes', '앱 지도 · 버전 노트'], ['codexc', 'gh', '작업 브랜치'], ['routine', 'gh', '작업 브랜치']],
};
const STYLE: NetStyle = {
  person: { color: '--accent', name: '사람·기기', size: 11 },
  agent: { color: '--info', name: 'AI', size: 9 },
  server: { color: '--muted', name: '서버', size: 9 },
  skill: { color: '--info', name: '스킬', size: 6 },
  stage: { color: '--muted', name: '단계', size: 6 },
  gate: { color: '--accent', name: '소유자 승인', size: 7 },
  svc: { color: '--ok', name: '서비스', size: 10 },
  ext: { color: '--warn', name: '외부 서비스', size: 7 },
};
const AGENT_NAME: Record<string, string> = { codex: 'Codex', claude: 'Claude', gemini: 'Gemini' };

export function OfficeMap({ tab, state = {} }: { tab: 'role' | 'cloud'; state?: OfficeState }) {
  const [view, setView] = useState<'line' | 'net'>('line');
  const [sel, setSel] = useState<string | null>(null);
  const stateOf = (id: string): string | undefined => {
    if (id === 'cf' && state.lastDeploy) return `마지막 배포 ${new Date(state.lastDeploy).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    if (AGENT_NAME[id] && state.onLeave?.includes(id)) return '휴가 중';
    return undefined;
  };
  const D = tab === 'role' ? ROLE : CLOUD;
  const spec = useMemo(() => ({ nodes: D.nodes.map(([id, label, type, desc]) => ({ id, label, type, desc, state: stateOf(id) })), links: D.links }), [tab, state.lastDeploy, state.onLeave?.join()]);
  const node = (id: string): RelNode => {
    const [, label, type] = D.nodes.find((n) => n[0] === id)!;
    const kind = type === 'gate' || id === 'owner' || id === 'app' ? 'group' : type === 'agent' || type === 'skill' ? 'skill' : type === 'ext' ? 'mcp' : 'proj';
    return { id, label, kind, sub: stateOf(id), group: type === 'gate' || type === 'stage' ? 'f' : type };
  };
  const line = useMemo(() => {
    if (tab === 'role') {
      const flow = ['s-req', 's-plan', 'g-a', 's-dev', 's-rev', 'g-b', 's-pr', 'g-c', 's-dep'];
      const who = ['owner', 'pm', 'codex', 'claude', 'gemini', 'server'];
      const edges: RelEdge[] = ROLE.links.filter(([a, b]) => who.includes(a) && flow.includes(b)).map(([a, b]) => [b, a, 1]);
      return { rows: [flow.map(node), who.map(node)], edges, hint: '왼쪽(넓은 화면은 위) = 업무 순서(굵은 테두리 = 소유자 승인), 오른쪽 = 누가 하는지. 상자를 누르면 이어진 선만 진하게.' };
    }
    const rows = [['app'], ['cf', 'sb', 'gh'], ['linear', 'codexc', 'routine', 'gem', 'exa', 'notes']];
    return { rows: rows.map((r) => r.map(node)), edges: CLOUD.links.map(([a, b]): RelEdge => [a, b, 1]), hint: '위에서 아래로: 휴대폰 → 화면·서버·저장소 → 일하는 곳과 외부 서비스. 상자를 누르면 무엇이 오가는지 옆에 나와요.' };
  }, [tab, state.lastDeploy, state.onLeave?.join()]);
  const [width, setWidth] = useState(360);
  const roRef = useRef<ResizeObserver | null>(null);
  useEffect(() => () => roRef.current?.disconnect(), []);
  const selDesc = sel ? D.nodes.find((n) => n[0] === sel) : null;
  const selLinks = sel && tab === 'cloud' ? CLOUD.links.filter(([a, b]) => a === sel || b === sel) : [];
  const nameOf = (id: string) => D.nodes.find((n) => n[0] === id)?.[1] ?? id;

  return (
    <div className="rel">
      <div className="rel-top">
        <span className="small muted">{tab === 'role' ? '누가 업무의 어디를 맡나' : '서비스끼리 무엇이 오가나'}</span>
        <div className="seg" role="group" aria-label="보기 방식">
          {(['line', 'net'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'line' ? '줄' : '그물'}
            </button>
          ))}
        </div>
      </div>
      {view === 'net' ? (
        <NetView spec={spec} style={STYLE} />
      ) : (
        <div className="rel-main">
          <div className="rel-stage">
            <div
              className="rel-graph"
              ref={(el) => {
                if (!el) {
                  roRef.current?.disconnect();
                  roRef.current = null;
                  return;
                }
                if (roRef.current) return;
                // 처음 크기와 화면 크기가 바뀔 때마다 다시 잰다
                roRef.current = new ResizeObserver(() => setWidth(el.clientWidth));
                roRef.current.observe(el);
              }}
            >
              <LineSvg rows={line.rows} edges={line.edges} sel={sel} width={width} onPress={(n) => setSel((s) => (s === n.id ? null : n.id))} />
            </div>
          </div>
          <aside className="rel-side">
            {selDesc && (
              <div className="rel-info">
                <b>{selDesc[1]}</b>
                {stateOf(selDesc[0]) && <span className="small muted">{stateOf(selDesc[0])}</span>}
                <span className="small">{selDesc[3]}</span>
                {selLinks.length > 0 && (
                  <ul className="rel-flows small">
                    {selLinks.map(([a, b, l]) => (
                      <li key={`${a}-${b}-${l}`}>
                        {nameOf(a)} → {nameOf(b)}: {l}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="small muted">{line.hint}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
