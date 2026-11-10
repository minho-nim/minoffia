// 서버가 만드는 Codex 지시서(v0.6.28, 소유자 "앱을 닫아 둬도 진행"): 앱이 닫혀 있을 때 서버가 Codex에 맡길 때 쓴다.
// 앱의 지시서(src/domain/handoffV2.ts buildCodexHandoff)에서 첨부·링크 설명을 뺀 같은 뼈대다(외부 의존 없음).
export interface ServerHandoffInput {
  taskId: string;
  repo: string;
  spec: { revision: number; final_prompt: string; change_scope: string; preserve_constraints: string; test_criteria: string };
  item: { id: string; title: string; goal?: string; acceptance_tests?: string[]; preserve_constraints?: string[] };
  baseRevision?: string;
  rules: string[];
  attachmentCount: number;
}

export function buildServerHandoff(i: ServerHandoffInput): string {
  const list = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x && !!x.trim()).map((x) => `- ${x}`);
  return [
    `# Codex Cloud 작업 — ${i.item.title}`,
    '',
    `- 업무 ID: ${i.taskId} / 작업 ${i.item.id} / 기획서 버전 ${i.spec.revision}`,
    `- 저장소: ${i.repo}`,
    i.baseRevision ? `- 계획 당시 기준 커밋: ${i.baseRevision} (참고용. 작업은 최신 기본 브랜치에서 한다)` : '',
    '',
    '## 목표',
    i.item.goal || i.item.title,
    '',
    '## 승인된 기획서 (기획 승인, 수정 금지)',
    i.spec.final_prompt,
    i.spec.change_scope ? `\n변경 범위: ${i.spec.change_scope}` : '',
    i.attachmentCount ? `\n(사용자가 첨부한 자료 ${i.attachmentCount}개는 AI Office 업무 카드에 있다. 지시서만으로 판단이 어려우면 멈추고 보고한다.)` : '',
    ...(i.rules.length ? ['', '## 이 프로젝트에서 지켜야 할 것', ...i.rules.map((r) => `- ${r}`)] : []),
    '',
    '## 유지 조건',
    ...list([i.spec.preserve_constraints, ...(i.item.preserve_constraints ?? [])]),
    '',
    '## 완료 기준',
    ...list([...(i.item.acceptance_tests ?? []), i.spec.test_criteria]),
    '',
    '## 규칙',
    '- 최신 기본 브랜치(main) 위에서 작업한다. 지시와 맞지 않게 파일이 바뀌어 있으면 고치지 말고 멈춰서 보고한다.',
    '- 요청을 다 해결하는 가장 작은 변경만 하고, 이미 있는 코드를 먼저 쓴다.',
    '- 저장소가 정한 시험(README·AGENTS.md 기준, 없으면 package.json의 typecheck·test·build)을 돌리고 결과를 줄이지 말고 그대로 보고한다.',
    '- 화면이 바뀌면 데스크톱(약 1400px)·모바일(약 400px)에서 콘솔 오류·가로 넘침을 확인한다.',
    '- **PR 생성·브랜치 푸시를 하지 않는다.** GitHub 업로드는 사용자의 올리기 승인 뒤에만 한다.',
    '- 비밀키·토큰·.env 내용을 출력하거나 커밋하지 않는다.',
  ]
    .filter((line, n, all) => !(line === '' && all[n - 1] === ''))
    .join('\n');
}
