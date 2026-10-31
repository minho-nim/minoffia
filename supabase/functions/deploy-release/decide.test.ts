import { describe, expect, it } from 'vitest';
import { parsePrUrl as prStatusParse } from '../pr-status/summary';
import { decideDeploy, parsePrUrl } from './decide';

describe('decideDeploy', () => {
  it('release가 main보다 뒤면 앞당긴다(main이 이 PR 병합과 같고 시험 통과)', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'success' })).toEqual({ action: 'update' });
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'none' })).toEqual({ action: 'update' });
  });
  it('v0.4.20: 다른 변경이 같이 나가면 확인을 받고, 확인하면 앞당긴다', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'ahead', extraCommits: 2, mainCi: 'success' })).toMatchObject({ action: 'confirm', extra: 2 });
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'ahead', extraCommits: 2, mainCi: 'success', allowExtra: true })).toEqual({ action: 'update' });
  });
  it('v0.4.20: main 시험이 진행 중이면 기다리고, 실패면 거절', () => {
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'pending' }).action).toBe('wait');
    expect(decideDeploy({ releaseToMain: 'ahead', mergeToMain: 'identical', mainCi: 'failure' }).action).toBe('refuse');
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
