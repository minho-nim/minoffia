import { describe, expect, it } from 'vitest';
import { geminiAppPrompt } from './geminiApp';

describe('Gemini 앱 예비 길(v0.8.4)', () => {
  it('링크만이면 요약 부탁, 물은 게 있으면 그 질문', () => {
    expect(geminiAppPrompt('https://youtu.be/dQw4w9WgXcQ?si=abc')).toMatch(/^이 유튜브 영상을 한국어로 요약해 줘/);
    expect(geminiAppPrompt('요약해줘 https://youtu.be/dQw4w9WgXcQ')).toMatch(/요약해 줘/);
    expect(geminiAppPrompt('3분쯤에 뭐라고 했어? https://youtu.be/dQw4w9WgXcQ')).toBe('이 유튜브 영상을 보고 답해 줘(한국어): 3분쯤에 뭐라고 했어?\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
