// 새 프로젝트 저장소에 처음 넣는 작업 규칙 파일(CLAUDE.md, v0.4.55 소유자 2026-11-01).
// Claude 루틴(PM·보조 개발)과 다른 코딩 AI가 이 저장소를 받으면 먼저 읽는다. 외부 의존 없음(Deno 함수와 vitest가 같이 쓴다).

const RULES_HEADING = '## 이 프로젝트에서 지켜야 할 것';
const RULES_NOTE = '<!-- AI가 접수·계획·개발을 하며 이 프로젝트에서 계속 지킬 것을 적는다. MinLab AI Office의 목록과 같게 맞춘다. -->';

/**
 * 이미 있는 CLAUDE.md의 "## 이 프로젝트에서 지켜야 할 것" 절만 목록과 같게 맞춘다(v0.4.75, 소유자 "다르면 맞춰줘").
 * 절이 없으면 파일 끝에 붙이고, 다른 부분은 그대로 둔다. 바꿀 것이 없으면 원문 그대로 돌려준다.
 */
export function syncRulesSection(md: string, rules: string[]): string {
  const body = [RULES_HEADING, RULES_NOTE, ...rules.map((r) => `- ${r.replace(/[\r\n]+/g, ' ').trim()}`)].join('\n');
  const text = md.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === RULES_HEADING);
  if (start < 0) return `${text.replace(/\n*$/, '')}\n\n${body}\n`;
  let end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  if (end < 0) end = lines.length;
  const parts: string[] = [];
  if (start > 0) parts.push(lines.slice(0, start).join('\n').replace(/\n*$/, ''), '');
  parts.push(body);
  if (end < lines.length) parts.push('', lines.slice(end).join('\n'));
  const out = `${parts.join('\n').replace(/\n*$/, '')}\n`;
  return out.trim() === text.trim() ? md : out;
}

export function projectClaudeMd(projectName: string, rules: string[] = []): string {
  const name = projectName.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || '새 프로젝트';
  return [
    `# ${name} — AI 작업 규칙`,
    '',
    '> 이 저장소는 MinLab AI Office가 관리한다. 사람(소유자)은 요청·승인·검토만 하고, 작업은 AI가 지시서대로 한다.',
    '',
    '## 일하는 순서',
    '1. 지시서(작업 payload)에 적힌 업무 ID·작업 ID·작업 브랜치·승인된 기획서·완료 기준만 따른다. 범위 밖 파일은 바꾸지 않는다.',
    '2. 최신 기본 브랜치에서 지시서의 작업 브랜치를 만들어 그 안에서만 작업한다.',
    '3. **올리기 승인 전에는 PR을 열지 않는다.** 지시서가 시키면 시험 뒤 작업 브랜치만 미리보기용으로 push한다(소유자가 화면을 직접 보고 승인). PR은 올리기 승인 뒤 지시서가 시킬 때만 연다.',
    '4. 병합·배포는 어떤 경우에도 하지 않는다(소유자의 배포 승인 뒤 MinLab AI Office 서버가 한다).',
    '',
    '## 시험',
    '- `package.json`이 있으면 `npm run typecheck`·`npm test`·`npm run build` 중 있는 것을 모두 돌린다.',
    '- 없으면 지시서의 완료 기준대로 확인한다. 결과는 줄이지 말고 그대로 보고한다.',
    '- 시험이 실패하면 고치고, 못 고치면 "남은 문제"에 이유를 적는다.',
    '',
    '## 결과 보고(마지막 메시지)',
    '1. 요약(한두 줄) 2. 바뀐 파일 목록 3. `git diff <기본 브랜치>...HEAD` 전체 4. 시험 명령과 결과 그대로 5. 남은 문제',
    '지시서에 "결과 보내기"가 있으면 그것도 따른다.',
    '',
    '## 지킬 것',
    '- 비밀키·토큰·`.env` 내용을 출력하거나 커밋하지 않는다.',
    '- 유료 API·크레딧이 드는 방법을 쓰지 않는다. 다른 AI CLI(Codex CLI·Grok CLI 등)를 설치하지 않는다.',
    '- 할 일이 불분명하면 코드를 바꾸지 말고 확인 질문만 남긴다.',
    '- 화면 문구·커밋·PR 설명은 한국어로 쓴다.',
    '',
    RULES_HEADING,
    RULES_NOTE,
    ...rules.map((r) => `- ${r.replace(/[\r\n]+/g, ' ').trim()}`),
    '',
  ].join('\n');
}
