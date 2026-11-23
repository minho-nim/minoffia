// 유튜브 링크 요약(v0.8.3 소유자 "링크를 보내면 규칙으로 유튜브인지 보고, 맞으면 Gemini가 요약"):
// 규칙으로 주소를 찾아(모델 0) 그 영상을 Gemini에 '영상 칸(file_data)'으로 넘긴다. Gemini가 직접 영상(소리·화면)을 본다.
// 공개 영상만 되고, 무료 등급은 하루 영상 8시간까지. 토큰을 아끼려고 낮은 화질로 보낸다(1초 약 100토큰).
// 서버(supabase/functions/ask-gemini/youtube.ts)와 같은 파일(동기화 시험).

const YT = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^\s#]*?&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** 글 속 첫 유튜브 영상 → 표준 주소(없으면 null) */
export function youtubeUrl(text: string): string | null {
  const m = YT.exec(text);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

/** 영상과 함께 보낼 때 시스템 지시에 더하는 고정 규칙 */
// 배포 도구가 export 뒤 긴 따옴표 글을 경로로 잘못 읽어(255바이트 넘으면 실패) 짧은 조각으로 나눈다
export const VIDEO_RULE = [
  '\n질문에 유튜브 영상이 함께 오면 그 영상을 직접 보고(소리·화면) 답한다.',
  ' 따로 묻는 것이 없으면 핵심을 짧은 목록으로 요약하고, 중요한 장면은 [분:초]를 붙인다.',
  ' 영상을 볼 수 없으면 볼 수 없다고 말한다.',
].join('');
