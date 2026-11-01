// 올리기 승인(B) 뒤 Claude 보조 개발 루틴에 보낼 "PR 열기" 지시문(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// 승인된 변경 내용(diff)만 그대로 적용해 PR을 연다. 새로 고치거나 더하지 않고, 병합하지 않는다.

/** 루틴 payload는 65,536자까지. 지시문을 빼고 diff에 쓸 수 있는 길이 */
export const MAX_PR_DIFF = 50_000;

export interface PrPayloadInput {
  taskId: string;
  repo: string;
  workItemId: string;
  resultRevision: number;
  summary: string;
  diff: string;
}

/** dispatch-claude-dev/payload.ts의 claudeBranch와 같은 규칙(함수마다 따로 배포되므로 복사, 같은지는 시험이 확인) */
export function claudeBranch(taskId: string, workItemId: string): string {
  const short = taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = workItemId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `ai/claude/${short}${item ? `-${item}` : ''}`;
}

export function buildPrPayload(p: PrPayloadInput): string {
  const branch = claudeBranch(p.taskId, p.workItemId);
  const firstLine = p.summary.split('\n')[0].trim().slice(0, 72) || 'AI Office 결과';
  return [
    `MinLab AI Office 올리기(B 승인됨) — PR 열기 (업무 ID ${p.taskId} / 작업 ${p.workItemId || '전체'} / 결과 v${p.resultRevision})`,
    `저장소: ${p.repo}`,
    `작업 브랜치: ${branch}`,
    '',
    '## 할 일',
    `사용자가 결과 v${p.resultRevision}을 검토하고 올리기 승인(B)했다. 아래 "승인된 변경 내용"만 그대로 적용해 PR을 연다. 코드를 새로 고치거나 더하지 않는다.`,
    `1. ${branch} 브랜치로 열린 PR이 이미 있으면 아무것도 하지 말고 그 PR 주소만 보고한다. 없으면 최신 main에서 ${branch} 브랜치를 새로 만든다(미리보기용으로 올린 같은 이름의 원격 브랜치가 있어도 main에서 새로 만든다).`,
    '2. 아래 diff를 저장소 밖 /tmp/approved.diff로 저장하고 `git apply --index /tmp/approved.diff`로 적용한다. 적용이 안 되면(충돌·기준 변경) 아무것도 올리지 말고 이유만 보고한다.',
    '3. 저장소가 정한 시험(typecheck·test·build 등)을 돌린다. 실패해도 고치지 말고 그대로 보고한다(PR은 연다. CI가 다시 확인한다).',
    `4. "${firstLine} (AI Office 결과 v${p.resultRevision})"로 커밋하고 \`git push --force-with-lease -u origin ${branch}\`로 이 브랜치만 올린 뒤(미리보기 브랜치를 승인된 내용으로 맞춤) main 대상 PR을 연다. PR 본문: 요약, 바뀐 파일, 시험 결과, "AI Office 업무 ID ${p.taskId}". **병합하지 않는다.**`,
    '5. 마지막 메시지에 PR 주소를 한 줄로 남긴다.',
    '- 비밀키·토큰·.env 내용을 출력하거나 커밋하지 않는다. Codex CLI·Grok CLI를 설치하지 않는다.',
    '',
    '## 승인된 변경 내용 (diff, 수정 금지)',
    '`````diff',
    p.diff,
    '`````',
  ].join('\n');
}
