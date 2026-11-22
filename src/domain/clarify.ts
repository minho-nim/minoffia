/**
 * 기획서 전에 되묻기(v0.7.97 소유자 "리버스 프롬프팅: 요청이 짧거나 모호할 때 미니엉이 1~3개 질문을 먼저").
 * 규칙만(모델 호출 0). 충분히 자세한 요청(80자 이상)이면 묻지 않는다. 질문은 많아야 3개.
 */
const PLACE = /탭|화면|페이지|칸|메뉴|상단|하단|위쪽|아래쪽|머리|설정|대화|업무|프로젝트|에이전트|사무실|팝업|카드|목록|입력창|버튼|헤더|홈|첫 화면/;
const BUG = /안\s?돼|안\s?되|오류|에러|버그|깨져|깨짐|안\s?나와|안\s?보여|멈춰|먹통|튕겨|이상해/;
// '검색'의 '색'은 빼고(색 앞이 글자 '검'이면 아님)
const UI = /(^|[^검])색|크기|위치|디자인|글씨|글자|배치|여백|간격|아이콘|모양/;
const VAGUE = /^(이거|그거|저거|이것|그것|저것)|알아서|대충|적당히|좀 고쳐|손 ?봐|개선해/;
const FEATURE = /추가|만들어|기능|넣어/;
const DONE = /되게|되도록|보이게|나오게|할 수 있게|하면 된|완료|기준/;

export function clarifyQuestions(text: string): string[] {
  const t = text.trim();
  if (t.length >= 80) return [];
  const out: string[] = [];
  // 아주 짧아도 장소·증상·바꿀 것(버튼 색 파랗게)이 있으면 묻지 않는다
  if (VAGUE.test(t) || (t.length < 12 && !PLACE.test(t) && !BUG.test(t) && !UI.test(t))) out.push('무엇을 어떻게 바꾸면 될까요? 화면·기능 이름을 알려 주세요.');
  if (BUG.test(t)) out.push('어느 화면에서 무엇을 했을 때 그런가요? 원래는 어떻게 되어야 하나요?');
  else if (UI.test(t) && !PLACE.test(t)) out.push('어느 화면(탭)의 어디를 바꿀까요?');
  if (FEATURE.test(t) && !DONE.test(t)) out.push('다 되면 무엇이 되어야 하나요? (완료 기준 한 줄)');
  return [...new Set(out)].slice(0, 3);
}

/** 답을 붙인 요청 글(기획서·원문에 그대로 들어간다) */
export function withAnswers(text: string, questions: string[], answer: string): string {
  const a = answer.trim();
  if (!a) return text;
  return `${text.trim()}\n\n[접수 전 질문에 대한 답]\n${questions.map((q) => `- ${q}`).join('\n')}\n→ ${a}`;
}

/** Gemini가 만든 되묻기 답 → 질문 목록(번호·글머리 빼고, 많아야 3개, 너무 길면 자름) */
export function aiQuestions(answer: string): string[] {
  return answer
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length >= 4)
    .map((l) => (l.length > 120 ? `${l.slice(0, 119)}…` : l))
    .slice(0, 3);
}
