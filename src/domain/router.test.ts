import { describe, expect, it } from 'vitest';
import { AGENT_BY_ID } from './agents';
import { classify, coverFor, routeTask } from './router';
import type { UsageRun } from './types';
import { kstDay } from './usage';

const now = new Date('2026-10-29T03:00:00Z');
const run = (agent: UsageRun['agent'], i: number): UsageRun => ({
  id: `r${i}`,
  agent,
  taskId: null,
  kind: agent === 'claude' ? 'cloud' : 'manual',
  day: kstDay(now),
  createdAt: now.toISOString(),
});
/** Claude 하루 상한만큼 쓴 기록 */
const claudeFull = () => Array.from({ length: AGENT_BY_ID.claude.dailyCap ?? 0 }, (_, i) => run('claude', i));

describe('classify', () => {
  it('키워드가 가장 많이 맞는 유형을 고른다', () => {
    expect(classify('로그인 버그 수정')?.type).toBe('dev');
    expect(classify('선택지 분기 구조 설계')?.type).toBe('planning');
    expect(classify('무료 호스팅 비교 조사')?.type).toBe('research');
    expect(classify('메인 화면 도트 캐릭터')?.type).toBe('design');
    expect(classify('회귀 테스트 점검')?.type).toBe('qa');
  });

  it('영문 키워드도 대소문자 구분 없이 찾는다', () => {
    expect(classify('Fix API timeout')?.type).toBe('dev');
  });

  it('맞는 키워드가 없으면 null', () => {
    expect(classify('안녕하세요')).toBeNull();
  });
});

describe('routeTask', () => {
  it('모델 호출 없이 유형과 담당자를 정하고 근거를 남긴다', () => {
    const r = routeTask({ title: '결제 기능 구현', description: '', requestedType: 'auto' }, [], now);
    expect(r).toMatchObject({ type: 'dev', assignee: 'codex' });
    expect(r.reason).toContain('구현');
  });

  it('요청 유형이 있으면 키워드보다 우선한다', () => {
    const r = routeTask({ title: '버그 수정', description: '', requestedType: 'research' }, [], now);
    expect(r).toMatchObject({ type: 'research', assignee: 'grok' });
  });

  it('키워드가 없으면 기획부터 Claude에게', () => {
    expect(routeTask({ title: '새 아이디어', description: '', requestedType: 'auto' }, [], now).assignee).toBe('claude');
  });

  it('1순위가 오늘 한도를 다 쓰면 다음 후보로 넘긴다', () => {
    const usage = claudeFull();
    const r = routeTask({ title: '아키텍처 설계', description: '', requestedType: 'auto' }, usage, now);
    expect(r.assignee).toBe('codex');
    expect(r.reason).toContain('한도 소진');
  });

  it('후보가 모두 한도면 1순위에 두고 내일 실행으로 표시한다', () => {
    const usage = [...claudeFull(), ...Array.from({ length: AGENT_BY_ID.codex.dailyCap ?? 0 }, (_, i) => run('codex', 100 + i))];
    const r = routeTask({ title: '아키텍처 설계', description: '', requestedType: 'auto' }, usage, now);
    expect(r.assignee).toBe('claude');
    expect(r.reason).toContain('내일');
  });

  it('어제 실행은 오늘 한도에 들어가지 않는다', () => {
    const yesterday = { ...run('claude', 1), day: '2026-10-28' };
    const r = routeTask({ title: '설계', description: '', requestedType: 'auto' }, [yesterday, { ...yesterday, id: 'x' }], now);
    expect(r.assignee).toBe('claude');
  });
});

describe('영어 키워드는 단어 단위(v0.3.4)', () => {
  it('저장소 이름 안의 test, 단어 안의 ci는 키워드가 아니다', () => {
    expect(classify('TestRepo 문서 검토해줘')?.type).not.toBe('qa');
    expect(classify('decision 로그 정리')).toBeNull();
  });

  it('따로 쓴 영어 키워드와 조사가 붙은 한국어는 그대로 잡는다', () => {
    expect(classify('CI 결과 봐줘')?.type).toBe('qa');
    expect(classify('run the test please')?.type).toBe('qa');
    expect(classify('로그인 테스트를 돌려줘')?.type).toBe('qa');
    expect(classify('bug-fix 해줘')?.type).toBe('dev');
  });

  it('휴가 중인 AI는 빼고 다음 후보에게 맡긴다', () => {
    const r = routeTask({ title: '결제 기능 구현', description: '', requestedType: 'auto' }, [], now, ['codex']);
    expect(r.assignee).toBe('claude');
    expect(r.reason).toContain('Codex 휴가');
  });

  it('후보가 모두 휴가면 그 일을 할 줄 아는 다른 AI에게 맡긴다', () => {
    const r = routeTask({ title: '시장 조사', description: '', requestedType: 'research' }, [], now, ['grok']);
    expect(r.assignee).toBe('claude');
  });

  it('휴가로 대신 맡은 일을 알려 준다', () => {
    const c = coverFor(['codex', 'grok']);
    expect(c.claude).toEqual(expect.arrayContaining(['개발(Codex 대신)', '리서치(Grok 대신)']));
    expect(c.studioA).toEqual(['중요 기획(ChatGPT 대신)']);
    expect(coverFor([])).toEqual({});
  });
});
