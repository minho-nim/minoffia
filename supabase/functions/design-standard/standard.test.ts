import { describe, expect, it } from 'vitest';
import { cleanStandard, styleFiles } from './standard';

describe('디자인 기준 문서 초안(v0.5.56)', () => {
  it('스타일 파일을 우선순위대로 고르고 빌드 폴더는 뺀다', () => {
    expect(styleFiles(['src/App.tsx', 'dist/a.css', 'src/styles.css', 'tailwind.config.ts', 'index.html', 'node_modules/x/y.css', 'src/theme.ts'])).toEqual(['tailwind.config.ts', 'src/theme.ts', 'src/styles.css', 'index.html']);
  });
  it('형식이 맞는 문서만 받는다', () => {
    expect(cleanStandard('```markdown\n# 디자인 기준\n## 색\n- 주 색: #c76a2b\n```')).toBe('# 디자인 기준\n## 색\n- 주 색: #c76a2b');
    expect(cleanStandard('그냥 글')).toBeNull();
  });
});
