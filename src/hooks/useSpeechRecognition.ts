import { useState, useRef, useCallback, useEffect } from 'react';

export type SpeechRecognitionStatus =
  | 'idle'
  | 'requesting'   // asking for mic permission
  | 'listening'    // actively recording
  | 'processing'   // got audio, waiting for result
  | 'error';

export interface UseSpeechRecognitionResult {
  status: SpeechRecognitionStatus;
  transcript: string;        // live interim transcript
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(
  lang?: string,
  /** Called every time a final speech segment is recognised */
  onFinalSegment?: (text: string) => void,
): UseSpeechRecognitionResult {
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalSegmentRef = useRef(onFinalSegment);
  onFinalSegmentRef.current = onFinalSegment;

  const isSupported = !!getSpeechRecognition();
  const detectedLang = lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'id-ID');

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript('');
    setError(null);
    setStatus('idle');
  }, [stop]);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setError('Browser tidak mendukung Speech Recognition');
      setStatus('error');
      return;
    }

    recognitionRef.current?.stop();
    setStatus('requesting');
    setTranscript('');
    setError(null);

    const recognition = new SR();
    recognition.lang = detectedLang;
    recognition.continuous = true;       // keep listening — don't stop after one utterance
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setStatus('listening');

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalSegmentRef.current?.(text);
        } else {
          interim += result[0].transcript;
        }
      }
      // Show live interim text
      setTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg: Record<string, string> = {
        'not-allowed':   'Akses mikrofon ditolak. Izinkan di pengaturan browser.',
        'no-speech':     'Tidak ada suara terdeteksi.',
        'audio-capture': 'Mikrofon tidak ditemukan.',
        'network':       'Error jaringan saat mengenali suara.',
        'aborted':       '',
      };
      const errMsg = msg[event.error] ?? `Error: ${event.error}`;
      if (errMsg) { setError(errMsg); setStatus('error'); }
      else setStatus('idle');
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus(prev => (prev === 'listening' || prev === 'requesting' ? 'idle' : prev));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      setError('Gagal memulai pengenalan suara');
      setStatus('error');
      recognitionRef.current = null;
    }
  }, [detectedLang]);

  useEffect(() => () => { recognitionRef.current?.stop(); recognitionRef.current = null; }, []);

  return { status, transcript, isSupported, start, stop, reset, error };
}
