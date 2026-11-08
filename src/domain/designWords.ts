// 디자인 단어 버튼(v0.5.54, 소유자 목록 24번, impeccable 어휘 참고): "느낌이 별로야" 대신 단어를 누르면
// 정해 둔 구체적인 작업 설명이 수정 요청 칸에 들어간다(규칙, 모델 호출 없음). '짚어서 수정'과 함께 쓰면 "여기를 더 차분하게"가 된다.
export const DESIGN_WORDS: { word: string; text: string }[] = [
  { word: '더 과감하게', text: '더 과감하게: 제목·핵심 버튼을 더 크고 굵게, 색 대비를 높이고, 한 화면에서 가장 중요한 것 하나가 바로 눈에 띄게.' },
  { word: '더 차분하게', text: '더 차분하게: 색 수를 줄이고 채도를 낮추고, 그림자·테두리·장식을 덜고, 여백을 넉넉히.' },
  { word: '덜어내기', text: '덜어내기: 꼭 필요하지 않은 문구·아이콘·구분선·버튼을 빼고, 비슷한 것은 하나로 합치기. 기능은 그대로.' },
  { word: '색 넣기', text: '색 넣기: 지금 쓰는 주 색을 살려 강조할 곳(핵심 버튼·상태 표시)에만 색을 더하기. 무지개처럼 여러 색은 피하기.' },
  { word: '글씨 정리', text: '글씨 정리: 제목·본문·작은 글씨 크기를 3단계 정도로 맞추고, 줄 간격과 한 줄 길이를 읽기 편하게. 너무 작은 글씨(12px 미만) 없애기.' },
  { word: '다듬기', text: '다듬기: 줄 맞춤·간격·모서리 둥글기·색을 화면 전체에서 통일하고, 어긋나거나 튀는 곳을 고치기. 구조는 그대로.' },
  { word: '휴대폰 맞추기', text: '휴대폰 맞추기: 400px 폭에서 가로 넘침 없이, 누르는 곳은 손가락 크기(44px 이상)로, 중요한 것이 먼저 보이게.' },
];

/** 수정 요청 칸에 단어 설명을 더한다(같은 단어는 한 번만) */
export function addDesignWord(current: string, word: string): string {
  const w = DESIGN_WORDS.find((d) => d.word === word);
  if (!w || current.includes(w.text)) return current;
  return current.trim() ? `${current.trimEnd()}\n${w.text}` : w.text;
}
