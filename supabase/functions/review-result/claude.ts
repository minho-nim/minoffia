// v0.4.94 코딩 결과 Claude 채점(소유자 2026-11-02): 보조 개발 루틴에 "채점" 실행으로 보내는 글.
// Claude는 읽기·시험만 하고 아무것도 고치거나 push하지 않는다. 점수는 Gemini 채점과 같은 JSON 형식으로 submit-review에 보낸다.
import { REVIEW_SYSTEM } from './rubric.ts';

/** 결과를 낸 AI의 작업 브랜치(있을 때만). Codex 수동 결과는 브랜치를 모른다. */
export function resultBranch(source: string, taskId: string, workItemId: string): string {
  const tool = source === 'gemini_actions_auto' ? 'gemini' : source === 'claude_session_auto' || source === 'claude_manual' ? 'claude' : '';
  if (!tool) return '';
  const short = taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const item = workItemId.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `ai/${tool}/${short}${item ? `-${item}` : ''}`;
}

export function buildClaudeReviewPayload(p: {
  taskId: string;
  resultRevision: number;
  repo: string;
  branch: string;
  material: string;
  submit: { url: string; token: string };
}): string {
  return [
    'MinLab AI Office 채점',
    '',
    `업무 ID: ${p.taskId}`,
    `결과 버전: v${p.resultRevision}`,
    `저장소: ${p.repo || '(없음)'}`,
    p.branch ? `결과 브랜치: ${p.branch} (있으면 받아서 읽고 시험을 돌려 봐도 된다)` : '결과 브랜치: 없음(아래 diff로만 판단)',
    '',
    '## 할 일',
    '- 개발 AI가 낸 결과를 아래 기준으로 채점만 한다. 코드를 고치거나 커밋·push·PR을 하지 않는다. 파일을 바꿨다면 버린다.',
    '- 결과 브랜치가 있으면 `git fetch origin <브랜치>` 뒤 그 브랜치에서 저장소가 정한 시험을 돌려 근거로 써도 된다(main은 건드리지 않음).',
    '- 검토 순서(Ponytail review): 맞는가(빈 값·0·마지막 항목·시간대) → 안전한가(입력 검사·비밀값·데이터 손실) → 여러 사람이 써도 버티는가 → 위험한 새 로직에 시험이 있는가 → 빠른가 → 군더더기가 없는가(안 쓰는 코드·이미 있는 함수 중복·한 번만 쓰는 추상화).',
    '- 바뀐 함수의 이름·반환값·동작이 바뀌었으면 그 함수를 부르는 곳을 모두 찾아(가능하면 `graphify explain <이름>`, 아니면 grep) 깨진 곳이 없는지 본다. 공유 함수는 그대로 두고 한 호출부만 고친 것도 찾는다.',
    '',
    '## 채점 기준',
    REVIEW_SYSTEM,
    '',
    p.material,
    '',
    '## 점수 보내기(필수)',
    `채점이 끝나면 저장소 밖 /tmp/review-submit.json 에 {"task_id":"${p.taskId}","token":"${p.submit.token}","result_revision":${p.resultRevision},"review":<위 형식의 JSON 하나>} 를 저장하고 아래를 한 번 실행한다.`,
    `curl -sS -X POST '${p.submit.url}' -H 'content-type: application/json' --data-binary @/tmp/review-submit.json`,
    '- 이 token은 이 결과 채점 전용(6시간, 3번까지)이다. 다른 곳에 쓰거나 파일·커밋에 남기지 않는다.',
    '- 응답이 {"ok":true,...}가 아니면 응답을 한 줄로 보고한다.',
    '- 마지막 메시지: 총점 한 줄과 고칠 점(있으면).',
  ].join('\n');
}
