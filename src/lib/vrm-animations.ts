import type { VRM } from '@pixiv/three-vrm';
import type { MoodName } from './sentiment';

// ============================================
// 1. AUTO RANDOM BLINKING
// ============================================

let blinkTimer = 0;
let nextBlinkIn = randomBlinkInterval();

// Blink state machine — driven purely by delta, no gsap dependency
type BlinkPhase = 'idle' | 'closing' | 'closed' | 'opening';
let blinkPhase: BlinkPhase = 'idle';
let blinkPhaseTimer = 0;

const BLINK_CLOSE_DURATION = 0.15; // detik menutup mata
const BLINK_HOLD_DURATION  = 0.10; // detik mata tertutup penuh
const BLINK_OPEN_DURATION  = 0.20; // detik membuka mata (lebih lambat = lebih natural)

// Expose untuk guard di applyPS / applyStd
export function getIsBlinking(): boolean {
  return blinkPhase !== 'idle';
}

function randomBlinkInterval(): number {
  return 4 + Math.random() * 5; // 4 - 9 detik antar kedip
}

/**
 * Langsung tulis ke morphTargetInfluences setelah vrm.update() selesai.
 * Ini satu-satunya cara yang dijamin bekerja karena vrm.update() bisa
 * menimpa nilai via overrideBlink multiplier.
 */
function applyBlinkDirect(vrm: VRM, value: number): void {
  const em = vrm.expressionManager;
  if (!em) return;

  const names: string[] = [];
  if (hasExpression(vrm, 'blinkLeft'))         names.push('blinkLeft', 'blinkRight');
  else if (hasExpression(vrm, 'EyeBlinkLeft')) names.push('EyeBlinkLeft', 'EyeBlinkRight');
  else if (hasExpression(vrm, 'blink'))        names.push('blink');

  for (const name of names) {
    const expr = em.getExpression(name);
    if (!expr) continue;

    // Akses _binds → primitives[] → morphTargetInfluences langsung
    // @ts-ignore
    const binds = expr._binds as Array<{
      primitives?: Array<{ morphTargetInfluences?: number[] }>;
      index?: number;
      weight?: number;
    }>;

    if (!binds?.length) continue;

    for (const bind of binds) {
      if (!bind.primitives || bind.index == null || bind.weight == null) continue;
      for (const mesh of bind.primitives) {
        if (mesh.morphTargetInfluences?.[bind.index] != null) {
          mesh.morphTargetInfluences[bind.index] = bind.weight * value;
        }
      }
    }
  }
}

export function updateBlink(delta: number, vrm: VRM): void {
  if (!vrm.expressionManager) return;

  const setEyes = (v: number) => {
    applyBlinkDirect(vrm, v);
  };

  if (blinkPhase === 'idle') {
    blinkTimer += delta;
    if (blinkTimer >= nextBlinkIn) {
      blinkTimer = 0;
      nextBlinkIn = randomBlinkInterval();
      blinkPhase = 'closing';
      blinkPhaseTimer = 0;
    } else {
      // Pastikan mata terbuka penuh saat idle
      setEyes(0);
    }
    return;
  }

  blinkPhaseTimer += delta;

  if (blinkPhase === 'closing') {
    const t = Math.min(blinkPhaseTimer / BLINK_CLOSE_DURATION, 1);
    setEyes(t * t);
    if (t >= 1) { blinkPhase = 'closed'; blinkPhaseTimer = 0; }

  } else if (blinkPhase === 'closed') {
    setEyes(1);
    if (blinkPhaseTimer >= BLINK_HOLD_DURATION) {
      blinkPhase = 'opening';
      blinkPhaseTimer = 0;
    }

  } else if (blinkPhase === 'opening') {
    const t = Math.min(blinkPhaseTimer / BLINK_OPEN_DURATION, 1);
    setEyes(1 - (1 - t) * (1 - t));
    if (t >= 1) {
      setEyes(0);
      blinkPhase = 'idle';
      blinkTimer = 0;
    }
  }
}

// ============================================
// 2. EXPRESSION CAPABILITY DETECTION
// ============================================
// Detect whether the loaded VRM has Perfect Sync (52 ARKit blendshapes)
// or only standard VRM expressions. Cache per VRM instance.

const _capabilityCache = new WeakMap<VRM, 'perfectsync' | 'standard'>();

function hasExpression(vrm: VRM, name: string): boolean {
  if (!vrm.expressionManager) return false;
  // expressionManager.getExpression returns undefined if not found
  return vrm.expressionManager.getExpression(name) !== undefined;
}

export function detectExpressionMode(vrm: VRM): 'perfectsync' | 'standard' {
  const cached = _capabilityCache.get(vrm);
  if (cached) return cached;

  if (!vrm.expressionManager) {
    _capabilityCache.set(vrm, 'standard');
    return 'standard';
  }

  // List all available expressions for debugging
  const allExpressions: string[] = [];
  try {
    // @ts-ignore — access internal map to enumerate all expressions
    const map = vrm.expressionManager._expressionMap ?? vrm.expressionManager.expressionMap;
    if (map) {
      for (const key of Object.keys(map)) {
        allExpressions.push(key);
      }
    }
  } catch (_) { /* ok */ }

  console.log('[Expressions] Available expressions:', allExpressions);
  console.log('[Expressions] Expression details:');
  for (const key of allExpressions) {
    const expr = vrm.expressionManager.getExpression(key);
    // @ts-ignore
    const binds = expr?.binds ?? expr?._binds ?? [];
    console.log(`  ${key}: ${binds.length} bind(s)`);
  }

  // Perfect Sync: must have ARKit-style names AND they must have morph targets
  const psKeys = ['EyeBlinkLeft', 'EyeBlinkRight', 'JawOpen', 'MouthSmileLeft'];
  let psCount = 0;
  for (const k of psKeys) {
    const expr = vrm.expressionManager.getExpression(k);
    if (expr) {
      // @ts-ignore
      const binds = expr.binds ?? expr._binds ?? [];
      if (binds.length > 0) psCount++;
    }
  }

  const mode = psCount >= 3 ? 'perfectsync' : 'standard';
  _capabilityCache.set(vrm, mode);
  console.log('[Expressions] Mode detected:', mode, `(${psCount}/${psKeys.length} PS keys with binds)`);
  return mode;
}

// ============================================
// 3. MOOD SYSTEM — dual-mode (Perfect Sync + Standard VRM)
// ============================================

// Standard VRM expression keys
interface StandardWeights {
  happy: number;
  sad: number;
  relaxed: number;
  surprised: number;
  angry: number;
  blinkLeft: number;
  blinkRight: number;
  browInnerUp: number;
  browDownLeft: number;
  browDownRight: number;
  aa: number;
}

// ARKit / Perfect Sync 52 blendshape keys (PascalCase — as exported by VRoid/hinzka)
interface PerfectSyncWeights {
  EyeBlinkLeft: number;
  EyeBlinkRight: number;
  EyeWideLeft: number;
  EyeWideRight: number;
  EyeSquintLeft: number;
  EyeSquintRight: number;
  BrowDownLeft: number;
  BrowDownRight: number;
  BrowInnerUp: number;
  BrowOuterUpLeft: number;
  BrowOuterUpRight: number;
  CheekPuff: number;
  CheekSquintLeft: number;
  CheekSquintRight: number;
  NoseSneerLeft: number;
  NoseSneerRight: number;
  JawOpen: number;
  JawLeft: number;
  JawRight: number;
  MouthSmileLeft: number;
  MouthSmileRight: number;
  MouthFrownLeft: number;
  MouthFrownRight: number;
  MouthDimpleLeft: number;
  MouthDimpleRight: number;
  MouthStretchLeft: number;
  MouthStretchRight: number;
  MouthRollLower: number;
  MouthRollUpper: number;
  MouthShrugLower: number;
  MouthShrugUpper: number;
  MouthPressLeft: number;
  MouthPressRight: number;
  MouthLowerDownLeft: number;
  MouthLowerDownRight: number;
  MouthUpperUpLeft: number;
  MouthUpperUpRight: number;
  MouthClose: number;
  MouthFunnel: number;
  MouthPucker: number;
  MouthLeft: number;
  MouthRight: number;
}

const PS_ZERO: PerfectSyncWeights = {
  EyeBlinkLeft: 0, EyeBlinkRight: 0, EyeWideLeft: 0, EyeWideRight: 0,
  EyeSquintLeft: 0, EyeSquintRight: 0,
  BrowDownLeft: 0, BrowDownRight: 0, BrowInnerUp: 0,
  BrowOuterUpLeft: 0, BrowOuterUpRight: 0,
  CheekPuff: 0, CheekSquintLeft: 0, CheekSquintRight: 0,
  NoseSneerLeft: 0, NoseSneerRight: 0,
  JawOpen: 0, JawLeft: 0, JawRight: 0,
  MouthSmileLeft: 0, MouthSmileRight: 0,
  MouthFrownLeft: 0, MouthFrownRight: 0,
  MouthDimpleLeft: 0, MouthDimpleRight: 0,
  MouthStretchLeft: 0, MouthStretchRight: 0,
  MouthRollLower: 0, MouthRollUpper: 0,
  MouthShrugLower: 0, MouthShrugUpper: 0,
  MouthPressLeft: 0, MouthPressRight: 0,
  MouthLowerDownLeft: 0, MouthLowerDownRight: 0,
  MouthUpperUpLeft: 0, MouthUpperUpRight: 0,
  MouthClose: 0, MouthFunnel: 0, MouthPucker: 0,
  MouthLeft: 0, MouthRight: 0,
};

// Perfect Sync mood presets — rich, nuanced expressions
const PS_MOOD_PRESETS: Record<MoodName, PerfectSyncWeights> = {
  neutral: {
    ...PS_ZERO,
    // Ekspresi netral yang lebih rileks tanpa senyum konstan
    MouthSmileLeft: 0.02, MouthSmileRight: 0.02,
    BrowOuterUpLeft: 0.03, BrowOuterUpRight: 0.03,
  },
  happy: {
    ...PS_ZERO,
    // Senyum natural tanpa mata terlalu tertutup
    MouthSmileLeft: 0.65, MouthSmileRight: 0.65,
    CheekSquintLeft: 0.25, CheekSquintRight: 0.25,
    EyeSquintLeft: 0.12, EyeSquintRight: 0.12,
    BrowOuterUpLeft: 0.18, BrowOuterUpRight: 0.18,
    MouthDimpleLeft: 0.20, MouthDimpleRight: 0.20,
  },
  sad: {
    ...PS_ZERO,
    MouthFrownLeft: 0.65, MouthFrownRight: 0.65,
    BrowInnerUp: 0.70,
    BrowDownLeft: 0.20, BrowDownRight: 0.20,
    EyeSquintLeft: 0.15, EyeSquintRight: 0.15,
    MouthPressLeft: 0.20, MouthPressRight: 0.20,
    MouthRollLower: 0.15,
  },
  excited: {
    ...PS_ZERO,
    // Excited dengan mata terbuka lebar, bukan tertutup
    MouthSmileLeft: 0.80, MouthSmileRight: 0.80,
    CheekSquintLeft: 0.30, CheekSquintRight: 0.30,
    EyeWideLeft: 0.45, EyeWideRight: 0.45,
    BrowOuterUpLeft: 0.55, BrowOuterUpRight: 0.55,
    BrowInnerUp: 0.40,
    JawOpen: 0.18,
    MouthDimpleLeft: 0.35, MouthDimpleRight: 0.35,
  },
  sympathetic: {
    ...PS_ZERO,
    BrowInnerUp: 0.80,
    MouthFrownLeft: 0.25, MouthFrownRight: 0.25,
    MouthPressLeft: 0.30, MouthPressRight: 0.30,
    EyeSquintLeft: 0.10, EyeSquintRight: 0.10,
    MouthRollLower: 0.10,
  },
  bored: {
    ...PS_ZERO,
    EyeSquintLeft: 0.15, EyeSquintRight: 0.15,
    BrowDownLeft: 0.20, BrowDownRight: 0.20,
    MouthPressLeft: 0.15, MouthPressRight: 0.15,
    MouthStretchLeft: 0.10, MouthStretchRight: 0.10,
  },
  curious: {
    ...PS_ZERO,
    // Ekspresi penasaran dengan mata terbuka dan alis terangkat
    BrowInnerUp: 0.45,
    BrowOuterUpLeft: 0.25, BrowOuterUpRight: 0.35,
    EyeWideLeft: 0.20, EyeWideRight: 0.28,
    MouthSmileLeft: 0.08, MouthSmileRight: 0.08,
    JawOpen: 0.06,
  },
  thinking: {
    ...PS_ZERO,
    BrowDownLeft: 0.40, BrowDownRight: 0.25,
    BrowInnerUp: 0.20,
    EyeSquintLeft: 0.20, EyeSquintRight: 0.10,
    MouthPressLeft: 0.25, MouthPressRight: 0.15,
    MouthLeft: 0.10,
  },
  angry: {
    ...PS_ZERO,
    BrowDownLeft: 0.80, BrowDownRight: 0.80,
    NoseSneerLeft: 0.40, NoseSneerRight: 0.40,
    MouthFrownLeft: 0.50, MouthFrownRight: 0.50,
    MouthPressLeft: 0.40, MouthPressRight: 0.40,
    EyeSquintLeft: 0.35, EyeSquintRight: 0.35,
    JawLeft: 0.05,
  },
  laughing: {
    ...PS_ZERO,
    MouthSmileLeft: 1.0, MouthSmileRight: 1.0,
    CheekSquintLeft: 0.85, CheekSquintRight: 0.85,
    EyeSquintLeft: 0.60, EyeSquintRight: 0.60,
    JawOpen: 0.35,
    MouthDimpleLeft: 0.50, MouthDimpleRight: 0.50,
    CheekPuff: 0.25,
    BrowOuterUpLeft: 0.20, BrowOuterUpRight: 0.20,
  },
  surprised: {
    ...PS_ZERO,
    EyeWideLeft: 0.85, EyeWideRight: 0.85,
    BrowOuterUpLeft: 0.70, BrowOuterUpRight: 0.70,
    BrowInnerUp: 0.60,
    JawOpen: 0.45,
    MouthShrugUpper: 0.30,
    MouthShrugLower: 0.20,
  },
  embarrassed: {
    ...PS_ZERO,
    // Malu dengan senyum kecil dan mata sedikit menunduk
    MouthSmileLeft: 0.35, MouthSmileRight: 0.35,
    CheekSquintLeft: 0.18, CheekSquintRight: 0.18,
    EyeSquintLeft: 0.15, EyeSquintRight: 0.15,
    BrowInnerUp: 0.30,
    MouthPressLeft: 0.15, MouthPressRight: 0.15,
  },
  disgusted: {
    ...PS_ZERO,
    NoseSneerLeft: 0.70, NoseSneerRight: 0.70,
    MouthFrownLeft: 0.40, MouthFrownRight: 0.40,
    BrowDownLeft: 0.50, BrowDownRight: 0.50,
    EyeSquintLeft: 0.30, EyeSquintRight: 0.30,
    MouthUpperUpLeft: 0.35, MouthUpperUpRight: 0.35,
    MouthStretchLeft: 0.20, MouthStretchRight: 0.20,
  },
};

// Standard VRM mood presets — only uses VRM spec preset names
// that are guaranteed to exist on any valid VRM model.
const STD_ZERO: StandardWeights = {
  happy: 0, sad: 0, relaxed: 0, surprised: 0, angry: 0,
  blinkLeft: 0, blinkRight: 0,
  browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
  aa: 0,
};

const STD_MOOD_PRESETS: Record<MoodName, StandardWeights> = {
  neutral:     { ...STD_ZERO, relaxed: 0.08 },
  happy:       { ...STD_ZERO, happy: 0.60, relaxed: 0.15 },
  sad:         { ...STD_ZERO, sad: 0.70, relaxed: 0.10 },
  excited:     { ...STD_ZERO, happy: 0.75, surprised: 0.30 },
  sympathetic: { ...STD_ZERO, sad: 0.30, relaxed: 0.35 },
  bored:       { ...STD_ZERO, relaxed: 0.35 },
  curious:     { ...STD_ZERO, surprised: 0.35, happy: 0.08 },
  thinking:    { ...STD_ZERO, relaxed: 0.18 },
  angry:       { ...STD_ZERO, angry: 0.70 },
  laughing:    { ...STD_ZERO, happy: 0.90 },
  surprised:   { ...STD_ZERO, surprised: 0.85 },
  embarrassed: { ...STD_ZERO, happy: 0.30, relaxed: 0.25 },
  disgusted:   { ...STD_ZERO, angry: 0.40, sad: 0.20 },
};

// Runtime state
let _currentPS: PerfectSyncWeights = { ...PS_MOOD_PRESETS.neutral };
let _targetPS: PerfectSyncWeights = { ...PS_MOOD_PRESETS.neutral };
let _currentStd: StandardWeights = { ...STD_MOOD_PRESETS.neutral };
let _targetStd: StandardWeights = { ...STD_MOOD_PRESETS.neutral };
let _activeMoodName: MoodName = 'neutral';

const MOOD_LERP_SPEED = 1.2;

export function setTargetMood(mood: MoodName): void {
  if (mood === _activeMoodName) return;
  _activeMoodName = mood;
  _targetPS = { ...PS_MOOD_PRESETS[mood] };
  _targetStd = { ...STD_MOOD_PRESETS[mood] };
}

export function getActiveMood(): MoodName {
  return _activeMoodName;
}

// Idle mood rotation
const IDLE_MOOD_POOL: { mood: MoodName; weight: number }[] = [
  { mood: 'neutral',    weight: 4 },
  { mood: 'happy',      weight: 3 },
  { mood: 'curious',    weight: 2 },
  { mood: 'thinking',   weight: 1.5 },
  { mood: 'bored',      weight: 1 },
  { mood: 'embarrassed', weight: 0.5 },
];
let _idleMoodTimer = 0;
let _nextIdleMoodIn = 5 + Math.random() * 4;
let _idleEnabled = true;

function pickIdleMood(): MoodName {
  const total = IDLE_MOOD_POOL.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of IDLE_MOOD_POOL) {
    if ((r -= m.weight) <= 0) return m.mood;
  }
  return 'neutral';
}

export function setIdleMoodEnabled(enabled: boolean): void {
  _idleEnabled = enabled;
}

function lerpPS(delta: number): void {
  const t = Math.min(MOOD_LERP_SPEED * delta, 1);
  for (const k of Object.keys(PS_ZERO) as (keyof PerfectSyncWeights)[]) {
    _currentPS[k] += (_targetPS[k] - _currentPS[k]) * t;
  }
}

function lerpStd(delta: number): void {
  const t = Math.min(MOOD_LERP_SPEED * delta, 1);
  for (const k of Object.keys(STD_ZERO) as (keyof StandardWeights)[]) {
    _currentStd[k] += (_targetStd[k] - _currentStd[k]) * t;
  }
}

function applyPS(vrm: VRM, noise: number): void {
  const em = vrm.expressionManager!;
  for (const [k, v] of Object.entries(_currentPS)) {
    // Jangan timpa EyeBlinkLeft/Right saat sistem blink sedang aktif
    if (getIsBlinking() && (k === 'EyeBlinkLeft' || k === 'EyeBlinkRight')) continue;
    const val = Math.max(0, Math.min(1, v + (k.startsWith('mouthSmile') ? noise * 0.5 : 0)));
    try { em.setValue(k, val); } catch (_) { /* expression may not exist */ }
  }
}

function applyStd(vrm: VRM, noise: number): void {
  const em = vrm.expressionManager!;
  // Helper: try both camelCase and PascalCase variants
  const set = (name: string, value: number) => {
    try { em.setValue(name, Math.max(0, value)); } catch (_) { /* ok */ }
    // Also try PascalCase variant (e.g. 'Surprised')
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    if (pascal !== name) {
      try { em.setValue(pascal, Math.max(0, value)); } catch (_) { /* ok */ }
    }
  };

  set('happy',    _currentStd.happy + noise);
  set('sad',      _currentStd.sad);
  set('relaxed',  _currentStd.relaxed);
  set('surprised', _currentStd.surprised);
  set('angry',    _currentStd.angry);
  // Jangan timpa blink saat sistem blink sedang aktif
  if (!getIsBlinking()) {
    set('blinkLeft',  _currentStd.blinkLeft);
    set('blinkRight', _currentStd.blinkRight);
  }
  // browInnerUp etc. only exist on some models — set() handles missing gracefully
  set('browInnerUp',   _currentStd.browInnerUp + Math.abs(noise) * 0.5);
  set('browDownLeft',  _currentStd.browDownLeft);
  set('browDownRight', _currentStd.browDownRight);
}

export function updateMicroExpressions(elapsed: number, vrm: VRM, delta = 0.016): void {
  if (!vrm.expressionManager) return;

  if (_idleEnabled) {
    _idleMoodTimer += delta;
    if (_idleMoodTimer >= _nextIdleMoodIn) {
      _idleMoodTimer = 0;
      _nextIdleMoodIn = 4 + Math.random() * 4;
      setTargetMood(pickIdleMood());
    }
  }

  const noise = Math.sin(elapsed * 3.7) * 0.012;
  const mode = detectExpressionMode(vrm);

  if (mode === 'perfectsync') {
    lerpPS(delta);
    applyPS(vrm, noise);
  } else {
    lerpStd(delta);
    applyStd(vrm, noise);
  }
}

// ============================================
// 4. LIP SYNC — dual-mode
// ============================================

let _smoothedMouth = 0;
let _currentShape = 0;
const MOUTH_SHAPES_STD = ['aa', 'ih', 'ou'] as const;
// ARKit mouth shapes for lip sync (PascalCase)
const MOUTH_SHAPES_PS = ['JawOpen', 'MouthFunnel', 'MouthPucker'] as const;
let _shapeTimer = 0;
const SHAPE_DURATION = 0.12;

export function updateLipSync(audioLevel: number, vrm: VRM, delta = 0.016): void {
  if (!vrm.expressionManager) return;

  const smoothing = 0.1;
  _smoothedMouth += (audioLevel - _smoothedMouth) * smoothing;
  const mouthValue = Math.pow(Math.min(_smoothedMouth * 1.4, 1.0), 1.3);

  _shapeTimer += delta;
  if (_shapeTimer >= SHAPE_DURATION) {
    _shapeTimer = 0;
    _currentShape = (_currentShape + 1) % 3;
  }

  const blend = _shapeTimer / SHAPE_DURATION;
  const mode = detectExpressionMode(vrm);

  if (mode === 'perfectsync') {
    // Clear all mouth shapes first
    for (const s of MOUTH_SHAPES_PS) vrm.expressionManager.setValue(s, 0);
    // Also drive mouthSmile down slightly when speaking
    vrm.expressionManager.setValue('MouthSmileLeft',  Math.max(0, _currentPS.MouthSmileLeft  * (1 - mouthValue * 0.4)));
    vrm.expressionManager.setValue('MouthSmileRight', Math.max(0, _currentPS.MouthSmileRight * (1 - mouthValue * 0.4)));

    const primary   = MOUTH_SHAPES_PS[_currentShape];
    const secondary = MOUTH_SHAPES_PS[(_currentShape + 1) % 3];
    vrm.expressionManager.setValue(primary,   mouthValue * (1 - blend * 0.4));
    vrm.expressionManager.setValue(secondary, mouthValue * blend * 0.4);
    vrm.expressionManager.setValue('JawOpen', mouthValue * 0.6);
    vrm.expressionManager.setValue('MouthLowerDownLeft',  mouthValue * 0.3);
    vrm.expressionManager.setValue('MouthLowerDownRight', mouthValue * 0.3);
  } else {
    for (const s of MOUTH_SHAPES_STD) vrm.expressionManager.setValue(s, 0);
    const primary   = MOUTH_SHAPES_STD[_currentShape];
    const secondary = MOUTH_SHAPES_STD[(_currentShape + 1) % 3];
    vrm.expressionManager.setValue(primary,   mouthValue * (1 - blend * 0.4));
    vrm.expressionManager.setValue(secondary, mouthValue * blend * 0.4);
  }
}

export function resetMouthExpressions(vrm: VRM): void {
  if (!vrm.expressionManager) return;
  const mode = detectExpressionMode(vrm);
  if (mode === 'perfectsync') {
    const mouthKeys: (keyof PerfectSyncWeights)[] = [
      'JawOpen', 'MouthFunnel', 'MouthPucker', 'MouthLeft', 'MouthRight',
      'MouthLowerDownLeft', 'MouthLowerDownRight', 'MouthUpperUpLeft', 'MouthUpperUpRight',
      'MouthClose', 'MouthRollLower', 'MouthRollUpper',
    ];
    for (const k of mouthKeys) {
      try { vrm.expressionManager.setValue(k, 0); } catch (_) { /* ok */ }
    }
  } else {
    ['aa','ih','ou','ee','oh'].forEach(s => vrm.expressionManager?.setValue(s, 0));
  }
  _smoothedMouth = 0;
  _shapeTimer = 0;
}

// ============================================
// 5. IDLE MICRO BODY GESTURES (chest-up only)
// ============================================

export function updateIdleMicroGestures(
  elapsed: number,
  vrm: VRM,
  drivenBones?: Set<string>,
): void {
  if (!vrm.humanoid) return;

  const isDriven = (name: string) => !!drivenBones?.has(name);

  const spine      = vrm.humanoid.getNormalizedBoneNode('spine');
  const chest      = vrm.humanoid.getNormalizedBoneNode('chest');
  const upperChest = vrm.humanoid.getNormalizedBoneNode('upperChest');
  const head       = vrm.humanoid.getNormalizedBoneNode('head');
  const neck       = vrm.humanoid.getNormalizedBoneNode('neck');

  if (spine && !isDriven('spine')) {
    spine.rotation.z += Math.sin(elapsed * 0.35) * 0.0002;
  }

  const breathX      = Math.sin(elapsed * 0.7) * 0.0006;
  const breathUpperX = Math.sin(elapsed * 0.7 + 0.3) * 0.0003;

  if (chest && !isDriven('chest'))           chest.rotation.x      += breathX;
  if (upperChest && !isDriven('upperChest')) upperChest.rotation.x += breathUpperX;

  const totalBreathX = breathX + breathUpperX;
  if (neck && !isDriven('neck')) { neck.rotation.x -= totalBreathX * 0.5; neck.rotation.z = 0; }
  if (head && !isDriven('head')) { head.rotation.x -= totalBreathX * 0.5; head.rotation.z = 0; }
}

// ============================================
// 6. IDLE SMILE PULSE
// ============================================

let _smileTimer = 0;
let _nextSmileIn = 8 + Math.random() * 7; // Lebih jarang: 8-15 detik
let _smileActive = false;
let _smilePhase = 0;

const SMILE_DURATION = 2.5; // Lebih lama dan natural
const SMILE_PEAK_PS  = 0.45; // Senyum lebih halus
const SMILE_BASE_PS  = 0.02; // Base minimal
const SMILE_PEAK_STD = 0.40; // Senyum lebih halus untuk standard
const SMILE_BASE_STD = 0.05; // Base minimal

export function updateIdleSmile(delta: number, vrm: VRM, suppressed = false): void {
  if (!vrm.expressionManager) return;

  if (suppressed) {
    _smileActive = false;
    _smileTimer = 0;
    _smilePhase = 0;
    return;
  }

  const mode = detectExpressionMode(vrm);
  const peak = mode === 'perfectsync' ? SMILE_PEAK_PS : SMILE_PEAK_STD;
  const base = mode === 'perfectsync' ? SMILE_BASE_PS : SMILE_BASE_STD;

  if (!_smileActive) {
    _smileTimer += delta;
    if (_smileTimer >= _nextSmileIn) {
      _smileTimer = 0;
      _smileActive = true;
      _smilePhase = 0;
    }
    if (mode === 'perfectsync') {
      try { vrm.expressionManager.setValue('MouthSmileLeft',  base); } catch (_) { /* ok */ }
      try { vrm.expressionManager.setValue('MouthSmileRight', base); } catch (_) { /* ok */ }
    } else {
      vrm.expressionManager.setValue('happy', base);
    }
    return;
  }

  _smilePhase += delta / SMILE_DURATION;
  if (_smilePhase >= 1) {
    _smileActive = false;
    _smilePhase = 0;
    _nextSmileIn = 8 + Math.random() * 7; // 8-15 detik
    if (mode === 'perfectsync') {
      try { vrm.expressionManager.setValue('MouthSmileLeft',  base); } catch (_) { /* ok */ }
      try { vrm.expressionManager.setValue('MouthSmileRight', base); } catch (_) { /* ok */ }
    } else {
      vrm.expressionManager.setValue('happy', base);
    }
    return;
  }

  // Smooth ease in-out curve untuk transisi lebih natural
  const t = _smilePhase;
  const eased = t < 0.5 
    ? 2 * t * t 
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const wave = Math.sin(eased * Math.PI);
  const value = base + (peak - base) * wave;

  if (mode === 'perfectsync') {
    try { vrm.expressionManager.setValue('MouthSmileLeft',  value); } catch (_) { /* ok */ }
    try { vrm.expressionManager.setValue('MouthSmileRight', value); } catch (_) { /* ok */ }
    // Cheek squint lebih minimal dan hanya saat peak
    const cheekValue = Math.max(0, (value - base) * 0.25);
    try { vrm.expressionManager.setValue('CheekSquintLeft',  cheekValue); } catch (_) { /* ok */ }
    try { vrm.expressionManager.setValue('CheekSquintRight', cheekValue); } catch (_) { /* ok */ }
    // Tambah sedikit brow raise untuk ekspresi lebih hidup
    const browValue = Math.max(0, (value - base) * 0.15);
    try { vrm.expressionManager.setValue('BrowOuterUpLeft',  browValue); } catch (_) { /* ok */ }
    try { vrm.expressionManager.setValue('BrowOuterUpRight', browValue); } catch (_) { /* ok */ }
  } else {
    vrm.expressionManager.setValue('happy', value);
  }
}

// ============================================
// 7. BONE UTILITY
// ============================================

export function getClipDrivenBones(clip: { tracks: { name: string }[] }): Set<string> {
  const out = new Set<string>();
  const map: Record<string, string> = {
    'C_Hips': 'hips', 'C_Spine': 'spine', 'C_Chest': 'chest',
    'C_UpperChest': 'upperChest', 'C_Neck': 'neck', 'C_Head': 'head',
    'L_Shoulder': 'leftShoulder', 'R_Shoulder': 'rightShoulder',
    'L_UpperArm': 'leftUpperArm', 'R_UpperArm': 'rightUpperArm',
    'L_LowerArm': 'leftLowerArm', 'R_LowerArm': 'rightLowerArm',
    'L_Hand': 'leftHand', 'R_Hand': 'rightHand',
    'L_UpperLeg': 'leftUpperLeg', 'R_UpperLeg': 'rightUpperLeg',
    'L_LowerLeg': 'leftLowerLeg', 'R_LowerLeg': 'rightLowerLeg',
    'L_Foot': 'leftFoot', 'R_Foot': 'rightFoot',
  };
  for (const track of clip.tracks) {
    const m = track.name.match(/J_Bip_([A-Z]_[A-Za-z]+)/);
    if (m && map[m[1]]) out.add(map[m[1]]);
  }
  return out;
}
