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
      className={`inbox-icon inbox-voice${on ? ' is-on' : ''}`}
      aria-label={on ? '듣기 멈추기' : '말로 입력'}
      aria-pressed={on}
      title={error || (on ? '듣는 중… 다시 누르면 멈춰요' : '말로 입력')}
      disabled={disabled}
      onClick={toggle}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}
