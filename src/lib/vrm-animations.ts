import gsap from 'gsap';
import type { VRM } from '@pixiv/three-vrm';
import type { MoodName } from './sentiment';

// ============================================
// 1. AUTO RANDOM BLINKING
// ============================================

let blinkTimer = 0;
let nextBlinkIn = randomBlinkInterval();
let isBlinking = false;

function randomBlinkInterval(): number {
  return 1 + Math.random() * 4;
}

export function updateBlink(delta: number, vrm: VRM): void {
  if (isBlinking) return;
  blinkTimer += delta;
  if (blinkTimer >= nextBlinkIn) {
    blinkTimer = 0;
    nextBlinkIn = randomBlinkInterval();
    triggerBlink(vrm);
  }
}

function triggerBlink(vrm: VRM): void {
  if (!vrm.expressionManager) return;
  isBlinking = true;
  const target = { value: 0 };
  gsap.to(target, {
    value: 1,
    duration: 0.15,
    ease: 'power2.in',
    onUpdate: () => vrm.expressionManager?.setValue('blink', target.value),
    onComplete: () => {
      gsap.to(target, {
        value: 0,
        duration: 0.10,
        ease: 'power2.out',
        onUpdate: () => vrm.expressionManager?.setValue('blink', target.value),
        onComplete: () => { isBlinking = false; },
      });
    },
  });
}

// ============================================
// 2. MOOD SYSTEM (face-only blendshape blending)
// ============================================

interface MoodWeights {
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

const ZERO: MoodWeights = {
  happy: 0, sad: 0, relaxed: 0, surprised: 0, angry: 0,
  blinkLeft: 0, blinkRight: 0,
  browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
  aa: 0,
};

const MOOD_PRESETS: Record<MoodName, MoodWeights> = {
  neutral:     { ...ZERO, happy: 0.10, relaxed: 0.10, browInnerUp: 0.04 },
  happy:       { ...ZERO, happy: 0.55, relaxed: 0.25, blinkLeft: 0.20, blinkRight: 0.20, browInnerUp: 0.08 },
  sad:         { ...ZERO, sad: 0.55, relaxed: 0.10, browInnerUp: 0.45 },
  excited:     { ...ZERO, happy: 0.70, surprised: 0.30, browInnerUp: 0.30, aa: 0.15 },
  sympathetic: { ...ZERO, sad: 0.20, relaxed: 0.30, browInnerUp: 0.50 },
  bored:       { ...ZERO, relaxed: 0.20, blinkLeft: 0.30, blinkRight: 0.30, browDownLeft: 0.15, browDownRight: 0.15 },
  curious:     { ...ZERO, surprised: 0.20, browInnerUp: 0.45, aa: 0.10 },
  thinking:    { ...ZERO, browDownLeft: 0.30, browDownRight: 0.20, browInnerUp: 0.10 },
  angry:       { ...ZERO, angry: 0.50, browDownLeft: 0.55, browDownRight: 0.55 },
};

let _currentMood: MoodWeights = { ...MOOD_PRESETS.neutral };
let _targetMood: MoodWeights = { ...MOOD_PRESETS.neutral };
let _activeMoodName: MoodName = 'neutral';

const MOOD_LERP_SPEED = 1.2;

export function setTargetMood(mood: MoodName): void {
  if (mood === _activeMoodName) return;
  _activeMoodName = mood;
  _targetMood = { ...MOOD_PRESETS[mood] };
}

export function getActiveMood(): MoodName {
  return _activeMoodName;
}

// Idle mood rotation (when not externally driven)
const IDLE_MOOD_POOL: { mood: MoodName; weight: number }[] = [
  { mood: 'neutral', weight: 4 },
  { mood: 'happy',   weight: 3 },
  { mood: 'curious', weight: 2 },
  { mood: 'thinking', weight: 1.5 },
  { mood: 'bored',   weight: 1 },
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

function lerpMood(delta: number): void {
  const t = Math.min(MOOD_LERP_SPEED * delta, 1);
  const keys: (keyof MoodWeights)[] = [
    'happy','sad','relaxed','surprised','angry',
    'blinkLeft','blinkRight','browInnerUp','browDownLeft','browDownRight',
    'aa',
  ];
  for (const k of keys) {
    _currentMood[k] += (_targetMood[k] - _currentMood[k]) * t;
  }
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

  lerpMood(delta);

  const noise = Math.sin(elapsed * 3.7) * 0.012;

  vrm.expressionManager.setValue('happy',         Math.max(0, _currentMood.happy + noise));
  vrm.expressionManager.setValue('sad',           Math.max(0, _currentMood.sad));
  vrm.expressionManager.setValue('relaxed',       Math.max(0, _currentMood.relaxed));
  vrm.expressionManager.setValue('surprised',     Math.max(0, _currentMood.surprised));
  vrm.expressionManager.setValue('angry',         Math.max(0, _currentMood.angry));
  vrm.expressionManager.setValue('blinkLeft',     Math.max(0, _currentMood.blinkLeft));
  vrm.expressionManager.setValue('blinkRight',    Math.max(0, _currentMood.blinkRight));
  vrm.expressionManager.setValue('browInnerUp',   Math.max(0, _currentMood.browInnerUp + Math.abs(noise) * 0.5));
  vrm.expressionManager.setValue('browDownLeft',  Math.max(0, _currentMood.browDownLeft));
  vrm.expressionManager.setValue('browDownRight', Math.max(0, _currentMood.browDownRight));
}

// ============================================
// 3. LIP SYNC
// ============================================

let _smoothedMouth = 0;
let _currentShape = 0;
const MOUTH_SHAPES = ['aa', 'ih', 'ou'] as const;
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
    _currentShape = (_currentShape + 1) % MOUTH_SHAPES.length;
  }

  for (const shape of MOUTH_SHAPES) vrm.expressionManager.setValue(shape, 0);

  const primary = MOUTH_SHAPES[_currentShape];
  const secondary = MOUTH_SHAPES[(_currentShape + 1) % MOUTH_SHAPES.length];
  const blend = _shapeTimer / SHAPE_DURATION;

  vrm.expressionManager.setValue(primary, mouthValue * (1 - blend * 0.4));
  vrm.expressionManager.setValue(secondary, mouthValue * blend * 0.4);
}

export function resetMouthExpressions(vrm: VRM): void {
  if (!vrm.expressionManager) return;
  ['aa','ih','ou','ee','oh'].forEach(s => vrm.expressionManager?.setValue(s, 0));
  _smoothedMouth = 0;
  _shapeTimer = 0;
}

// ============================================
// 4. IDLE MICRO BODY GESTURES (chest-up only)
// ============================================
// Subtle breathing + sway applied to spine/chest/upperChest only.
// Hips and lower body stay completely still. Designed to layer on top of
// an idle VRMA that only animates head/neck.

/**
 * Apply procedural micro-gestures to the upper torso so the avatar feels
 * alive even when the VRMA only moves the head. Call AFTER mixer.update()
 * and BEFORE vrm.update() in the animate loop.
 *
 * @param drivenBones Set of normalized bone names that the active VRMA clip
 *   already animates. Those bones will be SKIPPED so we don't double-add
 *   rotations on top of the clip (which causes the avatar to fall backward).
 */
export function updateIdleMicroGestures(
  elapsed: number,
  vrm: VRM,
  drivenBones?: Set<string>,
): void {
  if (!vrm.humanoid) return;

  const isDriven = (name: string) => !!drivenBones?.has(name);

  const spine = vrm.humanoid.getNormalizedBoneNode('spine');
  const chest = vrm.humanoid.getNormalizedBoneNode('chest');
  const upperChest = vrm.humanoid.getNormalizedBoneNode('upperChest');
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const neck = vrm.humanoid.getNormalizedBoneNode('neck');

  // Ultra-subtle sway — nyaris tidak terlihat.
  if (spine && !isDriven('spine')) {
    spine.rotation.z += Math.sin(elapsed * 0.35) * 0.0002;
  }

  // Breathing halus di dada.
  const breathX = Math.sin(elapsed * 0.7) * 0.0013;
  const breathUpperX = Math.sin(elapsed * 0.7 + 0.3) * 0.0007;

  if (chest && !isDriven('chest')) {
    chest.rotation.x += breathX;
  }

  if (upperChest && !isDriven('upperChest')) {
    upperChest.rotation.x += breathUpperX;
  }

  // Head and neck stay still — counter-rotate to cancel inherited chest breath.
  // Only cancel X (up-down from breathing) and Z; preserve Y so left-right works.
  const totalBreathX = breathX + breathUpperX;

  if (neck && !isDriven('neck')) {
    neck.rotation.x -= totalBreathX * 0.5;
    neck.rotation.z = 0;
  }

  if (head && !isDriven('head')) {
    head.rotation.x -= totalBreathX * 0.5;
    head.rotation.z = 0;
  }
}

// ============================================
// 5. IDLE SMILE PULSE (mouth blendshape)
// ============================================
// Pulsing antara senyum rapat (default) → senyum lebar → balik ke rapat.
// Gunakan blendshape 'happy' sebagai senyum lebar; mulut tetap tertutup
// (tidak menyentuh aa/ih/ou supaya tidak konflik dengan lip sync).

let _smileTimer = 0;
let _nextSmileIn = 6 + Math.random() * 5;
let _smileActive = false;
let _smilePhase = 0; // 0..1 progress dalam satu pulse cycle

const SMILE_DURATION = 2.2;   // total durasi 1 pulse (in + hold + out)
const SMILE_PEAK = 0.55;      // intensitas senyum lebar (0..1 pada blendshape happy)
const SMILE_BASE = 0.12;      // senyum rapat baseline (mulut tetap tertutup)

export function updateIdleSmile(delta: number, vrm: VRM, suppressed = false): void {
  if (!vrm.expressionManager) return;

  // Saat bicara/preview aktif, jangan apply (biar mood/lip-sync ambil alih).
  if (suppressed) {
    _smileActive = false;
    _smileTimer = 0;
    _smilePhase = 0;
    return;
  }

  if (!_smileActive) {
    _smileTimer += delta;
    if (_smileTimer >= _nextSmileIn) {
      _smileTimer = 0;
      _smileActive = true;
      _smilePhase = 0;
    }
    // Tetap apply baseline senyum rapat
    vrm.expressionManager.setValue('happy', SMILE_BASE);
    return;
  }

  _smilePhase += delta / SMILE_DURATION;
  if (_smilePhase >= 1) {
    _smileActive = false;
    _smilePhase = 0;
    _nextSmileIn = 5 + Math.random() * 6;
    vrm.expressionManager.setValue('happy', SMILE_BASE);
    return;
  }

  // Easing: ease-in-out sine antara BASE → PEAK → BASE
  const wave = Math.sin(_smilePhase * Math.PI); // 0 → 1 → 0
  const value = SMILE_BASE + (SMILE_PEAK - SMILE_BASE) * wave;
  vrm.expressionManager.setValue('happy', value);
}

/**
 * Inspect an AnimationClip and return the set of normalized humanoid bone
 * names it animates. Track names from VRMA loader look like
 * "Normalized_J_Bip_C_Spine.quaternion" — we map them back to humanoid names
 * like "spine", "chest", "upperChest", "hips", etc.
 */
export function getClipDrivenBones(clip: { tracks: { name: string }[] }): Set<string> {
  const out = new Set<string>();
  // Map J_Bip naming → VRM humanoid bone names
  const map: Record<string, string> = {
    'C_Hips': 'hips',
    'C_Spine': 'spine',
    'C_Chest': 'chest',
    'C_UpperChest': 'upperChest',
    'C_Neck': 'neck',
    'C_Head': 'head',
    'L_Shoulder': 'leftShoulder',
    'R_Shoulder': 'rightShoulder',
    'L_UpperArm': 'leftUpperArm',
    'R_UpperArm': 'rightUpperArm',
    'L_LowerArm': 'leftLowerArm',
    'R_LowerArm': 'rightLowerArm',
    'L_Hand': 'leftHand',
    'R_Hand': 'rightHand',
    'L_UpperLeg': 'leftUpperLeg',
    'R_UpperLeg': 'rightUpperLeg',
    'L_LowerLeg': 'leftLowerLeg',
    'R_LowerLeg': 'rightLowerLeg',
    'L_Foot': 'leftFoot',
    'R_Foot': 'rightFoot',
  };
  for (const track of clip.tracks) {
    // e.g. "Normalized_J_Bip_C_Spine.quaternion"
    const m = track.name.match(/J_Bip_([A-Z]_[A-Za-z]+)/);
    if (m && map[m[1]]) {
      out.add(map[m[1]]);
    }
  }
  return out;
}
