import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specNeedsWeb, specQuery } from './specResearch';

describe('기획서 전 자동 웹 조사(v0.8.1)', () => {
  it('외부 정보가 필요해 보일 때만', () => {
    expect(specNeedsWeb('카카오 로그인 API 연동해줘')).toBe(true);
    expect(specNeedsWeb('토스처럼 결제 화면 만들어줘')).toBe(false);
    expect(specNeedsWeb('토스 앱처럼 결제 화면 만들어줘')).toBe(true);
    expect(specNeedsWeb('최신 React 버전 기준으로 올려줘')).toBe(true);
    expect(specNeedsWeb('https://example.com 이 사이트 참고해서')).toBe(true);
    expect(specNeedsWeb('업무 탭 카드 글씨 크기 키워줘')).toBe(false);
    expect(specNeedsWeb('설정 버튼 색 주황으로')).toBe(false);
  });
  it('검색어는 제목 + 요청 앞부분, 되묻기 답은 빼고', () => {
    expect(specQuery('로그인 연동', '카카오 로그인 API\n\n[접수 전 질문에 대한 답]\n- 어디?\n→ 설정')).toBe('로그인 연동 카카오 로그인 API');
    expect(specQuery('a', 'b'.repeat(400))).toHaveLength(300);
  });
  it('검색 코드는 ask-gemini와 같은 복사본', () => {
    expect(readFileSync('supabase/functions/draft-spec/websearch.ts', 'utf8')).toBe(readFileSync('supabase/functions/ask-gemini/websearch.ts', 'utf8'));
  });
});
