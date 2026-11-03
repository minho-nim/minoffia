import type { AgentKind } from './workflow-types';

/** 실행 경로의 실제 연결 상태. 검증하지 않은 경로를 '연결됨'으로 두지 않는다. */
export type AdapterState = 'verified' | 'not_verified' | 'not_connected' | 'manual_only';

export interface AdapterInfo {
  agent: AgentKind | 'gpt' | 'gemini_vision' | 'claude_dev' | 'gemini_dev';
  label: string;
  role: string;
  state: AdapterState;
  /** 자동 시작 버튼을 켤 수 있는가 */
  autoStart: boolean;
  /** PC가 모두 꺼져도 동작하는가 */
  worksWithPcOff: boolean;
  reason: string;
  checkedAt: string;
}

/** 2026-10-29 확인 결과. 근거는 docs/archive/CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md */
export const ADAPTERS: AdapterInfo[] = [
  {
    agent: 'claude',
    label: 'Claude Code Cloud (PM)',
    role: '승인된 기획서로 작업 분해·배정 계획 작성',
    state: 'verified',
    autoStart: true,
    worksWithPcOff: true,
    reason: 'Routines API 트리거로 세션 시작을 실제 확인(2026-10-29). 계획 JSON은 세션에서 복사해 가져온다.',
    checkedAt: '2026-10-29',
  },
  {
    agent: 'claude_dev',
    label: 'Claude Code Cloud (보조 개발)',
    role: 'PM이 Claude에 배정한 작은 작업 구현(올리기 승인 전 푸시·PR 없음)',
    state: 'not_verified',
    autoStart: true,
    worksWithPcOff: true,
    reason:
      '실행 승인 뒤 서버가 두 번째 루틴(보조 개발)으로 세션을 시작한다. 세션 시작(HTTP 200)은 서버가 확인하지만 개발 완료는 아니다. 결과는 세션의 마지막 보고를 결과 패키지로 옮긴다. 운영 첫 실행 전이라 미검증.',
    checkedAt: '2026-10-30',
  },
  {
    agent: 'codex',
    label: 'Codex Cloud (주 개발)',
    role: '기능 구현·오류 수정·구조 개선',
    state: 'not_verified',
    autoStart: false,
    worksWithPcOff: true,
    reason:
      '`codex cloud exec`는 공식 CLI에 있지만 ChatGPT 로그인 인증만 지원한다. 꺼지지 않는 별도 실행기와 공식 자동화 인증이 확인되지 않아 자동 시작은 막아 두었다. Codex 웹에서 사용자가 직접 시작(수동 인계)한다.',
    checkedAt: '2026-10-29',
  },
  {
    agent: 'gpt',
    label: 'ChatGPT Planner',
    role: '의도 판단·확인 질문·최종 기획서',
    state: 'manual_only',
    autoStart: false,
    worksWithPcOff: true,
    reason: 'Plus 일반 채팅은 외부 자동 API가 아니다. 자료를 복사해 ChatGPT에서 기획하고 결과를 붙여넣는다.',
    checkedAt: '2026-10-29',
  },
  {
    agent: 'gemini_vision',
    label: 'Gemini A/B (이미지 분석)',
    role: '사진 분석·입력창 일반 질문 답변',
    state: 'not_connected',
    autoStart: false,
    worksWithPcOff: true,
    reason: '무료 API 키와 프로젝트별 한도를 아직 연결·확인하지 않았다.',
    checkedAt: '2026-10-29',
  },
  {
    agent: 'gemini_dev',
    label: 'Gemini 개발 (GitHub Actions)',
    role: 'PM이 쉬운 일(난이도 1~3)로 매긴 작업 구현(무료 키, 작업 브랜치만 push)',
    state: 'not_verified',
    autoStart: true,
    worksWithPcOff: true,
    reason:
      '실행 승인 뒤 서버가 GitHub Actions 워크플로(Gemini CLI)를 시작한다. 워크플로가 고치고 시험한 뒤 작업 브랜치만 push하고 결과를 보낸다. 손 실행 시험은 성공(2026-11-02), 앱에서 시작하는 길은 첫 실행 전이라 미검증.',
    checkedAt: '2026-11-02',
  },
  {
    agent: 'grok',
    label: 'Grok (리뷰)',
    role: '리뷰·추가 검증',
    state: 'not_connected',
    autoStart: false,
    worksWithPcOff: false,
    reason: '무료 계정의 무인 실행 경로가 확인되지 않았다.',
    checkedAt: '2026-10-29',
  },
];

/**
 * Gemini 연결 상태는 고정 문구가 아니라 실제 호출 기록으로 정한다.
 * 성공 기록이 있으면 '연결 확인됨', Supabase(서버 키) 모드인데 기록이 없으면 '실호출 전', 로컬 데모면 '미연결'.
 */
export function geminiAdapter(calls: { ok: boolean; createdAt: string }[], serverMode: boolean): AdapterInfo {
  const base = ADAPTERS.find((a) => a.agent === 'gemini_vision')!;
  const okCalls = calls.filter((c) => c.ok);
  if (okCalls.length) {
    const last = okCalls[okCalls.length - 1].createdAt.slice(0, 10);
    return { ...base, state: 'verified', reason: `서버 키로 실제 호출에 성공했다(최근 ${last}). 입력창 질문·이미지 분석에 쓴다.`, checkedAt: last };
  }
  if (serverMode) {
    const failed = calls.length > 0;
    return {
      ...base,
      state: 'not_verified',
      reason: failed
        ? '서버 키로 호출했지만 아직 성공한 기록이 없다. 위쪽 알림의 오류 이유(한도·키·모델 이름)를 확인한다.'
        : '서버에 키(GEMINI_API_KEY)를 두는 방식으로 연결해 두었다. 아직 실제 호출 기록이 없다. 입력창의 "Gemini에게 묻기"나 이미지 "Gemini로 분석"을 누르면 확인된다.',
    };
  }
  return { ...base, reason: '로컬 데모에서는 Gemini를 쓰지 않는다.' };
}

export const ADAPTER_STATE_LABEL: Record<AdapterState, string> = {
  verified: '연결 확인됨',
  not_verified: '자동 실행 미검증',
  not_connected: '미연결',
  manual_only: '수동 인계',
};

/** 배정된 작업의 실행 경로. Claude 작업은 PM이 아니라 보조 개발 루틴이다. */
export function adapterFor(agent: AgentKind, mode?: string): AdapterInfo {
  const key = agent === 'claude' ? 'claude_dev' : agent === 'gemini' && mode === 'gemini_actions' ? 'gemini_dev' : agent;
  return ADAPTERS.find((a) => a.agent === key) ?? ADAPTERS.find((a) => a.agent === 'codex')!;
}
