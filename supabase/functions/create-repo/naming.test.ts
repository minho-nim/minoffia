import { describe, expect, it } from 'vitest';
import { repoNameError, toRepoSlug } from './naming';

describe('toRepoSlug', () => {
  it('영문 이름은 소문자·하이픈으로, 한글만 있으면 빈 문자열', () => {
    expect(toRepoSlug('Shop App 2')).toBe('shop-app-2');
    expect(toRepoSlug('  MuscleMap!! ')).toBe('musclemap');
    expect(toRepoSlug('운동 기록')).toBe('');
    expect(toRepoSlug('운동 Log')).toBe('log');
  });
});

describe('repoNameError', () => {
  it('GitHub 규칙과 보호 이름', () => {
    expect(repoNameError('shop-app')).toBeNull();
    expect(repoNameError('')).toContain('적으세요');
    expect(repoNameError('운동')).toContain('영문');
    expect(repoNameError('a b')).toContain('영문');
    expect(repoNameError('x.git')).toContain('쓸 수 없는');
    expect(repoNameError('..')).toContain('쓸 수 없는');
    expect(repoNameError('MinLab')).toContain('보호된');
    expect(repoNameError('minlab')).toContain('보호된');
    expect(repoNameError('MinLab-AI-Office')).toBeNull();
  });
});
