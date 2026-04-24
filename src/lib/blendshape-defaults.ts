/**
 * Built-in blendshape presets — 52 ARKit / Perfect Sync keys.
 * Loaded into localStorage on first run if no presets exist yet.
 *
 * Key names follow the hinzka/VRoid Perfect Sync convention (PascalCase).
 * Standard VRM fallback keys (camelCase) are also tried at apply-time.
 */

import { type BlendshapePreset, loadPresets, savePresets } from './blendshape-store';

// ── 52 ARKit zero baseline ────────────────────────────────────────────────────
const Z: Record<string, number> = {
  EyeBlinkLeft: 0, EyeBlinkRight: 0,
  EyeWideLeft: 0,  EyeWideRight: 0,
  EyeSquintLeft: 0, EyeSquintRight: 0,
  BrowDownLeft: 0, BrowDownRight: 0,
  BrowInnerUp: 0,
  BrowOuterUpLeft: 0, BrowOuterUpRight: 0,
  CheekPuff: 0,
  CheekSquintLeft: 0, CheekSquintRight: 0,
  NoseSneerLeft: 0,  NoseSneerRight: 0,
  JawOpen: 0, JawLeft: 0, JawRight: 0, JawForward: 0,
  MouthSmileLeft: 0,  MouthSmileRight: 0,
  MouthFrownLeft: 0,  MouthFrownRight: 0,
  MouthDimpleLeft: 0, MouthDimpleRight: 0,
  MouthStretchLeft: 0, MouthStretchRight: 0,
  MouthRollLower: 0, MouthRollUpper: 0,
  MouthShrugLower: 0, MouthShrugUpper: 0,
  MouthPressLeft: 0,  MouthPressRight: 0,
  MouthLowerDownLeft: 0, MouthLowerDownRight: 0,
  MouthUpperUpLeft: 0,   MouthUpperUpRight: 0,
  MouthClose: 0, MouthFunnel: 0, MouthPucker: 0,
  MouthLeft: 0,  MouthRight: 0,
  TongueOut: 0,
};

// ── Helper ────────────────────────────────────────────────────────────────────
function w(overrides: Record<string, number>): Record<string, number> {
  return { ...Z, ...overrides };
}

function preset(
  name: string,
  description: string,
  category: string,
  weights: Record<string, number>,
): Omit<BlendshapePreset, 'id' | 'created_at'> {
  return { name, description, category, weights, target_mode: 'perfectsync', is_active: true };
}

// ── Preset definitions ────────────────────────────────────────────────────────
export const DEFAULT_PRESETS: Omit<BlendshapePreset, 'id' | 'created_at'>[] = [

  // ── MOOD ──────────────────────────────────────────────────────────────────
  preset('Happy', 'Senyum natural dengan pipi terangkat', 'mood', w({
    MouthSmileLeft: 0.70, MouthSmileRight: 0.70,
    CheekSquintLeft: 0.30, CheekSquintRight: 0.30,
    EyeSquintLeft: 0.15,  EyeSquintRight: 0.15,
    BrowOuterUpLeft: 0.15, BrowOuterUpRight: 0.15,
    MouthDimpleLeft: 0.20, MouthDimpleRight: 0.20,
  })),

  preset('Sad', 'Ekspresi sedih dengan alis turun', 'mood', w({
    MouthFrownLeft: 0.65, MouthFrownRight: 0.65,
    BrowInnerUp: 0.75,
    BrowDownLeft: 0.20,  BrowDownRight: 0.20,
    EyeSquintLeft: 0.15, EyeSquintRight: 0.15,
    MouthPressLeft: 0.20, MouthPressRight: 0.20,
    MouthRollLower: 0.15,
  })),

  preset('Angry', 'Ekspresi marah dengan alis mengerut', 'mood', w({
    BrowDownLeft: 0.85,  BrowDownRight: 0.85,
    NoseSneerLeft: 0.40, NoseSneerRight: 0.40,
    MouthFrownLeft: 0.50, MouthFrownRight: 0.50,
    MouthPressLeft: 0.40, MouthPressRight: 0.40,
    EyeSquintLeft: 0.35, EyeSquintRight: 0.35,
  })),

  preset('Surprised', 'Terkejut dengan mata terbuka lebar', 'mood', w({
    EyeWideLeft: 0.90,  EyeWideRight: 0.90,
    BrowOuterUpLeft: 0.75, BrowOuterUpRight: 0.75,
    BrowInnerUp: 0.65,
    JawOpen: 0.45,
    MouthShrugUpper: 0.30,
    MouthShrugLower: 0.20,
  })),

  preset('Curious', 'Penasaran dengan alis asimetris', 'mood', w({
    BrowInnerUp: 0.45,
    BrowOuterUpLeft: 0.20, BrowOuterUpRight: 0.38,
    EyeWideLeft: 0.18,     EyeWideRight: 0.28,
    MouthSmileLeft: 0.08,  MouthSmileRight: 0.08,
    JawOpen: 0.05,
  })),

  preset('Thinking', 'Sedang berpikir dengan ekspresi serius', 'mood', w({
    BrowDownLeft: 0.45,  BrowDownRight: 0.25,
    BrowInnerUp: 0.20,
    EyeSquintLeft: 0.22, EyeSquintRight: 0.10,
    MouthPressLeft: 0.28, MouthPressRight: 0.15,
    MouthLeft: 0.12,
  })),

  preset('Bored', 'Ekspresi bosan/datar', 'mood', w({
    EyeSquintLeft: 0.18, EyeSquintRight: 0.18,
    BrowDownLeft: 0.22,  BrowDownRight: 0.22,
    MouthPressLeft: 0.18, MouthPressRight: 0.18,
    MouthStretchLeft: 0.10, MouthStretchRight: 0.10,
  })),

  preset('Embarrassed', 'Malu dengan senyum kecil', 'mood', w({
    MouthSmileLeft: 0.35, MouthSmileRight: 0.35,
    CheekSquintLeft: 0.20, CheekSquintRight: 0.20,
    EyeSquintLeft: 0.18,   EyeSquintRight: 0.18,
    BrowInnerUp: 0.30,
    MouthPressLeft: 0.15,  MouthPressRight: 0.15,
  })),

  preset('Disgusted', 'Ekspresi jijik', 'mood', w({
    NoseSneerLeft: 0.75,  NoseSneerRight: 0.75,
    MouthFrownLeft: 0.40, MouthFrownRight: 0.40,
    BrowDownLeft: 0.55,   BrowDownRight: 0.55,
    EyeSquintLeft: 0.30,  EyeSquintRight: 0.30,
    MouthUpperUpLeft: 0.38, MouthUpperUpRight: 0.38,
  })),

  preset('Sympathetic', 'Ekspresi simpati/iba', 'mood', w({
    BrowInnerUp: 0.80,
    MouthFrownLeft: 0.25, MouthFrownRight: 0.25,
    MouthPressLeft: 0.30, MouthPressRight: 0.30,
    EyeSquintLeft: 0.10,  EyeSquintRight: 0.10,
  })),

  preset('Relaxed', 'Ekspresi santai dan tenang', 'mood', w({
    EyeSquintLeft: 0.12, EyeSquintRight: 0.12,
    MouthSmileLeft: 0.15, MouthSmileRight: 0.15,
    BrowOuterUpLeft: 0.08, BrowOuterUpRight: 0.08,
  })),

  // ── EMOTE ─────────────────────────────────────────────────────────────────
  preset('Laughing', 'Tertawa lepas', 'emote', w({
    MouthSmileLeft: 1.0,  MouthSmileRight: 1.0,
    CheekSquintLeft: 0.85, CheekSquintRight: 0.85,
    EyeSquintLeft: 0.65,   EyeSquintRight: 0.65,
    JawOpen: 0.38,
    MouthDimpleLeft: 0.55, MouthDimpleRight: 0.55,
    CheekPuff: 0.20,
    BrowOuterUpLeft: 0.18, BrowOuterUpRight: 0.18,
  })),

  preset('Excited', 'Sangat antusias', 'emote', w({
    MouthSmileLeft: 0.85, MouthSmileRight: 0.85,
    CheekSquintLeft: 0.35, CheekSquintRight: 0.35,
    EyeWideLeft: 0.50,     EyeWideRight: 0.50,
    BrowOuterUpLeft: 0.60, BrowOuterUpRight: 0.60,
    BrowInnerUp: 0.45,
    JawOpen: 0.20,
    MouthDimpleLeft: 0.38, MouthDimpleRight: 0.38,
  })),

  preset('Wink Left', 'Kedip mata kiri', 'emote', w({
    EyeBlinkLeft: 1.0,
    MouthSmileLeft: 0.35, MouthSmileRight: 0.35,
    CheekSquintLeft: 0.40,
  })),

  preset('Wink Right', 'Kedip mata kanan', 'emote', w({
    EyeBlinkRight: 1.0,
    MouthSmileLeft: 0.35, MouthSmileRight: 0.35,
    CheekSquintRight: 0.40,
  })),

  preset('Pout', 'Manyun / cemberut manja', 'emote', w({
    MouthPucker: 0.75,
    MouthRollLower: 0.30,
    MouthRollUpper: 0.20,
    BrowInnerUp: 0.35,
    EyeWideLeft: 0.15, EyeWideRight: 0.15,
  })),

  preset('Smirk', 'Senyum sebelah / nakal', 'emote', w({
    MouthSmileLeft: 0.65, MouthSmileRight: 0.15,
    MouthDimpleLeft: 0.30,
    BrowOuterUpLeft: 0.20,
    EyeSquintRight: 0.10,
  })),

  preset('Shocked', 'Kaget ekstrem', 'emote', w({
    EyeWideLeft: 1.0,  EyeWideRight: 1.0,
    BrowOuterUpLeft: 0.90, BrowOuterUpRight: 0.90,
    BrowInnerUp: 0.80,
    JawOpen: 0.70,
    MouthShrugUpper: 0.40,
  })),

  preset('Crying', 'Menangis dengan mulut gemetar', 'emote', w({
    MouthFrownLeft: 0.80, MouthFrownRight: 0.80,
    BrowInnerUp: 0.90,
    EyeSquintLeft: 0.50, EyeSquintRight: 0.50,
    MouthStretchLeft: 0.30, MouthStretchRight: 0.30,
    JawOpen: 0.15,
    MouthLowerDownLeft: 0.25, MouthLowerDownRight: 0.25,
  })),

  // ── POSE ──────────────────────────────────────────────────────────────────
  preset('Eyes Wide Open', 'Mata terbuka maksimal', 'pose', w({
    EyeWideLeft: 1.0, EyeWideRight: 1.0,
    BrowOuterUpLeft: 0.50, BrowOuterUpRight: 0.50,
    BrowInnerUp: 0.40,
  })),

  preset('Eyes Closed', 'Mata tertutup penuh', 'pose', w({
    EyeBlinkLeft: 1.0, EyeBlinkRight: 1.0,
  })),

  preset('Eyes Squint', 'Mata menyipit', 'pose', w({
    EyeSquintLeft: 0.80, EyeSquintRight: 0.80,
    BrowDownLeft: 0.30,  BrowDownRight: 0.30,
  })),

  preset('Mouth Open', 'Mulut terbuka natural', 'pose', w({
    JawOpen: 0.55,
    MouthShrugLower: 0.15,
  })),

  preset('Mouth Wide', 'Mulut terbuka lebar', 'pose', w({
    JawOpen: 0.85,
    MouthStretchLeft: 0.40, MouthStretchRight: 0.40,
    MouthLowerDownLeft: 0.35, MouthLowerDownRight: 0.35,
    MouthUpperUpLeft: 0.25,   MouthUpperUpRight: 0.25,
  })),

  preset('Brow Raise', 'Alis terangkat kedua sisi', 'pose', w({
    BrowOuterUpLeft: 0.80, BrowOuterUpRight: 0.80,
    BrowInnerUp: 0.70,
  })),

  preset('Brow Furrow', 'Alis mengerut/cemberut', 'pose', w({
    BrowDownLeft: 0.80, BrowDownRight: 0.80,
    BrowInnerUp: 0.20,
    NoseSneerLeft: 0.15, NoseSneerRight: 0.15,
  })),

  preset('Cheek Puff', 'Pipi mengembung', 'pose', w({
    CheekPuff: 0.90,
    MouthClose: 0.60,
    MouthRollLower: 0.20,
    MouthRollUpper: 0.20,
  })),

  preset('Tongue Out', 'Lidah keluar', 'pose', w({
    TongueOut: 1.0,
    JawOpen: 0.30,
    MouthSmileLeft: 0.20, MouthSmileRight: 0.20,
  })),
];

// ── Seed function — call once on app init ─────────────────────────────────────
export function seedDefaultPresets(): void {
  const existing = loadPresets();
  // Hanya seed jika belum ada preset sama sekali
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const seeded: BlendshapePreset[] = DEFAULT_PRESETS.map((p, i) => ({
    ...p,
    id: `default-${i}-${p.name.toLowerCase().replace(/\s+/g, '-')}`,
    created_at: now,
  }));
  savePresets(seeded);
}
