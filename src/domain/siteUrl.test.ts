import { describe, expect, it } from 'vitest';
import { siteUrl } from './types';

describe('운영 사이트 주소(v0.5.89)', () => {
  it('프로젝트의 미리보기 주소로 운영 주소를 만든다', () => {
    expect(siteUrl({ previewHost: 'my-app.pages.dev' })).toBe('https://my-app.pages.dev/');
    expect(siteUrl({ previewHost: ' My-App.pages.dev ' })).toBe('https://my-app.pages.dev/');
  });
  it('주소가 없거나 이상하면 링크를 만들지 않는다', () => {
    expect(siteUrl({ previewHost: null })).toBeNull();
    expect(siteUrl({})).toBeNull();
    expect(siteUrl(null)).toBeNull();
    expect(siteUrl({ previewHost: 'javascript:alert(1)' })).toBeNull();
    expect(siteUrl({ previewHost: 'a.dev/../x' })).toBeNull();
  });
});
