// 사용량 기록 빠짐 막기(v0.7.99): ask-gemini가 쓰는 purpose가 DB 검사(마지막 마이그레이션)에 모두 있어야 한다.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ai_calls purpose 동기화', () => {
  it('ask-gemini의 purpose가 DB에서 허용된다', () => {
    const dir = 'supabase/migrations';
    const last = readdirSync(dir).filter((f) => readFileSync(`${dir}/${f}`, 'utf8').includes('ai_calls_purpose_check')).sort().at(-1)!;
    const allowed = readFileSync(`${dir}/${last}`, 'utf8').split('ai_calls_purpose_check').at(-1)!;
    for (const p of ['question', 'research', 'clarify', 'chat']) expect(allowed).toContain(`'${p}'`);
  });
});
