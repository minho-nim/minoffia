import { describe, expect, it } from 'vitest';
import { parsePrUrl as prStatusParse } from '../pr-status/summary';
import { decideDeploy, parsePrUrl } from './decide';

describe('decideDeploy', () => {
  it('release가 main보다 뒤면 앞당긴다', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'ahead' })).toEqual({ action: 'update' });
  });
  it('이미 같으면 아무것도 하지 않는다', () => {
    expect(decideDeploy({ releaseToMain: 'identical', mergeToMain: 'identical' })).toEqual({ action: 'noop' });
  });
  it('병합 커밋이 main에 없으면 거절', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'behind' }).action).toBe('refuse');
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'diverged' }).action).toBe('refuse');
  });
  it('release가 갈라졌거나 앞서 있으면 덮어쓰지 않는다', () => {
    expect(decideDeploy({ releaseToMain: 'diverged', mergeToMain: 'ahead' }).action).toBe('refuse');
    expect(decideDeploy({ releaseToMain: 'behind', mergeToMain: 'ahead' }).action).toBe('refuse');
  });
});

describe('parsePrUrl', () => {
  it('pr-status와 같은 규칙', () => {
    for (const u of ['https://github.com/o/r/pull/3', 'https://github.com/o/r/pull/3/', 'https://github.com/o/r/issues/3', 'http://github.com/o/r/pull/3', ' https://github.com/a.b/c-d/pull/10 ']) {
      expect(parsePrUrl(u)).toEqual(prStatusParse(u));
    }
  });
});
