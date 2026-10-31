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
  /** 결과 자동 저장(v0.4.3): 이 작업 전용 1회용 제출표와 받는 주소. 없으면 결과는 마지막 메시지로만 */
  submit?: { url: string; token: string };
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
    ...(p.submit
      ? [
          '',
          '## 결과 보내기(자동 저장, 필수)',
          `시험까지 끝나면 저장소 밖 /tmp/result-submit.json 에 {"task_id":"${p.taskId}","token":"${p.submit.token}","result":{"summary":"<요약>","changed_files":["<경로>"],"diff":"<git diff main...HEAD 전체>","test_log":"<시험 명령과 결과 그대로>","remaining_issues":"<남은 문제, 없으면 빈 문자열>","branch":"${claudeBranch(p.taskId, p.item.id)}"}} 를 JSON으로 저장하고(문자열은 JSON 이스케이프) 아래를 한 번 실행한다.`,
          `curl -sS -X POST '${p.submit.url}' -H 'content-type: application/json' --data-binary @/tmp/result-submit.json`,
          '- 이 token은 이 작업의 결과 제출 전용(24시간, 3번까지)이다. 다른 곳에 쓰거나 파일·커밋에 남기지 않는다.',
          '- 응답이 {"ok":true,...}가 아니거나 접속이 막히면 응답(또는 오류)을 한 줄로 보고한다. 결과를 고쳐 다시 보낼 때만 재시도한다.',
          '- 보낸 뒤에도 위 형식의 마지막 메시지는 그대로 남긴다(사용자가 직접 옮길 수 있게).',
        ]
      : []),
  ]
    .filter((l, i, all) => !(l === '' && (i === 0 || all[i - 1] === '')))
    .join('\n')
    .slice(0, 65_000);
}
