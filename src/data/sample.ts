import type { Snapshot, Task } from '../domain/types';
import type { TaskSpec } from '../domain/workflow-types';
import { kstDay } from '../domain/usage';

/** 로컬 데모 첫 화면용 예시. 실제 저장소와 연결되어 있지 않다. */
export function sampleSnapshot(now: Date = new Date()): Snapshot {
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  const projects = [
    { id: 'p-minlab', name: 'MinLab', repo: null, description: '개인 연구실 사이트', sample: true, createdAt: at(4000) },
    { id: 'p-musclemap', name: 'MuscleMap', repo: null, description: '운동 부위 기록 앱', sample: true, createdAt: at(3000) },
    { id: 'p-crossroads', name: 'Crossroads', repo: null, description: '친구들과 하는 선택지 게임', sample: true, createdAt: at(2000) },
  ];
  const t = (p: Partial<Task> & Pick<Task, 'id' | 'projectId' | 'title' | 'type' | 'assignee' | 'status' | 'routeReason'>): Task => ({
    description: '',
    requestedType: 'auto',
    priority: 'normal',
    dispatch: { state: 'none' },
    sample: true,
    createdAt: at(300),
    updatedAt: at(30),
    ...p,
  });
  const tasks: Task[] = [
    t({
      id: 's-1', projectId: 'p-musclemap', title: '부위별 기록 화면 구현', type: 'dev', assignee: 'codex', status: 'in_progress',
      description: '근육 부위를 누르면 오늘 기록이 열리게 한다.', routeReason: "키워드 '구현' → 개발 → Codex",
    }),
    t({
      id: 's-2', projectId: 'p-crossroads', title: '선택지 분기 구조 설계', type: 'planning', assignee: 'claude', status: 'queued',
      routeReason: "키워드 '설계', '구조' → 기획·설계 → Claude",
    }),
    t({
      id: 's-3', projectId: 'p-minlab', title: '메인 화면 도트 캐릭터 시안', type: 'design', assignee: 'studioA', status: 'review',
      routeReason: "키워드 '화면', '도트', '캐릭터' → UI·디자인 → Studio A",
    }),
    t({
      id: 's-4', projectId: 'p-minlab', title: '무료 호스팅 한도 비교 조사', type: 'research', assignee: 'grok', status: 'blocked',
      routeReason: "키워드 '비교', '조사' → 리서치 → Grok",
      dispatch: { state: 'none', error: 'Grok 무료 한도 확인 필요. 내일 다시 전달.' },
    }),
    t({
      id: 's-5', projectId: 'p-musclemap', title: '로그인 회귀 테스트 점검', type: 'qa', assignee: 'ci', status: 'done',
      routeReason: "키워드 '테스트', '점검' → 검수·QA → CI 봇",
    }),
  ];
  const usage = [
    { id: 's-u1', agent: 'codex' as const, taskId: 's-1', kind: 'manual' as const, day: kstDay(now), createdAt: at(60) },
  ];
  // 예시: GPT 기획서가 붙어 A 승인을 기다리는 업무 하나
  const specs: TaskSpec[] = [
    {
      id: 's-spec-1',
      taskId: 's-2',
      revision: 1,
      intent: 'change_request',
      planner: 'chatgpt_manual',
      userOriginalText: '선택지 분기 구조 설계',
      finalPrompt: '친구들과 하는 선택지 게임의 장면·선택지·결말 데이터 구조를 설계한다. 기존 화면은 바꾸지 않는다.',
      changeScope: 'src/story 데이터 구조, 문서',
      preserveConstraints: '기존 화면·저장 데이터 유지',
      testCriteria: 'npm test 통과, 예시 시나리오 3개 로딩',
      answer: '',
      createdAt: at(120),
    },
  ];
  return { projects, tasks, usage, workflow: { specs, approvals: [], plans: [], assignments: [], results: [], revisionRequests: [], attachments: [], imageAnalyses: [], links: [], clarifications: [] } };
}
