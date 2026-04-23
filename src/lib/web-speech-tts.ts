/**
 * Web Speech API TTS — browser-native, no API key needed.
 * Used as fallback for free users or when ElevenLabs is unavailable.
 */

export function isWebSpeechTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let _currentUtterance: SpeechSynthesisUtterance | null = null;

// ── Procedural lip-sync for Web Speech ───────────────────────────────────────
// Web Speech API doesn't expose an audio stream, so we synthesise a fake
// audio-level signal that mimics natural speech rhythm.
let _lipSyncActive = false;
let _lipSyncTimer  = 0;
let _lipSyncLevel  = 0;

/** Call every animation frame while Web Speech is speaking.
 *  Returns a 0–1 "audio level" that drives updateLipSync(). */
export function getWebSpeechLipLevel(delta: number): number {
  if (!_lipSyncActive) {
    // Decay to zero when not speaking
    _lipSyncLevel *= 0.85;
    return _lipSyncLevel;
  }
  _lipSyncTimer += delta;

  // Layered oscillators that mimic syllable rhythm (~4 Hz) + micro-variation
  const syllable  = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 4.2));   // ~4 Hz
  const word      = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 1.3));   // ~1.3 Hz word boundary
  const micro     = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 11.0)) * 0.15; // high-freq flutter

  const raw = syllable * 0.55 + word * 0.30 + micro;
  // Smooth toward target
  _lipSyncLevel += (raw - _lipSyncLevel) * 0.25;
  return Math.min(_lipSyncLevel, 1.0);
}

export function startWebSpeechLipSync(): void  { _lipSyncActive = true;  _lipSyncTimer = 0; }
export function stopWebSpeechLipSync(): void   { _lipSyncActive = false; }
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSpeechTTSOptions {
  lang?: string;       // e.g. 'id-ID', 'en-US' — auto-detected if omitted
  rate?: number;       // 0.1–10, default 1.0
  pitch?: number;      // 0–2, default 1.0
  volume?: number;     // 0–1, default 1.0
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent) => void;
}

/** Detect best voice for the given language — prefer neural/enhanced/premium voices */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langPrefix = lang.split('-')[0];

  // Priority: exact lang match, prefer neural/enhanced/premium/natural in name
  const humanKeywords = /neural|enhanced|premium|natural|wavenet|studio/i;

  const exactMatch   = voices.filter(v => v.lang === lang);
  const prefixMatch  = voices.filter(v => v.lang.startsWith(langPrefix));
  const pool = exactMatch.length ? exactMatch : prefixMatch.length ? prefixMatch : voices;

  return (
    pool.find(v => humanKeywords.test(v.name)) ??
    pool.find(v => v.localService) ??   // local voices tend to sound better than remote
    pool.find(v => v.default) ??
    pool[0] ??
    null
  );
}

/** Detect language from text for voice selection */
function detectLang(text: string): string {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th-TH';
  // Default to Indonesian (most common for this app)
  return 'id-ID';
}

export function speakWithWebSpeech(text: string, opts: WebSpeechTTSOptions = {}): void {
  if (!isWebSpeechTTSSupported()) {
    opts.onError?.({ error: 'not-supported' } as unknown as SpeechSynthesisErrorEvent);
    return;
  }

  // Cancel any ongoing speech
  stopWebSpeech();

  const lang = opts.lang ?? detectLang(text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang   = lang;

  // Slight random micro-variation per utterance — breaks the robotic flatness
  const rateJitter  = (Math.random() - 0.5) * 0.06;  // ±0.03
  const pitchJitter = (Math.random() - 0.5) * 0.08;  // ±0.04

  utterance.rate   = opts.rate   ?? (1.08 + rateJitter);   // slightly faster = more natural pace
  utterance.pitch  = opts.pitch  ?? (0.95 + pitchJitter);  // slightly lower = warmer, less robotic
  utterance.volume = opts.volume ?? 1.0;

  // Try to pick a matching voice (may be empty on first call — voices load async)
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;

  utterance.onstart = () => { startWebSpeechLipSync(); opts.onStart?.(); };
  utterance.onend   = () => { stopWebSpeechLipSync(); _currentUtterance = null; opts.onEnd?.(); };
  utterance.onerror = (e) => { stopWebSpeechLipSync(); _currentUtterance = null; opts.onError?.(e); };

  _currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopWebSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    _currentUtterance = null;
    stopWebSpeechLipSync();
  }
}

export function isWebSpeechSpeaking(): boolean {
  return typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    window.speechSynthesis.speaking;
}

/** Preload voices (call once on app start) */
export function preloadVoices(): void {
  if (!isWebSpeechTTSSupported()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices(); // trigger cache
  }, { once: true });
}
