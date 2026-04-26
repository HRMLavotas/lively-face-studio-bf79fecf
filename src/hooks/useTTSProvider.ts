/**
 * Manages TTS provider selection and ElevenLabs rate-limit state.
 *
 * - Free users: always Web Speech, cannot change
 * - Pro users: can toggle ElevenLabs on/off via settings
 * - If ElevenLabs hits rate limit (429), it auto-disables and falls back to Web Speech
 */

import { useState, useCallback, useEffect } from 'react';

export type TTSProvider = 'elevenlabs' | 'webspeech' | 'vits';

const STORAGE_KEY = 'vrm.tts_provider';

function readStored(): TTSProvider {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'elevenlabs' || v === 'webspeech' || v === 'vits') return v;
  } catch { /* ok */ }
  return 'vits'; // Default ke VITS
}

export function useTTSProvider(isPro: boolean) {
  const [provider, setProviderState] = useState<TTSProvider>(() => {
    const stored = readStored();
    // Allow vits and webspeech for everyone, elevenlabs only for isPro
    if (!isPro && stored === 'elevenlabs') return 'webspeech';
    return stored;
  });
  const [rateLimited, setRateLimited] = useState(false);

  // If user loses pro and was on elevenlabs, force webspeech
  useEffect(() => {
    if (!isPro && provider === 'elevenlabs') setProviderState('webspeech');
  }, [isPro, provider]);

  const setProvider = useCallback((p: TTSProvider) => {
    // Only restrict elevenlabs
    if (!isPro && p === 'elevenlabs') return; 
    setProviderState(p);
    setRateLimited(false);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ok */ }
  }, [isPro]);

  /** Call this when ElevenLabs returns 429 — auto-falls back to Web Speech */
  const handleRateLimit = useCallback(() => {
    setRateLimited(true);
    setProviderState('webspeech');
    console.warn('[TTS] ElevenLabs rate limited — switched to Web Speech');
  }, []);

  /** The effective provider to actually use */
  const activeProvider: TTSProvider = (!isPro && provider === 'elevenlabs') ? 'webspeech' : provider;

  return { provider, activeProvider, rateLimited, setProvider, handleRateLimit };
}
