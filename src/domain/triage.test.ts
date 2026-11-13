import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import { answerStatus, chatGptFollowup, matchProjects, priorChatText, questionProject, replyIntent, titleFrom, triage } from './triage';

const snap = sampleSnapshot();
const now = new Date('2026-10-29T03:00:00Z');

describe('matchProjects', () => {
  it('이름·저장소 이름을 띄어쓰기·대소문자 무시하고 찾는다', () => {
    expect(matchProjects('musclemap 로그인 고쳐줘', snap.projects).map((p) => p.name)).toEqual(['MuscleMap']);
    expect(matchProjects('Muscle Map 화면', snap.projects).map((p) => p.name)).toEqual(['MuscleMap']);
    expect(matchProjects('아무 이름 없음', snap.projects)).toEqual([]);
  });
});

describe('triage', () => {
  it('작업 요청이면 프로젝트 후보와 함께', () => {
    const r = triage('MuscleMap에 다크 모드 추가해줘', snap, now);
    expect(r.kind).toBe('request');
    if (r.kind === 'request') expect(r.candidates[0].name).toBe('MuscleMap');
    const none = triage('로그인 버튼 고쳐줘', snap, now);
    expect(none.kind === 'request' && none.candidates.length).toBe(0);
  });

  it('설명·추천해 달라는 말은 질문', () => {
    expect(triage('리액트 상태 관리 추천해줘', snap, now).kind).toBe('question');
    expect(triage('useEffect가 뭐야?', snap, now).kind).toBe('question');
  });

  it('앱 상태 질문은 기록으로 바로 답한다', () => {
    const r = triage('Claude 오늘 몇 번 남았어?', snap, now);
    expect(r.kind).toBe('status');
    if (r.kind === 'status') expect(r.answer).toContain('Claude:');
    expect(answerStatus('진행 중인 업무 뭐야', snap, now)).toContain('진행 중인 업무');
    expect(answerStatus('막힌 거 있어?', snap, now)).toContain('차단된 업무');
    expect(answerStatus('MuscleMap 어디까지 했어?', snap, now)).toContain('MuscleMap 업무');
  });

  it('질문도 요청도 아니면 되묻는다', () => {
    expect(triage('음', snap, now).kind).toBe('unclear');
  });
});

describe('titleFrom', () => {
  it('첫 줄 60자', () => {
    expect(titleFrom('  첫 줄\n둘째 줄')).toBe('첫 줄');
    expect(titleFrom('가'.repeat(80))).toHaveLength(60);
  });
});

describe('replyIntent', () => {
  it('확인 질문에 글로 한 답', () => {
    for (const y of ['응', '네', 'ㅇㅇ', '만들어', '만들어줘', '비공개 저장소 만들기', '좋아!', 'ok', '맞아요']) expect(replyIntent(y), y).toBe('yes');
    for (const n of ['아니', '아니요', '나중에', 'ㄴㄴ', '취소', '괜찮아']) expect(replyIntent(n), n).toBe('no');
    for (const x of ['MuscleMap에 다크 모드 추가해줘', 'useEffect가 뭐야?', '음', '어떻게 하면 빨라져?']) expect(replyIntent(x), x).toBeNull();
  });
});

describe('새 프로젝트·흔한 이름', () => {
  const withGeneric = { ...snap, projects: [...snap.projects, { id: 'p-x', name: '프로젝트', repo: null, description: '', createdAt: '' }, { id: 'p-t', name: '테스트', repo: null, description: '', createdAt: '' }] };
  it('"새 프로젝트 만들어줘"는 업무가 아니라 프로젝트 만들기', () => {
    expect(triage('새 프로젝트 만들어줘', withGeneric, now)).toEqual({ kind: 'new_project', name: null });
    expect(triage('프로젝트 하나 만들어줘 "ShopApp"', withGeneric, now)).toEqual({ kind: 'new_project', name: 'ShopApp' });
    expect(triage('MuscleMap 프로젝트에 로그인 추가해줘', withGeneric, now).kind).toBe('request');
  });
  it('흔한 낱말 이름은 자동으로 짐작하지 않는다', () => {
    expect(matchProjects('테스트 코드 추가해줘', withGeneric.projects)).toEqual([]);
    expect(matchProjects('프로젝트 화면 고쳐줘', withGeneric.projects)).toEqual([]);
    expect(matchProjects('MuscleMap 화면 고쳐줘', withGeneric.projects).map((p) => p.name)).toEqual(['MuscleMap']);
  });
});

describe('질문 흐름(v0.3.1)', () => {
  it('GPT 이어서 묻기 글에 질문과 Gemini 답이 함께 들어간다', () => {
    const t = chatGptFollowup(' useEffect가 뭐야? ', '렌더 뒤에 실행되는 훅');
    expect(t).toContain('## 질문\nuseEffect가 뭐야?');
    expect(t).toContain('## Gemini 1차 답(참고)\n렌더 뒤에 실행되는 훅');
    expect(t).toContain('틀린 점은 바로잡고');
  });

  it('프로젝트 이름이 든 질문은 그 프로젝트를 돌려준다', () => {
    const projects = [{ id: 'p1', name: 'MuscleMap', repo: null, description: '', createdAt: '' }];
    expect(questionProject('MuscleMap 타이머 구조 어떻게 생각해?', projects)?.id).toBe('p1');
    expect(questionProject('useEffect가 뭐야?', projects)).toBeNull();
  });
});

describe('앞 대화를 이어서 개발 요청(v0.3.9)', () => {
  it('"그럼 그거 만들어줘"는 개발 요청으로 분류된다', () => {
    expect(triage('그럼 그거 만들어줘', snap).kind).toBe('request');
    expect(triage('더 자세히', snap).kind).toBe('unclear');
  });

  it('앞 질문·답을 참고용으로 붙이고 긴 답은 줄인다', () => {
    const t = priorChatText({ question: '다크 모드 어떻게 해?', answer: 'CSS 변수로'.padEnd(2500, '.') });
    expect(t).toContain('요청 전 대화');
    expect(t).toContain('질문: 다크 모드 어떻게 해?');
    expect(t).toContain('(줄임)');
    expect(t.length).toBeLessThan(2200);
  });
});

describe('웹 조사 요청은 사용량 안내로 가지 않는다(v0.7.2)', () => {
  it("'한도 얼마'가 있어도 '찾아줘'·'요즘'이면 웹 조사 쪽", async () => {
    const { answerStatus } = await import('./triage');
    const snap = { tasks: [], usage: [], projects: [], workflow: {} } as never;
    expect(answerStatus('요즘 Gemini 무료 한도 얼마야? 찾아줘', snap)).toBeNull();
    expect(answerStatus('Claude 한도 몇 번 남았어?', snap)).toContain('오늘 실행 기록');
  });
});
