// Claude 보조 개발 루틴에 보낼 지시문(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// B 승인 전에는 세션 안에서만 작업하고 푸시·PR을 하지 않는다. 결과는 사용자가 AI Office 결과 패키지로 옮긴다.

export interface DevPayloadInput {
  taskId: string;
  repo: string;
  projectName: string;
  specRevision: number;
  planRevision: number;
  finalPrompt: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  item: { id: string; title: string; goal: string; acceptance_tests: string[]; preserve_constraints: string[] };
  /** 요청 자료(이름·역할·설명만) */
  attachments: string[];
  /** 승인된 견본(P) 목록 */
  prototypes: string[];
}

/** ai/claude/<업무 앞 8자>-<작업> (Codex 브랜치와 같은 규칙) */
export function claudeBranch(taskId: string, workItemId: string): string {
  const short = taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = workItemId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `ai/claude/${short}${item ? `-${item}` : ''}`;
}

export function buildDevPayload(p: DevPayloadInput): string {
  const tests = [...p.item.acceptance_tests, p.testCriteria].filter(Boolean);
  const keep = [p.preserveConstraints, ...p.item.preserve_constraints].filter(Boolean);
  return [
    `MinLab AI Office 보조 개발 (업무 ID ${p.taskId} / 작업 ${p.item.id})`,
    `저장소: ${p.repo}`,
    `프로젝트: ${p.projectName}`,
    `기획서 v${p.specRevision}(A 승인) · 계획 v${p.planRevision}(이 작업 E 승인)`,
    `작업 브랜치: ${claudeBranch(p.taskId, p.item.id)}`,
    '',
    `## 할 일: ${p.item.title}`,
    p.item.goal || p.item.title,
    '',
    '## 승인된 기획서 (수정 금지)',
    p.finalPrompt,
    p.changeScope ? `변경 범위: ${p.changeScope}` : '',
    '',
    keep.length ? '## 유지 조건' : '',
    ...keep.map((x) => `- ${x}`),
    '',
    tests.length ? '## 완료 기준' : '',
    ...tests.map((x) => `- ${x}`),
    '',
    p.attachments.length ? `## 요청 자료 ${p.attachments.length}개 (이 세션에서는 볼 수 없음. 내용을 추측하지 않는다)` : '',
    ...p.attachments,
    '',
    p.prototypes.length ? '## 승인된 견본 (P 승인 · 화면 구성·흐름을 보존하며 통합)' : '',
    ...p.prototypes,
    '',
    '## 규칙',
    '- 최신 main에서 위 작업 브랜치를 만들어 그 안에서만 작업한다. 지시 범위 밖 파일은 바꾸지 않는다.',
    '- **git push·PR·병합·배포를 하지 않는다.** GitHub 업로드는 사용자의 B 승인 뒤, 사용자가 이 세션에 "PR로 올려줘"라고 할 때만 한다.',
    '- 저장소가 정한 시험(typecheck·test·build 등)을 돌리고 결과를 줄이지 말고 그대로 보고한다.',
    '- 비밀키·토큰·.env 내용을 출력하거나 커밋하지 않는다. 유료 API를 쓰지 않는다. Codex CLI·Grok CLI를 설치하지 않는다.',
    '- 할 일이 불분명하면 코드를 바꾸지 말고 확인 질문만 남긴다.',
    '',
    '## 마지막 메시지(결과 보고, AI Office 결과 패키지로 옮긴다)',
    '1. 요약(한두 줄) 2. 바뀐 파일 목록 3. `git diff main...HEAD` 전체 4. 시험 명령과 결과 그대로 5. 남은 문제',
  ]
    .filter((l, i, all) => !(l === '' && (i === 0 || all[i - 1] === '')))
    .join('\n')
    .slice(0, 65_000);
}
