import { describe, expect, it } from 'vitest';
import { designReviewSection } from './designReview';

describe('디자인 업무 전용 채점(v0.5.56)', () => {
  it('화면 업무에만 붙고, 기준 문서가 있으면 함께', () => {
    expect(designReviewSection('README 오타 고치기', '# 디자인 기준')).toBe('');
    expect(designReviewSection('설정 화면 버튼 정리', '')).toContain('디자인 업무 채점 기준');
    expect(designReviewSection('설정 화면 버튼 정리', '# 디자인 기준\n## 색')).toContain('[프로젝트 디자인 기준(소유자 승인)]');
  });
});
