// 디자인 기준 '참고할 서비스 고르기'(v0.7.50 소유자 "Awesome Design.md를 참고해서 쓸 수 있게, 고르기 버튼을 만들고 연결"):
// minoffia-skills의 design-reference 스킬에 고정해 둔 DESIGN.md(VoltAgent/awesome-design-md, MIT) 목록.
// 서버(design-standard)가 고른 것만 그 저장소에서 읽어 Gemini 초안에 "구조만 참고"로 넘긴다. 이 목록과 서버의 이름 검사가 같아야 한다.

export interface DesignRef {
  slug: string;
  name: string;
  group: DesignRefGroup;
  /** 분위기 한 줄(쉬운 한국어) */
  mood: string;
}
export const DESIGN_REF_GROUPS = ['개발 도구', 'AI', '업무·생산성', '금융', '쇼핑·생활', '자동차·하드웨어', '미디어', '큰 회사', '옛날 웹'] as const;
export type DesignRefGroup = (typeof DESIGN_REF_GROUPS)[number];

/** 한 번에 고를 수 있는 수 */
export const DESIGN_REF_MAX = 3;

export const DESIGN_REFS: DesignRef[] = [
  // 개발 도구
  { slug: 'vercel', name: 'Vercel', group: '개발 도구', mood: '흰 바탕·검은 글자, 정밀하고 단정' },
  { slug: 'linear.app', name: 'Linear', group: '개발 도구', mood: '아주 어두운 바탕, 얇은 선, 조용한 고급' },
  { slug: 'cursor', name: 'Cursor', group: '개발 도구', mood: '어두운 편집기 느낌, 차분한 개발 도구' },
  { slug: 'supabase', name: 'Supabase', group: '개발 도구', mood: '어두운 바탕에 초록 강조' },
  { slug: 'sentry', name: 'Sentry', group: '개발 도구', mood: '짙은 보라 바탕, 장난기 있는 개발 도구' },
  { slug: 'raycast', name: 'Raycast', group: '개발 도구', mood: '어두운 유리 느낌, 빠른 키보드 앱' },
  { slug: 'warp', name: 'Warp', group: '개발 도구', mood: '터미널 감성, 어두운 바탕' },
  { slug: 'expo', name: 'Expo', group: '개발 도구', mood: '흰 바탕, 담백한 개발 플랫폼' },
  { slug: 'resend', name: 'Resend', group: '개발 도구', mood: '검은 바탕, 미니멀 이메일 개발 도구' },
  { slug: 'posthog', name: 'PostHog', group: '개발 도구', mood: '밝은 베이지, 손그림 같은 장난기' },
  { slug: 'hashicorp', name: 'HashiCorp', group: '개발 도구', mood: '검은 바탕, 기업용 인프라' },
  { slug: 'mongodb', name: 'MongoDB', group: '개발 도구', mood: '짙은 청록 바탕에 밝은 초록' },
  { slug: 'clickhouse', name: 'ClickHouse', group: '개발 도구', mood: '검은 바탕에 노랑 강조, 빠른 느낌' },
  { slug: 'sanity', name: 'Sanity', group: '개발 도구', mood: '어두운 바탕, 편집 도구 느낌' },
  { slug: 'mintlify', name: 'Mintlify', group: '개발 도구', mood: '하늘색 그라데이션, 문서 사이트' },
  { slug: 'webflow', name: 'Webflow', group: '개발 도구', mood: '파랑 강조, 시각적 제작 도구' },
  { slug: 'framer', name: 'Framer', group: '개발 도구', mood: '어두운 대지 위에 작업판 같은 화면' },
  { slug: 'opencode.ai', name: 'OpenCode', group: '개발 도구', mood: '터미널·고정폭 글꼴, 개발자 감성' },
  { slug: 'composio', name: 'Composio', group: '개발 도구', mood: '어두운 바탕, AI 연동 도구' },
  { slug: 'voltagent', name: 'VoltAgent', group: '개발 도구', mood: '어두운 바탕, 에이전트 엔진' },
  { slug: 'replicate', name: 'Replicate', group: '개발 도구', mood: '흑백 대비, 단순한 모델 실행 서비스' },
  // AI
  { slug: 'claude', name: 'Claude', group: 'AI', mood: '따뜻한 종이색 바탕, 편집 디자인' },
  { slug: 'mistral.ai', name: 'Mistral AI', group: 'AI', mood: '노을빛 주황 그라데이션' },
  { slug: 'cohere', name: 'Cohere', group: 'AI', mood: '흰 바탕, 정돈된 기업용 AI' },
  { slug: 'elevenlabs', name: 'ElevenLabs', group: 'AI', mood: '잡지 같은 조용한 편집 디자인' },
  { slug: 'minimax', name: 'MiniMax', group: 'AI', mood: '굵은 대비, 고급 AI 인프라' },
  { slug: 'together.ai', name: 'Together AI', group: 'AI', mood: '밝고 깔끔한 AI 인프라' },
  { slug: 'x.ai', name: 'xAI', group: 'AI', mood: '검은 바탕, 미래적이고 강한 대비' },
  { slug: 'runwayml', name: 'Runway', group: 'AI', mood: '영상 중심, 어두운 창작 도구' },
  { slug: 'ollama', name: 'Ollama', group: 'AI', mood: '흰 바탕, 아주 단순하고 귀여움' },
  { slug: 'lovable', name: 'Lovable', group: 'AI', mood: '부드러운 그라데이션, 친근한 앱 빌더' },
  { slug: 'nvidia', name: 'NVIDIA', group: 'AI', mood: '검은 바탕에 형광 초록' },
  // 업무·생산성
  { slug: 'notion', name: 'Notion', group: '업무·생산성', mood: '흰 바탕, 그림이 많은 친근한 작업 공간' },
  { slug: 'slack', name: 'Slack', group: '업무·생산성', mood: '보라 바탕, 밝고 친근한 업무 메신저' },
  { slug: 'figma', name: 'Figma', group: '업무·생산성', mood: '흑백 틀에 큼직한 파스텔 색 덩어리' },
  { slug: 'miro', name: 'Miro', group: '업무·생산성', mood: '노랑 강조, 장난기 있는 화이트보드' },
  { slug: 'airtable', name: 'Airtable', group: '업무·생산성', mood: '흰 바탕, 차분한 표·업무 도구' },
  { slug: 'cal', name: 'Cal.com', group: '업무·생산성', mood: '흰 바탕, 검은 버튼, 단정한 일정 앱' },
  { slug: 'intercom', name: 'Intercom', group: '업무·생산성', mood: '크림색 바탕, 편집 디자인 고객 상담' },
  { slug: 'superhuman', name: 'Superhuman', group: '업무·생산성', mood: '빠르고 고급스러운 메일 앱' },
  { slug: 'zapier', name: 'Zapier', group: '업무·생산성', mood: '주황 강조, 친근한 자동화' },
  { slug: 'clay', name: 'Clay', group: '업무·생산성', mood: '찰흙 인형 같은 밝은 색, 데이터 도구' },
  { slug: 'jobright', name: 'Jobright', group: '업무·생산성', mood: '활기찬 색, AI 구직 서비스' },
  // 금융
  { slug: 'stripe', name: 'Stripe', group: '금융', mood: '흰 바탕, 정교한 그라데이션, 결제 인프라' },
  { slug: 'mercury', name: 'Mercury', group: '금융', mood: '짙은 남보라, 차분한 은행' },
  { slug: 'wise', name: 'Wise', group: '금융', mood: '연두 강조, 쉬운 송금' },
  { slug: 'revolut', name: 'Revolut', group: '금융', mood: '검은 바탕, 세련된 핀테크' },
  { slug: 'coinbase', name: 'Coinbase', group: '금융', mood: '파랑 강조, 믿음직한 거래소' },
  { slug: 'kraken', name: 'Kraken', group: '금융', mood: '보라 강조, 거래소' },
  { slug: 'binance', name: 'Binance', group: '금융', mood: '검은 바탕에 노랑' },
  { slug: 'mastercard', name: 'Mastercard', group: '금융', mood: '따뜻한 색, 둥근 모양' },
  { slug: 'nerdwallet', name: 'NerdWallet', group: '금융', mood: '흰 바탕, 비교표 중심 금융 정보' },
  // 쇼핑·생활
  { slug: 'airbnb', name: 'Airbnb', group: '쇼핑·생활', mood: '흰 바탕, 따뜻한 분홍 강조, 사진 중심' },
  { slug: 'spotify', name: 'Spotify', group: '쇼핑·생활', mood: '검은 바탕에 초록, 음악 앱' },
  { slug: 'pinterest', name: 'Pinterest', group: '쇼핑·생활', mood: '흰 바탕, 사진 격자, 빨강 강조' },
  { slug: 'uber', name: 'Uber', group: '쇼핑·생활', mood: '흑백, 단단하고 실용적' },
  { slug: 'shopify', name: 'Shopify', group: '쇼핑·생활', mood: '영화 같은 큰 화면, 상거래' },
  { slug: 'starbucks', name: 'Starbucks', group: '쇼핑·생활', mood: '짙은 초록, 따뜻한 생활 브랜드' },
  { slug: 'nike', name: 'Nike', group: '쇼핑·생활', mood: '흑백, 큰 사진과 굵은 글씨' },
  { slug: 'oura', name: 'Oura', group: '쇼핑·생활', mood: '따뜻한 종이색, 건강 앱' },
  { slug: 'mydealz', name: 'mydealz', group: '쇼핑·생활', mood: '빽빽한 목록, 할인 커뮤니티' },
  { slug: 'vodafone', name: 'Vodafone', group: '쇼핑·생활', mood: '빨강 강조, 통신사' },
  // 자동차·하드웨어
  { slug: 'apple', name: 'Apple', group: '자동차·하드웨어', mood: '사진 중심, 넓은 여백, 박물관 같은 화면' },
  { slug: 'tesla', name: 'Tesla', group: '자동차·하드웨어', mood: '큰 사진, 아주 적은 글자' },
  { slug: 'spacex', name: 'SpaceX', group: '자동차·하드웨어', mood: '검은 바탕, 우주 사진, 대문자' },
  { slug: 'ferrari', name: 'Ferrari', group: '자동차·하드웨어', mood: '영화 같은 고급 자동차' },
  { slug: 'lamborghini', name: 'Lamborghini', group: '자동차·하드웨어', mood: '검은 바탕, 날카롭고 강렬' },
  { slug: 'bugatti', name: 'Bugatti', group: '자동차·하드웨어', mood: '검은 바탕, 절제된 초고급' },
  { slug: 'bmw', name: 'BMW', group: '자동차·하드웨어', mood: '차분한 기업형 자동차' },
  { slug: 'bmw-m', name: 'BMW M', group: '자동차·하드웨어', mood: '어두운 바탕, 레이싱 느낌' },
  { slug: 'renault', name: 'Renault', group: '자동차·하드웨어', mood: '노랑 강조, 대중 자동차' },
  { slug: 'dji', name: 'DJI', group: '자동차·하드웨어', mood: '제품 사진 진열장' },
  { slug: 'playstation', name: 'PlayStation', group: '자동차·하드웨어', mood: '파랑, 게임기 몰입감' },
  { slug: 'meta', name: 'Meta', group: '자동차·하드웨어', mood: '밝고 둥근, 기기 쇼핑' },
  // 미디어
  { slug: 'theverge', name: 'The Verge', group: '미디어', mood: '강한 색, 실험적인 기술 잡지' },
  { slug: 'wired', name: 'WIRED', group: '미디어', mood: '흑백 잡지, 굵은 제목' },
  { slug: 'aljazeera', name: 'Al Jazeera', group: '미디어', mood: '흰 바탕, 단단한 뉴스' },
  // 큰 회사
  { slug: 'ibm', name: 'IBM', group: '큰 회사', mood: '흰 바탕, 회색 글자, 질서 정연(Carbon)' },
  { slug: 'oracle', name: 'Oracle', group: '큰 회사', mood: '따뜻한 회색, 기업 시스템' },
  { slug: 'sap', name: 'SAP', group: '큰 회사', mood: '흰 바탕, 업무용 기업 시스템' },
  { slug: 'hp', name: 'HP', group: '큰 회사', mood: '흰 종이 같은 기업·소비자 브랜드' },
  // 옛날 웹
  { slug: 'dell-1996', name: 'Dell 1996', group: '옛날 웹', mood: '1996년 카탈로그 웹' },
  { slug: 'nintendo-2001', name: 'Nintendo 2001', group: '옛날 웹', mood: '2001년 게임기 크롬 느낌' },
];

const SLUGS = new Set(DESIGN_REFS.map((r) => r.slug));
/** 서버로 보낼 값 정리: 목록에 있는 것만, 중복 없이, 최대 3개 */
export function cleanDesignRefs(list: readonly string[]): string[] {
  return [...new Set(list.filter((s) => SLUGS.has(s)))].slice(0, DESIGN_REF_MAX);
}
