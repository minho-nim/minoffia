// 결과 화면 찍기(result-shot.yml)용 작은 정적 서버(v0.7.34): 127.0.0.1에서만 열고, 없는 경로(/stats 같은 화면 주소)는
// index.html로 돌려준다(단일 페이지 앱). 폴더 밖 파일은 주지 않는다. 사용: node scripts/static-serve.mjs <폴더> [포트]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };

/** 요청 경로 → 보낼 파일(폴더 안만). 없으면 index.html */
export function resolveFile(root, urlPath) {
  const base = path.resolve(root);
  let p = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0] || '/');
  const full = path.resolve(base, `.${p}`);
  if (full !== base && !full.startsWith(base + path.sep)) return path.join(base, 'index.html');
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  if (fs.existsSync(path.join(full, 'index.html'))) return path.join(full, 'index.html');
  return path.join(base, 'index.html');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [root = '.', port = '4173'] = process.argv.slice(2);
  http
    .createServer((req, res) => {
      let file;
      try {
        file = resolveFile(root, req.url ?? '/');
      } catch {
        file = path.join(path.resolve(root), 'index.html');
      }
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(buf);
      });
    })
    .listen(Number(port), '127.0.0.1');
}
