/**
 * 같은 일을 여러 번 시키면 스킬로(v0.8.5 소유자 "같은 일 여러 번 시킨 거 분석해서 스킬 만들기 제안"):
 * 최근 30일 업무 제목(+원문 앞부분)을 글자 두 개씩 묶어 비교(규칙, 모델 0). 비슷한 업무가 3번 이상이면 한 묶음으로 제안한다.
 * shortcut: 글자 비교라 뜻은 같은데 말이 다르면 못 묶는다, 모자라면 Gemini로 묶기(하루 1번)를 더한다.
 */
import type { Task } from './types';

const STOP = /(해\s?줘|해\s?주세요|주세요|해\s?줄래|하기|해요|합니다|좀|그리고|에서|으로|하고)/g;
const clean = (s: string) => s.toLowerCase().replace(STOP, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
const grams = (s: string) => {
  const c = clean(s);
  const out = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2));
  return out;
};
const sim = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n / (a.size + b.size - n);
};

export interface RepeatGroup {
  /** 묶음 이름(가장 짧은 제목) */
  title: string;
  /** 다시 제안하지 않을 때 쓰는 열쇠 */
  key: string;
  tasks: Pick<Task, 'id' | 'title' | 'projectId' | 'createdAt' | 'userOriginalText'>[];
}

export function repeatedWork(tasks: Task[], now: Date = new Date(), dismissed: string[] = [], min = 3, days = 30, line = 0.42): RepeatGroup[] {
  const since = now.getTime() - days * 86400_000;
  const recent = tasks.filter((t) => !t.sample && Date.parse(t.createdAt) >= since).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: { g: Set<string>; tasks: Task[] }[] = [];
  for (const t of recent) {
    const g = grams(`${t.title} ${(t.userOriginalText ?? '').slice(0, 60)}`);
    if (g.size < 3) continue;
    const hit = groups.find((x) => sim(x.g, g) >= line);
    if (hit) hit.tasks.push(t);
    else groups.push({ g, tasks: [t] });
  }
  const skip = new Set(dismissed);
  return groups
    .filter((x) => x.tasks.length >= min)
    .map((x) => {
      const title = [...x.tasks].sort((a, b) => a.title.length - b.title.length)[0].title;
      return { title, key: clean(title).slice(0, 40), tasks: x.tasks.map(({ id, title, projectId, createdAt, userOriginalText }) => ({ id, title, projectId, createdAt, userOriginalText })) };
    })
    .filter((x) => !skip.has(x.key))
    .sort((a, b) => b.tasks.length - a.tasks.length);
}

/** 스킬 만들기 업무로 보낼 글 */
export function skillRequest(g: RepeatGroup, projectName: (id: string) => string): string {
  const lines = g.tasks.slice(-5).map((t) => `- ${t.createdAt.slice(0, 10)} [${projectName(t.projectId)}] ${t.title}${t.userOriginalText ? `: ${t.userOriginalText.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`);
  return [`스킬 만들기: 최근 ${g.tasks.length}번 시킨 '${g.title}' 같은 일을 스킬로 만들어 주세요(skill-creator 사용).`, '같은 일로 본 업무:', ...lines, '완료 기준: 이 일을 할 때 AI가 꺼내 쓸 SKILL.md(제목·설명은 쉬운 한국어, 짧게), README 표에 출처 "미노피아가 만듦".'].join('\n');
}
