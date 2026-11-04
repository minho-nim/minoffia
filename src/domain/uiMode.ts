// 화면 모드(v0.6.0, 소유자 2026-11-04): Classic Office(기존, 기본값)와 New Office(확정 디자인 2장) 중 고른다.
// 같은 업무 데이터·승인 흐름을 쓰고 화면 표현만 바뀐다. 선택은 이 기기(localStorage)에 남긴다.
// shortcut: 기기마다 따로 저장(계정 저장은 DB 칸 추가가 필요), 여러 기기에서 같이 쓰고 싶다고 하면 계정 설정 표를 만든다.
export type UiMode = 'classic' | 'new';
export type NewView = 'space' | 'org';

const MODE_KEY = 'minlab-ai-office:ui-mode:v1';
const VIEW_KEY = 'minlab-ai-office:new-view:v1';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 저장된 모드. 값이 없거나 이상하면 Classic */
export function loadUiMode(s: Storage | null = safeStorage()): UiMode {
  try {
    return s?.getItem(MODE_KEY) === 'new' ? 'new' : 'classic';
  } catch {
    return 'classic';
  }
}

export function saveUiMode(mode: UiMode, s: Storage | null = safeStorage()): void {
  try {
    s?.setItem(MODE_KEY, mode);
  } catch {
    // 저장이 막혀도(사생활 보호 모드 등) 지금 화면은 바뀐다.
  }
}

export function loadNewView(s: Storage | null = safeStorage()): NewView {
  try {
    return s?.getItem(VIEW_KEY) === 'org' ? 'org' : 'space';
  } catch {
    return 'space';
  }
}

export function saveNewView(view: NewView, s: Storage | null = safeStorage()): void {
  try {
    s?.setItem(VIEW_KEY, view);
  } catch {
    // 위와 같음
  }
}
