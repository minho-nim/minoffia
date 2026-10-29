import { describe, expect, it } from 'vitest';
import { classify, routeTask } from './router';
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
    const usage = [run('claude', 1), run('claude', 2)];
    const r = routeTask({ title: '아키텍처 설계', description: '', requestedType: 'auto' }, usage, now);
    expect(r.assignee).toBe('codex');
    expect(r.reason).toContain('한도 소진');
  });

  it('후보가 모두 한도면 1순위에 두고 내일 실행으로 표시한다', () => {
    const usage = [run('claude', 1), run('claude', 2), ...Array.from({ length: 6 }, (_, i) => run('codex', 10 + i))];
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
