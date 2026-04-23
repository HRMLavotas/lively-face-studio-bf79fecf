/**
 * Web Speech API TTS — browser-native, no API key needed.
 * Used as fallback for free users or when ElevenLabs is unavailable.
 */

export function isWebSpeechTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let _currentUtterance: SpeechSynthesisUtterance | null = null;

// ── Procedural lip-sync for Web Speech ───────────────────────────────────────
let _lipSyncActive = false;
let _lipSyncTimer  = 0;
let _lipSyncLevel  = 0;

export function getWebSpeechLipLevel(delta: number): number {
  if (!_lipSyncActive) {
    _lipSyncLevel *= 0.85;
    return _lipSyncLevel;
  }
  _lipSyncTimer += delta;
  const syllable  = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 4.2));
  const word      = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 1.3));
  const micro     = Math.abs(Math.sin(_lipSyncTimer * Math.PI * 11.0)) * 0.15;
  const raw = syllable * 0.55 + word * 0.30 + micro;
  _lipSyncLevel += (raw - _lipSyncLevel) * 0.25;
  return Math.min(_lipSyncLevel, 1.0);
}

export function startWebSpeechLipSync(): void  { _lipSyncActive = true;  _lipSyncTimer = 0; }
export function stopWebSpeechLipSync(): void   { _lipSyncActive = false; }

export interface WebSpeechTTSOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent | { error: string }) => void;
}

// ── Voice gender heuristic & listing ─────────────────────────────────────────
export type VoiceGender = 'male' | 'female' | 'unknown';

const MALE_RX = /\b(male|man|pria|laki|guy|david|mark|alex|daniel|james|john|tom|paul|peter|matthew|fred|reed|aaron|arthur|albert|ralph|hugo|diego|jorge|felipe|santiago|kenji|hiroshi|takeshi|google.*\bmale\b|microsoft.*\b(?:david|mark|guy|paul|james|ravi|hortense|claude|paul|thomas|stefan)\b)/i;
const FEMALE_RX = /\b(female|woman|wanita|perempuan|sarah|lily|alice|samantha|victoria|karen|moira|tessa|fiona|susan|allison|ava|zira|hazel|catherine|linda|heather|julie|mia|emma|sofia|isabella|maria|laura|ana|kyoko|haruka|hannah|elsa|anna|google.*\bfemale\b|microsoft.*\b(?:zira|hazel|heera|catherine|susan|linda|julie|hortense|sabina|hedda|katja|paulina|elsa|helena)\b)/i;

export function detectVoiceGender(name: string): VoiceGender {
  if (FEMALE_RX.test(name)) return 'female';
  if (MALE_RX.test(name)) return 'male';
  return 'unknown';
}

export interface WebSpeechVoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  gender: VoiceGender;
  localService: boolean;
  default: boolean;
}

export function listWebSpeechVoices(): WebSpeechVoiceInfo[] {
  if (!isWebSpeechTTSSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.map((v) => ({
    voiceURI: v.voiceURI,
    name: v.name,
    lang: v.lang,
    gender: detectVoiceGender(v.name),
    localService: v.localService,
    default: v.default,
  }));
}

const VOICE_STORAGE_KEY = 'vrm.webspeech_voice';

export function setWebSpeechVoice(voiceURI: string | null): void {
  try {
    if (voiceURI) localStorage.setItem(VOICE_STORAGE_KEY, voiceURI);
    else localStorage.removeItem(VOICE_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function getWebSpeechVoice(): string | null {
  try { return localStorage.getItem(VOICE_STORAGE_KEY); } catch { return null; }
}

/** Pick voice: stored URI first, then heuristic match for lang */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const storedURI = getWebSpeechVoice();
  if (storedURI) {
    const stored = voices.find((v) => v.voiceURI === storedURI);
    if (stored) return stored;
  }

  const langPrefix = lang.split('-')[0];
  const humanKeywords = /neural|enhanced|premium|natural|wavenet|studio/i;
  const exactMatch   = voices.filter((v) => v.lang === lang);
  const prefixMatch  = voices.filter((v) => v.lang.startsWith(langPrefix));
  const pool = exactMatch.length ? exactMatch : prefixMatch.length ? prefixMatch : voices;

  return (
    pool.find((v) => humanKeywords.test(v.name)) ??
    pool.find((v) => v.localService) ??
    pool.find((v) => v.default) ??
    pool[0] ??
    null
  );
}

function detectLang(text: string): string {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'ja-JP';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th-TH';
  return 'id-ID';
}

export function speakWithWebSpeech(text: string, opts: WebSpeechTTSOptions = {}): void {
  if (!isWebSpeechTTSSupported()) {
    opts.onError?.({ error: 'not-supported' });
    return;
  }

  stopWebSpeech();

  const lang = opts.lang ?? detectLang(text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  const rateJitter  = (Math.random() - 0.5) * 0.06;
  const pitchJitter = (Math.random() - 0.5) * 0.08;

  utterance.rate   = opts.rate   ?? (1.08 + rateJitter);
  utterance.pitch  = opts.pitch  ?? (0.95 + pitchJitter);
  utterance.volume = opts.volume ?? 1.0;

  // Explicit voiceURI from caller wins
  let voice: SpeechSynthesisVoice | null = null;
  if (opts.voiceURI) {
    voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI) ?? null;
  }
  if (!voice) voice = pickVoice(lang);
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

export function preloadVoices(): void {
  if (!isWebSpeechTTSSupported()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  }, { once: true });
}
