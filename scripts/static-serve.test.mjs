import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveFile } from './static-serve.mjs';

describe('결과 화면 찍기 정적 서버(v0.7.34)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-'));
  fs.writeFileSync(path.join(root, 'index.html'), 'i');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'a.js'), 'a');
  it('있는 파일은 그대로, 없는 화면 주소는 index.html', () => {
    expect(resolveFile(root, '/assets/a.js')).toBe(path.join(root, 'assets', 'a.js'));
    expect(resolveFile(root, '/stats?x=1')).toBe(path.join(root, 'index.html'));
    expect(resolveFile(root, '/')).toBe(path.join(root, 'index.html'));
  });
  it('폴더 밖은 주지 않는다', () => {
    expect(resolveFile(root, '/../../etc/passwd')).toBe(path.join(root, 'index.html'));
    expect(resolveFile(root, '/%2e%2e/%2e%2e/etc/passwd')).toBe(path.join(root, 'index.html'));
  });
});
