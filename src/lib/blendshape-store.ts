/**
 * Blendshape preset store — persisted in localStorage.
 * No Supabase / server required.
 */

export interface BlendshapePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  weights: Record<string, number>;
  target_mode: 'perfectsync' | 'standard' | 'both';
  is_active: boolean;
  created_at: string;
}

const STORAGE_KEY = 'voxie_blendshape_presets';

export function loadPresets(): BlendshapePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: BlendshapePreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function addPreset(preset: Omit<BlendshapePreset, 'id' | 'created_at'>): BlendshapePreset {
  const presets = loadPresets();
  const newPreset: BlendshapePreset = {
    ...preset,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  presets.push(newPreset);
  savePresets(presets);
  return newPreset;
}

export function updatePreset(id: string, patch: Partial<BlendshapePreset>): void {
  const presets = loadPresets();
  const idx = presets.findIndex(p => p.id === id);
  if (idx === -1) return;
  presets[idx] = { ...presets[idx], ...patch };
  savePresets(presets);
}

export function deletePreset(id: string): void {
  savePresets(loadPresets().filter(p => p.id !== id));
}
