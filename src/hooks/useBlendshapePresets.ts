import { useRef, useCallback, useEffect } from 'react';
import type { VRM } from '@pixiv/three-vrm';
import { loadPresets, type BlendshapePreset } from '@/lib/blendshape-store';

export type { BlendshapePreset };

export function useBlendshapePresets() {
  const presetsRef = useRef<BlendshapePreset[]>([]);

  useEffect(() => {
    presetsRef.current = loadPresets().filter(p => p.is_active);
  }, []);

  const applyPresetByName = useCallback((name: string, vrm: VRM): boolean => {
    const target = name.trim().toLowerCase();
    const preset = presetsRef.current.find(p => p.name.trim().toLowerCase() === target);
    if (!preset || !vrm.expressionManager) return false;
    applyWeights(preset.weights, vrm);
    return true;
  }, []);

  const applyPresetById = useCallback((id: string, vrm: VRM): boolean => {
    const preset = presetsRef.current.find(p => p.id === id);
    if (!preset || !vrm.expressionManager) return false;
    applyWeights(preset.weights, vrm);
    return true;
  }, []);

  return { presetsRef, applyPresetByName, applyPresetById };
}

export function applyWeights(weights: Record<string, number>, vrm: VRM) {
  const em = vrm.expressionManager!;
  for (const [key, value] of Object.entries(weights)) {
    const v = Math.max(0, Math.min(1, value));
    try { em.setValue(key, v); } catch (_) { /* ok */ }
    const camel = key.charAt(0).toLowerCase() + key.slice(1);
    if (camel !== key) { try { em.setValue(camel, v); } catch (_) { /* ok */ } }
  }
}
