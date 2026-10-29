import { AGENT_BY_ID } from './agents';
import type { Project, Task } from './types';
import { PRIORITY_LABEL, WORK_TYPE_LABEL } from './types';

export function branchName(task: Pick<Task, 'id' | 'assignee'>): string {
  return `ai/${task.assignee.toLowerCase()}/${task.id.slice(0, 8)}`;
}

/** 다른 AI에게 붙여넣을 지시서. */
export function buildHandoff(task: Task, project: Project | undefined): string {
  const agent = AGENT_BY_ID[task.assignee];
  const repo = project?.repo ?? '(저장소 미연결: 결과물을 텍스트로 보고)';
  return [
    `# MinLab AI Office 작업 지시서`,
    ``,
    `- 담당: ${agent.name} (${agent.role})`,
    `- 프로젝트: ${project?.name ?? '알 수 없음'}`,
    `- 저장소: ${repo}`,
    `- 유형: ${WORK_TYPE_LABEL[task.type]} · 우선순위 ${PRIORITY_LABEL[task.priority]}`,
    `- 작업 ID: ${task.id}`,
    ``,
    `## 할 일`,
    task.title,
    ``,
    task.description.trim() || '(추가 설명 없음)',
    ``,
    `## 규칙`,
    `1. 새 브랜치 \`${branchName(task)}\`에서만 작업한다.`,
    `2. main에 직접 푸시·병합하지 않는다. 운영 배포를 하지 않는다.`,
    `3. 끝나면 PR을 열고, npm run typecheck / npm test / npm run build 결과를 적는다.`,
    `4. 비밀키·토큰·.env 파일을 커밋하지 않는다.`,
    `5. 유료 API, 크레딧 충전, 추가 결제가 필요한 방법은 쓰지 않는다.`,
    ``,
    `## 보고 형식`,
    `- 변경 요약 (3줄 이내)`,
    `- PR 링크 또는 결과물`,
    `- 남은 문제와 확인이 필요한 점`,
  ].join('\n');
}
