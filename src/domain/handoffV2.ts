import type { Project, Task } from './types';
import type { TaskSpec, WorkItem } from './workflow-types';

/** ChatGPT에 붙여넣을 기획 자료. GPT는 원문을 우선 해석하고 아래 형식으로 답한다. */
export function buildGptPackage(task: Task, project: Project | undefined): string {
  return [
    '# MinLab AI Office 기획 요청',
    '',
    `- 업무 ID: ${task.id}`,
    `- 프로젝트: ${project?.name ?? '알 수 없음'} (${project?.repo ?? '저장소 미연결'})`,
    '- 첨부 이미지: 없음 (Gemini 이미지 분석 미연결)',
    '- 링크: 없음 (링크 읽기 미연결)',
    '',
    '## 사용자 요청 원문 (수정하지 말고 그대로 해석)',
    task.userOriginalText ?? [task.title, task.description].filter(Boolean).join('\n\n'),
    '',
    '## 부탁',
    '1. 요청 의도를 question(단순 질문) / change_request(개발·수정) / asset_request(이미지·에셋) / ambiguous(불분명) 중 하나로 판단하세요.',
    '2. question이면 답변만 하고 개발 지시서를 만들지 마세요.',
    '3. ambiguous이거나 꼭 필요한 조건이 빠졌으면, 확인 질문만 하세요(불필요한 질문은 하지 않음).',
    '4. 개발 요청이면 아래 다섯 항목으로 최종 지시서를 작성하세요.',
    '   - 의도 / 최종 개발 프롬프트 / 변경 범위 / 유지 조건 / 테스트 기준',
  ].join('\n');
}

/** 사용자가 Codex Cloud 웹에서 한 번 시작할 때 붙여넣을 지시서. 임시 폴백이며 자동 실행이 아니다. */
export function buildCodexHandoff(task: Task, spec: TaskSpec, item: WorkItem, project: Project | undefined, baseRevision: string): string {
  return [
    `# Codex Cloud 작업 — ${item.title}`,
    '',
    `- 업무 ID: ${task.id} / 작업 ${item.id} / 기획서 버전 ${spec.revision}`,
    `- 저장소: ${project?.repo ?? '(미연결)'}${baseRevision ? ` @ ${baseRevision}` : ''}`,
    '',
    '## 목표',
    item.goal || item.title,
    '',
    '## 승인된 기획서 (A 승인, 수정 금지)',
    spec.finalPrompt,
    spec.changeScope ? `\n변경 범위: ${spec.changeScope}` : '',
    '',
    '## 유지 조건',
    ...[spec.preserveConstraints, ...item.preserve_constraints].filter(Boolean).map((x) => `- ${x}`),
    '',
    '## 완료 기준',
    ...[...item.acceptance_tests, spec.testCriteria].filter(Boolean).map((x) => `- ${x}`),
    '',
    '## 규칙',
    '- 결과는 diff와 테스트 로그로만 보고한다.',
    '- **PR 생성·브랜치 푸시를 하지 않는다.** GitHub 업로드는 사용자의 B 승인 뒤에만 한다.',
    '- 비밀키·토큰·.env 내용을 출력하거나 커밋하지 않는다.',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}
