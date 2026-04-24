/**
 * Manages the user's chosen idle blendshape preset.
 * Persisted in localStorage under 'vrm.idlePreset'.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'vrm.idlePreset';

export function useIdlePreset() {
  const [idlePresetId, setIdlePresetIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  const setIdlePreset = useCallback((id: string | null) => {
    setIdlePresetIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ok */ }
  }, []);

  return { idlePresetId, setIdlePreset };
}
