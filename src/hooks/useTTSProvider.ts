/**
 * Manages TTS provider selection and ElevenLabs rate-limit state.
 *
 * - Free users: always Web Speech, cannot change
 * - Pro users: can toggle ElevenLabs on/off via settings
 * - If ElevenLabs hits rate limit (429), it auto-disables and falls back to Web Speech
 */

import { useState, useCallback, useEffect } from 'react';

export type TTSProvider = 'elevenlabs' | 'webspeech';

const STORAGE_KEY = 'vrm.tts_provider';

function readStored(): TTSProvider {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'elevenlabs' || v === 'webspeech') return v;
  } catch { /* ok */ }
  return 'elevenlabs'; // pro default
}

export function useTTSProvider(isPro: boolean) {
  const [provider, setProviderState] = useState<TTSProvider>(() =>
    isPro ? readStored() : 'webspeech'
  );
  const [rateLimited, setRateLimited] = useState(false);

  // If user loses pro, force webspeech
  useEffect(() => {
    if (!isPro) setProviderState('webspeech');
  }, [isPro]);

  const setProvider = useCallback((p: TTSProvider) => {
    if (!isPro) return; // free users cannot change
    setProviderState(p);
    setRateLimited(false); // reset rate limit when manually switching
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ok */ }
  }, [isPro]);

  /** Call this when ElevenLabs returns 429 — auto-falls back to Web Speech */
  const handleRateLimit = useCallback(() => {
    setRateLimited(true);
    setProviderState('webspeech');
    console.warn('[TTS] ElevenLabs rate limited — switched to Web Speech');
  }, []);

  /** The effective provider to actually use */
  const activeProvider: TTSProvider = !isPro ? 'webspeech' : provider;

  return { provider, activeProvider, rateLimited, setProvider, handleRateLimit };
}
