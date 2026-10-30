import { describe, expect, it } from 'vitest';
import { parsePrUrl, summarizeChecks } from './summary';

describe('parsePrUrl', () => {
  it('GitHub PR 주소만', () => {
    expect(parsePrUrl('https://github.com/minho-nim/MinLab-AI-Office/pull/27')).toEqual({ owner: 'minho-nim', repo: 'MinLab-AI-Office', number: 27 });
    expect(parsePrUrl('https://github.com/o/r/pull/3/')).toEqual({ owner: 'o', repo: 'r', number: 3 });
    expect(parsePrUrl('https://github.com/o/r/issues/3')).toBeNull();
    expect(parsePrUrl('http://github.com/o/r/pull/3')).toBeNull();
    expect(parsePrUrl('https://evil.example/o/r/pull/3')).toBeNull();
  });
});

describe('summarizeChecks', () => {
  const run = (status: string, conclusion: string | null) => ({ name: 'verify', status, conclusion });
  it('진행 중·실패·성공·없음', () => {
    expect(summarizeChecks([])).toBe('none');
    expect(summarizeChecks([run('completed', 'success'), run('in_progress', null)])).toBe('pending');
    expect(summarizeChecks([run('completed', 'success'), run('completed', 'failure')])).toBe('failure');
    expect(summarizeChecks([run('completed', 'cancelled')])).toBe('failure');
    expect(summarizeChecks([run('completed', 'success'), run('completed', 'skipped')])).toBe('success');
  });
});
