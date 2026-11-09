// 새 홈페이지 출발점(v0.5.58, 소유자 목록 27번, taste-skill(MIT) layout-v4 참고): 홈페이지·소개 페이지 견본일 때만
// 검증된 첫 화면 구성 중 하나를 정해서(규칙, 모델 호출 없음) 지시서 끝에 붙인다. Studio A·B는 서로 다른 구성을 받아 고르는 의미가 있게 한다.
// 견본은 외부 글꼴을 못 쓰므로 글꼴 조합 대신 글자 크기 단계만 넣는다.

export const HOMEPAGE = /홈페이지|랜딩|소개 페이지|첫 화면|메인 페이지|landing|hero/i;

export const HEROES: readonly { id: string; text: string }[] = [
  { id: 'split', text: '나눔형: 왼쪽 5칸에 제목·설명·버튼, 오른쪽 6칸에 그림(제목과 위 줄 맞춤), 그림 왼쪽 아래에 작은 카드 하나. 휴대폰에서는 글 다음 그림.' },
  { id: 'photo', text: '사진형: 화면 가득한 사진 한 장, 사진의 차분하고 어두운 쪽에 제목(두 줄)과 설명, 아래에 핵심 숫자 4개. 휴대폰에서는 사진 아래에 글.' },
  { id: 'product', text: '제품형: 위 줄에 제목(왼쪽 7칸)과 설명·버튼(오른쪽 4칸), 그 아래 제품 화면을 가로 가득 크게. 제품 위에는 아무것도 얹지 않음.' },
  { id: 'editorial', text: '잡지형: 제목 글자 자체가 그림. 아주 큰 제목 세 줄 안에 작은 둥근 사진 한두 개를 끼워 넣음.' },
  { id: 'collage', text: '창 잘림형: 왼쪽 5칸에 글, 오른쪽 6칸에 제품 화면 창(아래가 잘린 모양)과 결과 카드 하나.' },
  { id: 'word', text: '큰 글자형: 아주 큰 제목 두 줄, 마지막 한 단어에 밑줄 강조. 아래 왼쪽에 설명·버튼, 오른쪽에 핵심 사실 4개.' },
  { id: 'statement', text: '한 문장형: 차분한 한 문장 제목(두 줄)만 크게, 그 아래 설명·버튼·핵심 사실 4개. 사진 없음.' },
  { id: 'triptych', text: '조각 모음형: 왼쪽 좁은 칸에 제목, 가운데~오른쪽에 그림 조각 3~5개 모음, 오른쪽 끝에 큰 버튼 하나.' },
  { id: 'centred', text: '가운데형: 작은 표시 알약, 가운데 큰 제목, 설명, 둥근 버튼 두 개, 그 아래 제품 화면 창을 가로로(아래쪽으로 흐려지게).' },
];

export const TYPE_SCALE = '글자 크기(데스크톱/휴대폰): 첫 화면 제목 72/38px, 소제목 48/30, 작은 제목 28/24, 본문 16(줄 높이 26), 작은 글씨 14, 13px 미만 없음. 한 줄 62자 이하, 굵기는 400·500만(크기로 강조).';

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 홈페이지 견본이면 이 업무·이 Studio에 정해진 첫 화면 구성 안내, 아니면 빈 글 */
export function homepageStart(text: string, taskId: string, slot: number): string {
  if (!HOMEPAGE.test(text)) return '';
  const hero = HEROES[(hash(taskId) + slot * 4) % HEROES.length];
  return `\n\n[첫 화면 출발점(정해 줌)] ${hero.text}\n- 첫 화면은 화면 한 장 높이를 넘지 않고, 제목은 하나, 움직임은 많아야 하나.\n- ${TYPE_SCALE}`;
}
