// 저장소 스킬 보기(v0.6.55, 소유자 "minoffia에서 스킬을 간단히 보게, 내용과 설명"): SKILL.md를 나눠 읽고 위험 표시를 규칙으로 단다(AI 호출 없음).
export interface SkillFile {
  name: string;
  skillMd: string;
  files: string[];
  /** 라이선스 파일 첫 줄들(없으면 '') */
  license: string;
}

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
}

/** 앞머리(--- name/description ---)와 본문을 나눈다. 앞머리가 없으면 첫 제목·첫 문단을 쓴다 */
export function parseSkillMd(md: string): { title: string; description: string; body: string } {
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
  return { title: /[가-힣]/.test(heading) ? heading : field('name') || heading, description: field('description') || firstPara.slice(0, 300), body };
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
  const { title, description, body } = parseSkillMd(f.skillMd);
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
  };
}

/** 스킬 업무 요청 글(대화창에 미리 채운다). 결과는 늘 PR로 올라가 올리기 승인을 거친다 */
export function skillRequestText(kind: 'make' | 'find'): string {
  return kind === 'make'
    ? '@Claude 스킬 만들기: (여기에 무엇을 자동으로 할지 적어 주세요). skill-creator 방식으로 .claude/skills/<짧은-영어-이름>/SKILL.md를 만들어. 설명(description)·제목·본문은 쉬운 한국어로. 다른 파일은 고치지 마.'
    : '@Claude 스킬 찾기: (여기에 무엇에 쓸 스킬인지 적어 주세요). find-skills로 후보 3개를 찾아 출처·설치 수·라이선스·위험(외부 접속·비밀값·유료 API)을 결과 요약에 적고, 가장 좋은 1개만 내용을 읽은 뒤 .claude/skills/에 라이선스 파일과 함께 넣어. 설명(description)과 제목은 쉬운 한국어로 바꿔 둬. -g·-y 금지, 다른 파일은 고치지 마.';
}
