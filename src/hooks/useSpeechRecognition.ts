import { useState, useRef, useCallback, useEffect } from 'react';

export type SpeechRecognitionStatus =
  | 'idle'
  | 'requesting'   // asking for mic permission
  | 'starting'     // mic granted, waiting for audio stream
  | 'listening'    // actively recording
  | 'processing'   // got audio, waiting for result
  | 'error';

export interface UseSpeechRecognitionResult {
  status: SpeechRecognitionStatus;
  transcript: string;        // live interim transcript
  isSupported: boolean;
  isReady: boolean;          // true when mic is ready to capture audio
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const [isReady, setIsReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalSegmentRef = useRef(onFinalSegment);
  onFinalSegmentRef.current = onFinalSegment;

  const isSupported = !!getSpeechRecognition();
  const detectedLang = lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'id-ID');

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatus('idle');
    setIsReady(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript('');
    setError(null);
    setStatus('idle');
    setIsReady(false);
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
    setIsReady(false);

    const recognition = new SR();
    recognition.lang = detectedLang;
    recognition.continuous = true;       // keep listening — don't stop after one utterance
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('starting');
      // Wait a bit for audio stream to be fully ready
      setTimeout(() => {
        setStatus('listening');
        setIsReady(true);
      }, 300); // 300ms delay to ensure mic is ready
    };

    recognition.onaudiostart = () => {
      // Audio stream is now active and capturing
      setStatus('listening');
      setIsReady(true);
    };

    recognition.onsoundstart = () => {
      // Sound detected - mic is definitely working
      setIsReady(true);
    };

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
      setIsReady(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus(prev => (prev === 'listening' || prev === 'requesting' || prev === 'starting' ? 'idle' : prev));
      setIsReady(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      setError('Gagal memulai pengenalan suara');
      setStatus('error');
      recognitionRef.current = null;
      setIsReady(false);
    }
  }, [detectedLang]);

  useEffect(() => () => { recognitionRef.current?.stop(); recognitionRef.current = null; }, []);

  return { status, transcript, isSupported, isReady, start, stop, reset, error };
}
