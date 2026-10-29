import type { AgentKind } from './workflow-types';

/** 실행 경로의 실제 연결 상태. 검증하지 않은 경로를 '연결됨'으로 두지 않는다. */
export type AdapterState = 'verified' | 'not_verified' | 'not_connected' | 'manual_only';

export interface AdapterInfo {
  agent: AgentKind | 'gpt' | 'gemini_vision';
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

/** 2026-10-29 확인 결과. 근거는 docs/CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md */
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
    role: '사진의 시각 정보 선행 분석',
    state: 'not_connected',
    autoStart: false,
    worksWithPcOff: true,
    reason: '무료 API 키와 프로젝트별 한도를 아직 연결·확인하지 않았다.',
    checkedAt: '2026-10-29',
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

export const ADAPTER_STATE_LABEL: Record<AdapterState, string> = {
  verified: '연결 확인됨',
  not_verified: '자동 실행 미검증',
  not_connected: '미연결',
  manual_only: '수동 인계',
};

export function adapterFor(agent: AgentKind): AdapterInfo {
  return ADAPTERS.find((a) => a.agent === agent) ?? ADAPTERS.find((a) => a.agent === 'codex')!;
}
