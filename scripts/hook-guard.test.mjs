import { describe, expect, it } from 'vitest';
import { checkCommand, checkStaged, checkTool, checkWrite } from '../.github/templates/hooks/guard.mjs';

describe('미노피아 기본 훅(v0.7.43)', () => {
  it('위험한 명령은 막고 평범한 명령은 둔다', () => {
    for (const c of ['rm -rf /', 'rm -rf ~', 'rm -rf .', 'rm -rf *', 'sudo rm -fr / --no-preserve-root', 'git push --force origin ai/x', 'git push -f', 'git push origin main', 'git push origin HEAD:release', 'git commit --no-verify -m x', 'supabase db reset', 'supabase db push', 'psql -c "DROP TABLE users"', 'cat .env', 'tail -n 5 .env.local', 'printenv', 'env | grep KEY'])
      expect(checkCommand(c), c).not.toBeNull();
    for (const c of ['rm -rf dist', 'rm -rf node_modules/.cache', 'git push -u origin ai/codex/x', 'git push --force-with-lease origin ai/x', 'npm test', 'cat .env.example', 'echo "env"', 'git log --oneline', 'grep -r truncate src'])
      expect(checkCommand(c), c).toBeNull();
  });
  it('.env·비밀값 쓰기는 막는다', () => {
    expect(checkWrite('.env', 'A=1')).not.toBeNull();
    expect(checkWrite('app/.env.local', 'A=1')).not.toBeNull();
    expect(checkWrite('.env.example', 'A=')).toBeNull();
    expect(checkWrite('src/a.ts', 'const t = "ghp_' + 'a'.repeat(36) + '"')).not.toBeNull();
    expect(checkWrite('src/a.ts', 'const ok = 1')).toBeNull();
    expect(checkTool({ tool_name: 'Edit', tool_input: { file_path: '.env', new_string: 'x' } })).not.toBeNull();
    expect(checkTool({ tool_name: 'Read', tool_input: { file_path: '.env' } })).toBeNull();
  });
  it('커밋 검사', () => {
    expect(checkStaged(['.env'], [])).toContain('.env');
    expect(checkStaged(['a.sql'], ['+drop table users;'])).toContain('삭제 SQL');
    expect(checkStaged(['a.ts'], ['+const k = "sk-ant-' + 'b'.repeat(30) + '"'])).toContain('비밀값');
    expect(checkStaged(['a.ts'], ['+const x = 1'])).toBeNull();
  });
});
