import { describe, expect, it } from 'vitest';
import { cleanRefs, cleanStandard, REF_SYSTEM, styleFiles } from './standard';

describe('디자인 기준 문서 초안(v0.5.56)', () => {
  it('스타일 파일을 우선순위대로 고르고 빌드 폴더는 뺀다', () => {
    expect(styleFiles(['src/App.tsx', 'dist/a.css', 'src/styles.css', 'tailwind.config.ts', 'index.html', 'node_modules/x/y.css', 'src/theme.ts'])).toEqual(['tailwind.config.ts', 'src/theme.ts', 'src/styles.css', 'index.html']);
  });
  it('형식이 맞는 문서만 받는다', () => {
    expect(cleanStandard('```markdown\n# 디자인 기준\n## 색\n- 주 색: #c76a2b\n```')).toBe('# 디자인 기준\n## 색\n- 주 색: #c76a2b');
    expect(cleanStandard('그냥 글')).toBeNull();
  });
});

describe('참고 서비스(v0.7.50)', () => {
  it('파일 이름 모양만, 중복 없이, 3개까지', () => {
    expect(cleanRefs(['vercel', 'linear.app', 'vercel', '../etc', 'A', 'stripe', 'notion'])).toEqual(['vercel', 'linear.app', 'stripe']);
    expect(cleanRefs('vercel')).toEqual([]);
    expect(cleanRefs(['1win'])).toEqual([]);
  });
  it('흉내 금지 규칙이 들어 있다', () => {
    expect(REF_SYSTEM).toContain('대표 색은 그대로 쓰지 않는다');
    expect(REF_SYSTEM).toContain('참고:');
  });
});
