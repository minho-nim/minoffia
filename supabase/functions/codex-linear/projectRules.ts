// 프로젝트에서 지켜야 할 것·미리보기 링크(v0.4.57, 소유자 2026-11-01). 외부 의존 없음(Deno 함수와 vitest가 같이 쓴다).
// 함수마다 따로 배포되므로 같은 파일을 draft-spec·dispatch-claude·dispatch-claude-dev·submit-plan·submit-result에 복사해 둔다(같은지는 시험이 확인).
// AI가 접수(기획서 초안)·계획·개발 결과에서 "앞으로도 이 프로젝트에서 꼭 지킬 것"을 적어 보내면 저장하고, 다음 지시서에 함께 넣는다.

/** 모든 프로젝트에 늘 들어가는 기본 규칙(v0.4.73, 소유자). 앱 src/domain/baseRules.ts와 같아야 한다(시험이 확인). */
export const BASE_RULES: readonly string[] = [
  '비밀값(토큰·키·비밀번호)을 코드·커밋·채팅에 남기지 않고 .env 같은 비밀 파일은 커밋하지 않는다.',
  '유료 API·크레딧이 드는 방법을 쓰지 않는다.',
  '화면 문구와 커밋·PR은 한국어로 쓴다.',
  '변경 후 저장소의 시험·타입 검사·빌드가 모두 통과해야 한다. 하나라도 실패하면 올리지 않고 보고한다.',
  '운영 배포·운영 DB 변경은 소유자가 요청하거나 승인할 때만 한다.',
  '배포용 브랜치(release 등)에 직접 커밋하지 않는다.',
  '검증하지 않은 자동 실행을 성공으로 표시하지 않는다.',
  '화면이 바뀌면 데스크톱·휴대폰 폭에서 콘솔 오류와 가로 넘침을 확인한다.',
  'Claude 세션 안에 Codex CLI·Grok CLI를 설치·실행하지 않는다.',
  'minho-nim/MinLab 저장소는 건드리지 않는다.',
  '저장소의 스킬(.agents/skills·.claude/skills)을 따라 작업했으면 결과 요약 맨 끝에 "쓴 스킬: 이름1, 이름2" 한 줄을 적는다(안 썼으면 적지 않는다).',
];

/** 한 번에 받는 새 규칙 수 */
export const MAX_NEW_RULES = 5;
/** 프로젝트 하나에 쌓는 규칙 수(넘으면 더 받지 않는다. 소유자가 지우면 다시 받음) */
export const MAX_PROJECT_RULES = 40;

/** AI가 보낸 규칙 후보(문자열 배열)를 다듬는다: 한 줄, 2~200자, 중복 없이 최대 5개. 배열이 아니면 빈 목록. */
export function cleanRules(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const rule = v.replace(/\s+/g, ' ').replace(/^[-*•\d.)\s]+/, '').trim();
    if (rule.length < 2 || rule.length > 200 || out.includes(rule)) continue;
    out.push(rule);
    if (out.length >= MAX_NEW_RULES) break;
  }
  return out;
}

/** 지시서에 넣을 절. 규칙이 없으면 빈 목록 */
export function rulesSection(rules: string[], heading = '## 이 프로젝트에서 지켜야 할 것 (기본 규칙과 앞선 업무에서 적어 둔 것, 어기지 않는다)'): string[] {
  return rules.length ? [heading, ...rules.map((r) => `- ${r}`)] : [];
}

/** AI에게 새 규칙을 적어 보내라고 알리는 한 줄(키 이름은 JSON 키) */
export function rulesAsk(key: string): string {
  return `- 이번 일을 하며 알게 된 것 중 **앞으로 이 프로젝트의 다른 업무에서도 꼭 지켜야 할 것**이 있으면 "${key}"에 짧은 문장 배열로 적는다(최대 ${MAX_NEW_RULES}개, 이미 위 목록에 있는 것·이번 업무에만 해당하는 것은 빼고, 없으면 빈 배열).`;
}

/**
 * Cloudflare Pages 브랜치 미리보기 주소: 브랜치 이름을 소문자로, 영문·숫자 밖은 '-'로 바꾸고 28자에서 자른다.
 * 예: ai/claude/abcd1234-w1 + minlab-ai-office.pages.dev → https://ai-claude-abcd1234-w1.minlab-ai-office.pages.dev
 */
export function previewUrl(host: string | null | undefined, branch: string): string {
  const h = (host ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return '';
  const alias = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28).replace(/^-+|-+$/g, '');
  return alias ? `https://${alias}.${h}` : '';
}

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

/** AI가 보낸 규칙을 업무의 프로젝트에 저장한다(서버 권한). 실패해도 본 작업은 막지 않는다. 저장한 수를 돌려준다. */
export async function saveRules(admin: Db, ownerId: string, taskId: string, source: 'spec' | 'plan' | 'result', raw: unknown): Promise<number> {
  const rules = cleanRules(raw);
  if (!rules.length) return 0;
  try {
    const { data: task } = await admin.from('tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (!task?.project_id) return 0;
    const { count } = await admin.from('project_rules').select('id', { count: 'exact', head: true }).eq('project_id', task.project_id);
    const room = MAX_PROJECT_RULES - (count ?? 0);
    if (room <= 0) return 0;
    const rows = rules.slice(0, room).map((rule) => ({ owner_id: ownerId, project_id: task.project_id, rule, source, task_id: taskId }));
    const { error } = await admin.from('project_rules').upsert(rows, { onConflict: 'project_id,rule', ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/** 기본 규칙 + 업무의 프로젝트 규칙(오래된 순, 겹치면 한 번만)을 읽는다(서버 권한 또는 사용자 권한). 못 읽어도 기본 규칙은 돌려준다. */
export async function loadRules(db: Db, projectId: string | null | undefined): Promise<string[]> {
  let own: string[] = [];
  if (projectId) {
    try {
      const { data } = await db.from('project_rules').select('rule').eq('project_id', projectId).order('created_at').limit(MAX_PROJECT_RULES);
      own = ((data ?? []) as { rule: string }[]).map((r) => r.rule);
    } catch {
      own = [];
    }
  }
  return [...new Set([...BASE_RULES, ...own])];
}
