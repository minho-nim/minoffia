// 링크 읽기 안전 검사(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// 내부망·메타데이터 주소를 막고, 링크 종류를 나누고, HTML에서 제목·본문만 뽑는다.

export type LinkKind = 'webpage' | 'image' | 'github' | 'other';

export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 1_000_000;
export const TIMEOUT_MS = 8_000;
export const MAX_EXCERPT = 20_000;

const BLOCKED_HOSTS = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /\.lan$/i, /\.home\.arpa$/i, /^metadata$/i, /\.supabase\.(co|in|net)$/i];

/** 사설·루프백·링크 로컬·멀티캐스트·예약 IPv4 */
function blockedIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 링크 로컬·클라우드 메타데이터
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // ::ffff:1.2.3.4 같은 IPv4 꼬리
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split('.').map(Number);
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail];
  if (parts.length !== 8 || parts.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map((x) => parseInt(x, 16));
}

function blockedIpv6(ip: string): boolean {
  const w = expandIpv6(ip);
  if (!w) return true;
  if (w.every((x) => x === 0)) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) {
    return blockedIpv4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`); // IPv4 매핑
  }
  if ((w[0] & 0xfe00) === 0xfc00) return true; // 고유 로컬 fc00::/7
  if ((w[0] & 0xffc0) === 0xfe80) return true; // 링크 로컬
  if ((w[0] & 0xff00) === 0xff00) return true; // 멀티캐스트
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // 문서용
  if (w[0] === 0x64 && w[1] === 0xff9b) return true; // NAT64(내부 IPv4로 갈 수 있음)
  return false;
}

export function isBlockedIp(ip: string): boolean {
  return ip.includes(':') ? blockedIpv6(ip) : blockedIpv4(ip);
}

const isIpv4Literal = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const isIpv6Literal = (h: string) => h.startsWith('[') || h.includes(':');

/** 주소 자체를 검사한다. 문제가 있으면 한국어 이유를 돌려준다(DNS 확인 전 단계). */
export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: '올바른 주소가 아닙니다.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'http·https 주소만 읽습니다.' };
  if (url.username || url.password) return { ok: false, reason: '아이디·비밀번호가 들어간 주소는 읽지 않습니다.' };
  if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: '기본 포트(80·443)만 허용합니다.' };
  const host = url.hostname.replace(/\.$/, '');
  if (!host.includes('.') && !isIpv6Literal(host)) return { ok: false, reason: '내부망 이름은 읽지 않습니다.' };
  if (BLOCKED_HOSTS.some((re) => re.test(host))) return { ok: false, reason: '내부망·서비스 내부 주소는 읽지 않습니다.' };
  if ((isIpv4Literal(host) || isIpv6Literal(host)) && isBlockedIp(host)) return { ok: false, reason: '사설·내부 IP 주소는 읽지 않습니다.' };
  // 10진수·16진수로 쓴 IP(예: http://2130706433/)는 URL이 IPv4로 바꿔 주지만, 남은 이상한 형태도 막는다.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return { ok: false, reason: '숫자만 있는 주소는 읽지 않습니다.' };
  return { ok: true, url };
}

/** 링크 종류. GitHub 파일 보기 주소는 원문(raw) 주소로 바꿔 읽는다(공개 저장소만 읽힌다). */
export function classify(url: URL): { kind: LinkKind; fetchUrl: string } {
  const host = url.hostname.toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return { kind: 'github', fetchUrl: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` };
    return { kind: 'github', fetchUrl: url.toString() };
  }
  if (host === 'raw.githubusercontent.com') return { kind: 'github', fetchUrl: url.toString() };
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname)) return { kind: 'image', fetchUrl: url.toString() };
  return { kind: 'webpage', fetchUrl: url.toString() };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** HTML에서 제목·설명·본문 글자만 뽑는다. 스크립트·스타일은 버린다. */
/** hidden 속성·aria-hidden="true"·display:none·visibility:hidden인 요소(안쪽 글까지) */
export const HIDDEN_ELEMENT = /<([a-z][a-z0-9]*)\b[^>]*?(?:\shidden(?=[\s>=/])|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px)?\s*[;"']))[^>]*>[\s\S]*?<\/\1>/gi;
/** 폭 없는 글자·방향 바꾸는 글자(눈에 안 보이게 지시를 숨기는 데 쓰임) */
export const INVISIBLE_CHARS = /[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/g;

export function extractHtml(html: string): { title: string; description: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 300);
  const metaDesc =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
    '';
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    // 화면에 안 보이는 글(v0.6.6, Scrapling 착안): 숨긴 칸에 AI에게 하는 지시를 몰래 넣는 것을 막는다
    .replace(HIDDEN_ELEMENT, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .replace(INVISIBLE_CHARS, '')
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v\r]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_EXCERPT);
  return { title, description: decode(metaDesc).trim().slice(0, 500), text };
}

/** 응답 형식으로 처리 방법을 정한다. */
export function contentKind(contentType: string): 'html' | 'text' | 'image' | 'unsupported' {
  const t = contentType.toLowerCase();
  if (t.includes('text/html') || t.includes('application/xhtml')) return 'html';
  if (t.startsWith('text/') || t.includes('json') || t.includes('xml') || t.includes('markdown')) return 'text';
  if (t.startsWith('image/')) return 'image';
  return 'unsupported';
}
