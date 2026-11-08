// 말로 입력(v0.5.37, paseo 음성 모드에서 착안): 휴대폰·브라우저에 들어 있는 음성 인식을 쓴다(추가 비용·키 없음).
// 지원하지 않는 브라우저에서는 버튼을 숨긴다. 받아 적은 글은 입력칸 뒤에 붙고, 보내기는 사용자가 누른다.
import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const Ctor = recognitionCtor();
  useEffect(() => () => rec.current?.stop(), []);
  if (!Ctor) return null;

  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    setError('');
    const r = new Ctor();
    r.lang = 'ko-KR';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .filter((x) => x.isFinal)
        .map((x) => x[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    r.onend = () => setOn(false);
    r.onerror = (e) => {
      setOn(false);
      setError(e.error === 'not-allowed' ? '마이크 권한을 허용해 주세요.' : '음성을 알아듣지 못했어요.');
    };
    rec.current = r;
    try {
      r.start();
      setOn(true);
    } catch {
      setOn(false);
    }
  };

  return (
    <button
      type="button"
      className={`inbox-attach inbox-voice${on ? ' is-on' : ''}`}
      aria-label={on ? '듣기 멈추기' : '말로 입력'}
      aria-pressed={on}
      title={error || (on ? '듣는 중… 다시 누르면 멈춰요' : '말로 입력')}
      disabled={disabled}
      onClick={toggle}
    >
      <svg className="pixel-icon" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
        <path fill="currentColor" d="M6 1h4v1h1v7h-1v1H6V9H5V2h1zM3 7h1v2h1v1h1v1h4v-1h1V9h1V7h1v2h-1v2h-1v1H9v2h2v1H5v-1h2v-2H5v-1H4V9H3z" />
      </svg>
    </button>
  );
}
