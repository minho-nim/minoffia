// 저장소 스킬 보기(v0.6.55, 소유자 "minoffia에서 스킬을 간단히 보게, 내용과 설명"): SKILL.md를 나눠 읽고 위험 표시를 규칙으로 단다(AI 호출 없음).
export interface SkillFile {
  name: string;
  skillMd: string;
  files: string[];
  /** 라이선스 파일 첫 줄들(없으면 '') */
  license: string;
  /** 스킬 모음 안의 폴더(예: .claude/skills/x, common/x) */
  dir?: string;
  /** 스킬을 만들고 찾는 도구 스킬(프로젝트에 넣지 않음) */
  meta?: boolean;
}

/** 프로젝트에 이 스킬이 들어 있는지: same = 모음과 같음, old = 옛 버전, none = 없음(v0.6.58) */
export type SkillInstallState = 'same' | 'old' | 'none';
export const INSTALL_LABEL: Record<SkillInstallState, string> = { same: '들어 있음', old: '옛 버전', none: '없음' };

export type SkillRisk = 'network' | 'secret' | 'paid' | 'delete' | 'install';
export const RISK_LABEL: Record<SkillRisk, string> = {
  network: '외부 접속',
  secret: '비밀값 읽기',
  paid: '유료 API',
  delete: '파일 삭제',
  install: '설치 명령',
};

export interface SkillView {
  name: string;
  title: string;
  description: string;
  body: string;
  files: string[];
  license: string;
  source: string;
  risks: SkillRisk[];
  scripts: number;
  meta: boolean;
  /** 새 프로젝트 저장소를 만들 때 자동으로 넣는 기본 스킬 */
  isDefault: boolean;
  /** 스킬 지도의 분류(v0.6.61) */
  category: SkillCategory;
}

/** 스킬 지도 분류(v0.6.61 소유자 "스킬을 분류해서 빨리 찾게"). 앞머리에 적은 분류가 먼저, 없으면 제목·설명 낱말로 고른다(규칙만) */
export const SKILL_CATEGORIES = ['배포', '화면·디자인', '시험·점검', '문서', '데이터·DB', '보안', '도구', '기타'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
const CATEGORY_WORDS: [SkillCategory, RegExp][] = [
  ['배포', /배포|올리기|릴리스|release|deploy|PR|병합/i],
  ['보안', /보안|비밀|토큰|권한|security|secret|auth/i],
  ['데이터·DB', /DB|데이터베이스|마이그레이션|supabase|sql|database/i],
  ['시험·점검', /시험|테스트|점검|검사|재현|test|check|audit|lint/i],
  ['화면·디자인', /화면|디자인|UI|UX|레이아웃|스타일|접근성|design|css/i],
  ['문서', /문서|일지|README|기록|변경 기록|보고|docs|changelog/i],
];
export function skillCategory(v: { meta: boolean; category: string; title: string; description: string }): SkillCategory {
  if (v.meta) return '도구';
  if ((SKILL_CATEGORIES as readonly string[]).includes(v.category)) return v.category as SkillCategory;
  const text = `${v.title} ${v.description}`;
  return CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? '기타';
}

/** 앞머리(--- name/description ---)와 본문을 나눈다. 앞머리가 없으면 첫 제목·첫 문단을 쓴다 */
export function parseSkillMd(md: string): { title: string; description: string; body: string; isDefault: boolean; category: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const front = m ? m[1] : '';
  const body = (m ? m[2] : md).trim();
  const field = (k: string) => {
    const f = front.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'));
    return f ? f[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const firstPara = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('>')) ?? '';
  // 한글 제목(# 스킬 찾기)이 있으면 그걸 이름으로 보인다(v0.6.56 소유자 "스킬은 한글로 통일"). 없으면 앞머리 name
  // 새 프로젝트에 늘 넣는 기본 스킬(v0.6.60): 표준 앞머리 metadata 아래 minoffia-default: "true"
  const isDefault = /^\s+minoffia-default:\s*["']?true["']?\s*$/m.test(front);
  // 분류(v0.6.61 스킬 지도): 표준 앞머리 metadata 아래 minoffia-category: 배포
  const category = front.match(/^\s+minoffia-category:\s*["']?([^"'\n]+?)["']?\s*$/m)?.[1]?.trim() ?? '';
  return { title: /[가-힣]/.test(heading) ? heading : field('name') || heading, description: field('description') || firstPara.slice(0, 300), body, isDefault, category };
}

const RISK_RULES: [SkillRisk, RegExp][] = [
  ['network', /\b(curl|wget|fetch\(|requests\.(get|post)|urllib|https?:\/\/(?!skills\.sh|github\.com\/[\w.-]+\/[\w.-]+\b))/i],
  ['secret', /(api[_-]?key|secret|token|password|auth\.json|\.env\b|credentials?)/i],
  ['paid', /(ANTHROPIC_API_KEY|OPENAI_API_KEY|import anthropic|from anthropic|from openai|import openai|credits?\b)/i],
  ['delete', /(rm\s+-rf|shutil\.rmtree|unlink\(|fs\.rm)/i],
  ['install', /(npx skills add|npm (i|install)\b|pip install|brew install)/i],
];

/** 위험 표시(규칙만): 내용에 그런 글자가 있으면 표시한다. 있다고 해서 꼭 위험한 것은 아니고, 읽어 볼 곳을 알려 준다 */
export function skillRisks(text: string): SkillRisk[] {
  return RISK_RULES.filter(([, re]) => re.test(text)).map(([k]) => k);
}

/** 라이선스 이름·출처(원문 표시가 있으면) */
export function skillSource(md: string, license: string): { license: string; source: string } {
  const lic = /apache license/i.test(license) ? 'Apache-2.0' : /mit license/i.test(license) ? 'MIT' : /bsd/i.test(license) ? 'BSD' : license ? '기타' : '없음(직접 만듦)';
  const origin = md.match(/원문[은:]\s*([\w.-]+\/[\w.-]+)/)?.[1] ?? '';
  const owner = license.match(/Copyright \(c\) \d{4}\s+([^,.]+)/i)?.[1]?.trim() ?? '';
  return { license: lic, source: origin || owner || (license ? '외부' : '직접 만듦') };
}

export function toSkillView(f: SkillFile): SkillView {
  const { title, description, body, isDefault, category } = parseSkillMd(f.skillMd);
  const { license, source } = skillSource(f.skillMd, f.license);
  return {
    name: f.name,
    title: title || f.name,
    description,
    body,
    files: f.files,
    license,
    source,
    risks: skillRisks(f.skillMd),
    scripts: f.files.filter((x) => /\.(py|js|mjs|ts|sh)$/.test(x)).length,
    meta: f.meta === true,
    isDefault: isDefault && f.meta !== true,
    category: skillCategory({ meta: f.meta === true, category, title: title || f.name, description }),
  };
}

/** 스킬 만들기·찾기 입력 창(v0.6.57 소유자 "채팅에 글씨가 한 번에 들어감, 편하게 입력"): 칸에 쓴 것만 짧게 모아 대화로 보낸다.
 *  지킬 것(만드는 방식·한국어·다른 파일 금지·-g/-y 금지)은 마지막 한 줄로 붙인다(대화에서도 그대로 보인다). */
export interface SkillForm {
  kind: 'make' | 'find';
  what: string;
  when?: string;
  rules?: string;
  areas?: string[];
  /** 새 프로젝트에 늘 넣기(v0.6.60) */
  isDefault?: boolean;
  /** 스킬 지도 분류(v0.6.61, 비우면 낱말로 고름) */
  category?: string;
}

export const SKILL_PRESETS: { label: string; what: string; when: string; rules: string }[] = [
  { label: '배포 순서', what: '변경을 운영까지 올리는 순서를 자동으로 진행', when: '"배포해줘", "올려줘"라고 할 때', rules: '브랜치 → 시험·빌드 → PR → 검사 통과 기다리기 → 병합 → 운영 배포 → 운영 버전 확인 → 데모 갱신' },
  { label: '개발일지 쓰기', what: '변경 기록을 날짜별 개발일지 양식으로 정리', when: '"개발일지 정리해줘"라고 할 때', rules: '양식: 날짜·버전·제목, 작업 목적, 주요 변경, 접는 세부 정보(이유·확인 결과·다음 작업). 쉬운 한국어' },
  { label: '운영 점검', what: '최근 실패한 AI 작업·Gemini 실패율·Actions 사용량을 한 번에 보고', when: '"운영 점검해줘", "요즘 상태 어때"라고 할 때', rules: '읽기만 한다(고치지 않음). 문제마다 원인 추정과 다음 할 일 한 줄' },
];

export const SKILL_AREAS = ['디자인', '시험', '배포', '문서', '코드 품질', '자동화'];

const clean = (s: string | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function skillRequest(f: SkillForm): string {
  const what = clean(f.what, 200);
  if (f.kind === 'find') {
    const areas = (f.areas ?? []).filter((a) => SKILL_AREAS.includes(a));
    return [
      `@Claude 스킬 찾기: ${what}`,
      areas.length ? `분야: ${areas.join(', ')}` : '',
      '(find-skills로 후보 3개를 출처·설치 수·라이선스·위험과 함께 요약 · 가장 좋은 1개만 읽고 .claude/skills/에 라이선스와 함께 · 제목·설명은 한국어 · -g/-y 금지 · 다른 파일 고치지 않기)',
      '(짧게: 설명은 "무엇을·언제" 2~3줄로 고쳐 두기 · 앞머리 metadata 아래 minoffia-category에 분류 하나)',
    ].filter(Boolean).join('\n');
  }
  const rules = (f.rules ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' / ').slice(0, 600);
  return [
    `@Claude 스킬 만들기: ${what}`,
    clean(f.when, 200) ? `언제: ${clean(f.when, 200)}` : '',
    rules ? `지킬 것: ${rules}` : '',
    f.isDefault ? '새 프로젝트에 늘 넣기: 앞머리에 metadata: 아래 minoffia-default: "true"' : '',
    f.category && (SKILL_CATEGORIES as readonly string[]).includes(f.category) && f.category !== '도구' ? `분류: ${f.category} (앞머리 metadata: 아래 minoffia-category: ${f.category})` : '',
    '(skill-creator 방식으로 .claude/skills/<짧은-영어-이름>/SKILL.md · 제목·설명·본문은 쉬운 한국어 · 다른 파일 고치지 않기)',
    // 토큰 아끼기(v0.6.61): 설명은 늘 읽히고 본문은 쓸 때만 읽힌다
    '(짧게: 설명은 "무엇을·언제" 2~3줄 · 본문 100줄 이내 · 긴 점검표·예시는 references/ 파일로 나누기)',
  ].filter(Boolean).join('\n');
}

/** 결과 요약에서 AI가 적은 "쓴 스킬: a, b"(기본 규칙, v0.6.59)·"스킬 확인: x"(시험용)를 읽는다. 이름 규칙에 맞는 것만 */
export function usedSkills(summary: string): string[] {
  const out = new Set<string>();
  for (const m of summary.matchAll(/^(?:쓴 스킬|스킬 확인)\s*[:：]\s*(.+)$/gm)) {
    for (const n of m[1].split(/[,，、\s]+/)) {
      const name = n.trim().replace(/[`'".]/g, '').toLowerCase();
      if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) out.add(name);
    }
  }
  return [...out];
}

/** 스킬별로 쓰인 결과 수(같은 업무의 여러 결과는 한 번만) */
export function skillUsage(results: { taskId: string; summary: string }[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of results) for (const n of usedSkills(r.summary)) seen.set(n, (seen.get(n) ?? new Set()).add(r.taskId));
  return new Map([...seen].map(([n, s]) => [n, s.size]));
}

/** 그림 지도의 프로젝트별 스킬 상태(v0.6.62): same = 모음과 같음, old = 옛 버전, extra = 모음에 없는(직접 넣은) 스킬 */
export type SkillMapState = 'same' | 'old' | 'extra';
export type SkillMapData = Record<string, Record<string, SkillMapState>>;

/** 스킬별로 들어간 프로젝트 수(같음·옛 버전 모두) */
export function installedCount(map: SkillMapData, name: string): number {
  return Object.values(map).filter((m) => m[name] === 'same' || m[name] === 'old').length;
}
