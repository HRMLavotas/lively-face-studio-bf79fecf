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
// 2. MOOD SYSTEM (continuous blending)
// ============================================

interface MoodWeights {
  happy: number;
  sad: number;
  relaxed: number;
  surprised: number;
  angry: number;
  blinkLeft: number;  // half-squint
  blinkRight: number;
  browInnerUp: number;
  browDownLeft: number;
  browDownRight: number;
  aa: number;          // slight mouth open
  headTiltZ: number;   // -1..1 bias for head tilt
  headPitchX: number;  // -1..1 bias for nod up/down
}

const ZERO: MoodWeights = {
  happy: 0, sad: 0, relaxed: 0, surprised: 0, angry: 0,
  blinkLeft: 0, blinkRight: 0,
  browInnerUp: 0, browDownLeft: 0, browDownRight: 0,
  aa: 0, headTiltZ: 0, headPitchX: 0,
};

const MOOD_PRESETS: Record<MoodName, MoodWeights> = {
  neutral:     { ...ZERO, happy: 0.10, relaxed: 0.10, browInnerUp: 0.04 },
  happy:       { ...ZERO, happy: 0.55, relaxed: 0.25, blinkLeft: 0.20, blinkRight: 0.20, browInnerUp: 0.08, headTiltZ: 0.15 },
  sad:         { ...ZERO, sad: 0.55, relaxed: 0.10, browInnerUp: 0.45, headPitchX: 0.30, headTiltZ: -0.10 },
  excited:     { ...ZERO, happy: 0.70, surprised: 0.30, browInnerUp: 0.30, aa: 0.15, headPitchX: -0.15 },
  sympathetic: { ...ZERO, sad: 0.20, relaxed: 0.30, browInnerUp: 0.50, headTiltZ: 0.25, headPitchX: 0.10 },
  bored:       { ...ZERO, relaxed: 0.20, blinkLeft: 0.30, blinkRight: 0.30, browDownLeft: 0.15, browDownRight: 0.15, headPitchX: 0.20, headTiltZ: -0.20 },
  curious:     { ...ZERO, surprised: 0.20, browInnerUp: 0.45, aa: 0.10, headTiltZ: 0.30 },
  thinking:    { ...ZERO, browDownLeft: 0.30, browDownRight: 0.20, browInnerUp: 0.10, headPitchX: 0.15, headTiltZ: 0.20 },
  angry:       { ...ZERO, angry: 0.50, browDownLeft: 0.55, browDownRight: 0.55, headPitchX: -0.05 },
};

let _currentMood: MoodWeights = { ...MOOD_PRESETS.neutral };
let _targetMood: MoodWeights = { ...MOOD_PRESETS.neutral };
let _activeMoodName: MoodName = 'neutral';

const MOOD_LERP_SPEED = 1.2; // higher = faster blend (units/sec)

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
    'aa','headTiltZ','headPitchX',
  ];
  for (const k of keys) {
    _currentMood[k] += (_targetMood[k] - _currentMood[k]) * t;
  }
}

export function updateMicroExpressions(elapsed: number, vrm: VRM, delta = 0.016): void {
  if (!vrm.expressionManager) return;

  // Idle mood rotation
  if (_idleEnabled) {
    _idleMoodTimer += delta;
    if (_idleMoodTimer >= _nextIdleMoodIn) {
      _idleMoodTimer = 0;
      _nextIdleMoodIn = 4 + Math.random() * 4;
      setTargetMood(pickIdleMood());
    }
  }

  lerpMood(delta);

  // Subtle organic noise
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

// Expose mood-driven head bias for idle animation to apply
function getMoodHeadBias(): { tiltZ: number; pitchX: number } {
  return { tiltZ: _currentMood.headTiltZ, pitchX: _currentMood.headPitchX };
}

// ============================================
// 3. LIP SYNC
// ============================================

let _smoothedMouth = 0;
let _currentShape = 0;
const MOUTH_SHAPES = ['aa', 'ih', 'ou'] as const;
let _shapeTimer = 0;
const SHAPE_DURATION = 0.12;

// Track audio peak for nod / gesture beats
let _lastAudioLevel = 0;
let _peakCooldown = 0;

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

  _lastAudioLevel = audioLevel;
}

export function resetMouthExpressions(vrm: VRM): void {
  if (!vrm.expressionManager) return;
  ['aa','ih','ou','ee','oh'].forEach(s => vrm.expressionManager?.setValue(s, 0));
  _smoothedMouth = 0;
  _shapeTimer = 0;
}

// ============================================
// 4. SPEAKING GESTURES (hands + head emphasis)
// ============================================

// --- Gesture Catalogue ---
// Each gesture defines target bone rotations for a natural hand motion.
// Values are DELTA from rest pose. Duration in seconds.
type GestureTarget = {
  upperArmX?: number; upperArmZ?: number; upperArmY?: number;
  lowerArmY?: number; lowerArmX?: number;
  handZ?: number; handX?: number;
  // finger curl 0=open 1=closed, spread = X spread on proximal
  thumbCurl?: number;
  indexCurl?: number; middleCurl?: number; ringCurl?: number; pinkyCurl?: number;
  indexSpread?: number; middleSpread?: number; ringSpread?: number; pinkySpread?: number;
};
type GestureKeyframe = { t: number; L: GestureTarget; R: GestureTarget };
type GestureDef = { name: string; duration: number; keys: GestureKeyframe[] };

// Helper: lerp between two GestureTargets
function lerpGTarget(a: GestureTarget, b: GestureTarget, t: number): GestureTarget {
  const lerp = (av: number | undefined, bv: number | undefined) =>
    (av ?? 0) + (((bv ?? 0) - (av ?? 0)) * t);
  return {
    upperArmX:    lerp(a.upperArmX,    b.upperArmX),
    upperArmZ:    lerp(a.upperArmZ,    b.upperArmZ),
    upperArmY:    lerp(a.upperArmY,    b.upperArmY),
    lowerArmY:    lerp(a.lowerArmY,    b.lowerArmY),
    lowerArmX:    lerp(a.lowerArmX,    b.lowerArmX),
    handZ:        lerp(a.handZ,        b.handZ),
    handX:        lerp(a.handX,        b.handX),
    thumbCurl:    lerp(a.thumbCurl,    b.thumbCurl),
    indexCurl:    lerp(a.indexCurl,    b.indexCurl),
    middleCurl:   lerp(a.middleCurl,   b.middleCurl),
    ringCurl:     lerp(a.ringCurl,     b.ringCurl),
    pinkyCurl:    lerp(a.pinkyCurl,    b.pinkyCurl),
    indexSpread:  lerp(a.indexSpread,  b.indexSpread),
    middleSpread: lerp(a.middleSpread, b.middleSpread),
    ringSpread:   lerp(a.ringSpread,   b.ringSpread),
    pinkySpread:  lerp(a.pinkySpread,  b.pinkySpread),
  };
}

// Smooth ease: 0->1->0 shaped curve
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// --- Hand Shape Presets ---
// curl: 0=straight/open, 1=fully curled; spread: X axis spread between fingers
// handZ: wrist flex (+= palm faces viewer more); handX: wrist side tilt

const OPEN_HAND: GestureTarget = {
  thumbCurl: 0.05, indexCurl: 0.05, middleCurl: 0.05, ringCurl: 0.08, pinkyCurl: 0.10,
  indexSpread: 0.06, middleSpread: 0.02, ringSpread: -0.02, pinkySpread: -0.05,
};
const RELAXED_HAND: GestureTarget = {
  thumbCurl: 0.15, indexCurl: 0.20, middleCurl: 0.25, ringCurl: 0.30, pinkyCurl: 0.32,
  indexSpread: 0.04, middleSpread: 0.01, ringSpread: -0.01, pinkySpread: -0.04,
};
const LOOSE_FIST: GestureTarget = {
  thumbCurl: 0.45, indexCurl: 0.65, middleCurl: 0.70, ringCurl: 0.72, pinkyCurl: 0.75,
};
const POINT_HAND: GestureTarget = {
  thumbCurl: 0.50, indexCurl: 0.05, middleCurl: 0.70, ringCurl: 0.72, pinkyCurl: 0.74,
  indexSpread: 0.0,
};
const PALM_UP: GestureTarget = { ...OPEN_HAND, handZ: -0.28 };
const PALM_UP_RELAXED: GestureTarget = { ...RELAXED_HAND, handZ: -0.22 };

const GESTURE_CATALOGUE: GestureDef[] = [
  // 1. "Open palms out" - both hands spread forward, fingers open
  {
    name: 'open_palms',
    duration: 2.2,
    keys: [
      { t: 0,   L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.3, L: { upperArmX: 0.45, upperArmZ: -0.18, lowerArmY: -0.50, lowerArmX: 0.12, handZ: 0.18, ...OPEN_HAND },
                R: { upperArmX: 0.45, upperArmZ:  0.18, lowerArmY:  0.50, lowerArmX: 0.12, handZ: 0.18, ...OPEN_HAND } },
      { t: 0.7, L: { upperArmX: 0.40, upperArmZ: -0.22, lowerArmY: -0.45, lowerArmX: 0.08, handZ: 0.15, ...OPEN_HAND },
                R: { upperArmX: 0.40, upperArmZ:  0.22, lowerArmY:  0.45, lowerArmX: 0.08, handZ: 0.15, ...OPEN_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 2. "Right hand emphasis" - right hand lifts open, like making a point
  {
    name: 'right_emphasis',
    duration: 1.8,
    keys: [
      { t: 0,    L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.25, L: { upperArmX: 0.08, ...RELAXED_HAND },
                 R: { upperArmX: 0.55, upperArmZ: 0.15, upperArmY: -0.12, lowerArmY: 0.60, lowerArmX: 0.20, handZ: 0.22, handX: 0.08, ...OPEN_HAND } },
      { t: 0.55, L: { upperArmX: 0.05, ...RELAXED_HAND },
                 R: { upperArmX: 0.48, upperArmZ: 0.10, upperArmY: -0.08, lowerArmY: 0.52, lowerArmX: 0.15, handZ: 0.18, handX: 0.05, ...OPEN_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 3. "Left hand gesture" - mirror of right emphasis
  {
    name: 'left_emphasis',
    duration: 1.8,
    keys: [
      { t: 0,    L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.25, L: { upperArmX: 0.55, upperArmZ: -0.15, upperArmY: 0.12, lowerArmY: -0.60, lowerArmX: 0.20, handZ: 0.22, handX: -0.08, ...OPEN_HAND },
                 R: { upperArmX: 0.08, ...RELAXED_HAND } },
      { t: 0.55, L: { upperArmX: 0.48, upperArmZ: -0.10, upperArmY: 0.08, lowerArmY: -0.52, lowerArmX: 0.15, handZ: 0.18, handX: -0.05, ...OPEN_HAND },
                 R: { upperArmX: 0.05, ...RELAXED_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 4. "Counting/listing" - right hand raised, index finger pointing up
  {
    name: 'counting',
    duration: 2.4,
    keys: [
      { t: 0,    L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.2,  L: { upperArmX: 0.12, upperArmZ: -0.05, ...RELAXED_HAND },
                 R: { upperArmX: 0.62, upperArmZ: 0.08, upperArmY: -0.15, lowerArmY: 0.75, lowerArmX: 0.25, handZ: -0.10, ...POINT_HAND } },
      { t: 0.5,  L: { upperArmX: 0.15, upperArmZ: -0.08, ...RELAXED_HAND },
                 R: { upperArmX: 0.58, upperArmZ: 0.12, upperArmY: -0.12, lowerArmY: 0.72, lowerArmX: 0.22, handZ: -0.08, ...POINT_HAND } },
      { t: 0.75, L: { upperArmX: 0.10, ...RELAXED_HAND },
                 R: { upperArmX: 0.65, upperArmZ: 0.06, upperArmY: -0.18, lowerArmY: 0.80, lowerArmX: 0.28, handZ: -0.12, ...POINT_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 5. "Shrug-hold" - both elbows out, palms up open
  {
    name: 'shrug_hold',
    duration: 2.6,
    keys: [
      { t: 0,   L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.3, L: { upperArmX: 0.30, upperArmZ: -0.28, upperArmY: 0.10, lowerArmY: -0.38, lowerArmX: 0.10, ...PALM_UP },
                R: { upperArmX: 0.30, upperArmZ:  0.28, upperArmY:-0.10, lowerArmY:  0.38, lowerArmX: 0.10, ...PALM_UP } },
      { t: 0.6, L: { upperArmX: 0.28, upperArmZ: -0.25, upperArmY: 0.08, lowerArmY: -0.35, lowerArmX: 0.08, ...PALM_UP_RELAXED },
                R: { upperArmX: 0.28, upperArmZ:  0.25, upperArmY:-0.08, lowerArmY:  0.35, lowerArmX: 0.08, ...PALM_UP_RELAXED } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 6. "Side sweep" - hand sweeps out to side, fingers open
  {
    name: 'side_sweep_right',
    duration: 2.0,
    keys: [
      { t: 0,   L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.3, L: { upperArmX: 0.06, ...RELAXED_HAND },
                R: { upperArmX: 0.35, upperArmZ: 0.35, upperArmY: -0.20, lowerArmY: 0.30, lowerArmX: 0.05, handZ: 0.20, handX: -0.10, ...OPEN_HAND } },
      { t: 0.6, L: { upperArmX: 0.04, ...RELAXED_HAND },
                R: { upperArmX: 0.25, upperArmZ: 0.42, upperArmY: -0.18, lowerArmY: 0.20, lowerArmX: 0.03, handZ: 0.16, handX: -0.08, ...OPEN_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 7. "Forward reach" - both arms extend forward, fingers spread open
  {
    name: 'forward_reach',
    duration: 2.0,
    keys: [
      { t: 0,    L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.35, L: { upperArmX: 0.55, upperArmZ: -0.12, lowerArmY: -0.42, lowerArmX: 0.18, handZ: 0.25, ...OPEN_HAND },
                 R: { upperArmX: 0.55, upperArmZ:  0.12, lowerArmY:  0.42, lowerArmX: 0.18, handZ: 0.25, ...OPEN_HAND } },
      { t: 0.65, L: { upperArmX: 0.50, upperArmZ: -0.10, lowerArmY: -0.38, lowerArmX: 0.15, handZ: 0.20, ...OPEN_HAND },
                 R: { upperArmX: 0.50, upperArmZ:  0.10, lowerArmY:  0.38, lowerArmX: 0.15, handZ: 0.20, ...OPEN_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
  // 8. "Alternating beat" - hands alternate, loose fist for rhythm beats
  {
    name: 'alternating_beat',
    duration: 2.8,
    keys: [
      { t: 0,    L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
      { t: 0.2,  L: { upperArmX: 0.38, upperArmZ: -0.10, lowerArmY: -0.45, handZ: 0.15, ...LOOSE_FIST },
                 R: { upperArmX: 0.10, upperArmZ:  0.06, ...RELAXED_HAND } },
      { t: 0.45, L: { upperArmX: 0.12, upperArmZ: -0.06, ...RELAXED_HAND },
                 R: { upperArmX: 0.40, upperArmZ:  0.10, lowerArmY:  0.45, handZ: 0.15, ...LOOSE_FIST } },
      { t: 0.7,  L: { upperArmX: 0.35, upperArmZ: -0.08, lowerArmY: -0.40, handZ: 0.12, ...LOOSE_FIST },
                 R: { upperArmX: 0.08, upperArmZ:  0.05, ...RELAXED_HAND } },
      { t: 1.0, L: { ...RELAXED_HAND }, R: { ...RELAXED_HAND } },
    ],
  },
];

// Weighted random gesture pick (some gestures appear more)
const GESTURE_WEIGHTS: number[] = [1.5, 2.0, 1.5, 1.5, 1.0, 1.2, 1.5, 2.0];

function pickGesture(): GestureDef {
  const total = GESTURE_WEIGHTS.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < GESTURE_CATALOGUE.length; i++) {
    if ((r -= GESTURE_WEIGHTS[i]) <= 0) return GESTURE_CATALOGUE[i];
  }
  return GESTURE_CATALOGUE[0];
}

// Active gesture state
interface ActiveGesture {
  def: GestureDef;
  elapsed: number; // seconds since gesture started
}

let _gestureIntensity = 0;
let _activeGesture: ActiveGesture | null = null;
let _gestureTimer = 0;
let _nextGestureIn = 1.5 + Math.random() * 2.0;

// Smoothed arm targets (interpolated toward gesture deltas)
interface ArmSmooth {
  upperArmX: number; upperArmZ: number; upperArmY: number;
  lowerArmY: number; lowerArmX: number;
  handZ: number; handX: number; // wrist flex/deviation
  // Finger curl: 0=straight, 1=fully curled
  thumbCurl: number;
  indexCurl: number;
  middleCurl: number;
  ringCurl: number;
  pinkyCurl: number;
  // Finger spread (X axis on proximal = spread apart)
  indexSpread: number;
  middleSpread: number;
  ringSpread: number;
  pinkySpread: number;
}

function makeArmSmooth(): ArmSmooth {
  // Default resting state: relaxed hand (slight natural curl, not flat/stiff)
  return {
    upperArmX: 0, upperArmZ: 0, upperArmY: 0, lowerArmY: 0, lowerArmX: 0,
    handZ: 0, handX: 0,
    thumbCurl: 0.15, indexCurl: 0.20, middleCurl: 0.25, ringCurl: 0.30, pinkyCurl: 0.32,
    indexSpread: 0.04, middleSpread: 0.01, ringSpread: -0.01, pinkySpread: -0.04,
  };
}

const _armL: ArmSmooth = makeArmSmooth();
const _armR: ArmSmooth = makeArmSmooth();
const _armLTarget: ArmSmooth = makeArmSmooth();
const _armRTarget: ArmSmooth = makeArmSmooth();

let _headNodOffset = 0;
let _headNodTarget = 0;

function evaluateGestureAtTime(def: GestureDef, elapsed: number): { L: GestureTarget; R: GestureTarget } {
  const t = Math.min(elapsed / def.duration, 1); // 0..1 normalized
  const keys = def.keys;

  // Find bracketing keyframes
  let kA = keys[0], kB = keys[1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      kA = keys[i];
      kB = keys[i + 1];
      break;
    }
  }
  const span = kB.t - kA.t;
  const localT = span > 0 ? easeInOut((t - kA.t) / span) : 1;
  return {
    L: lerpGTarget(kA.L, kB.L, localT),
    R: lerpGTarget(kA.R, kB.R, localT),
  };
}

export function updateSpeakingGestures(
  audioLevel: number,
  isSpeaking: boolean,
  vrm: VRM,
  delta = 0.016,
): void {
  if (!vrm.humanoid) return;

  const target = isSpeaking ? 1 : 0;
  _gestureIntensity += (target - _gestureIntensity) * Math.min(1.5 * delta, 1);

  // Head nod on audio peaks
  _headNodOffset += (_headNodTarget - _headNodOffset) * Math.min(6 * delta, 1);
  _headNodTarget *= Math.max(0, 1 - 4 * delta);

  if (isSpeaking) {
    _peakCooldown -= delta;
    if (_peakCooldown <= 0 && audioLevel > 0.35 && audioLevel > _lastAudioLevel + 0.08) {
      _headNodTarget = -0.06;
      _peakCooldown = 1.2 + Math.random() * 0.8;
    }

    // Trigger next gesture
    _gestureTimer += delta;
    if (!_activeGesture && _gestureTimer >= _nextGestureIn) {
      _activeGesture = { def: pickGesture(), elapsed: 0 };
      _gestureTimer = 0;
      _nextGestureIn = 1.8 + Math.random() * 2.5;
    }
  } else {
    // Fade out — let current gesture finish but don't start new ones
    _gestureTimer = 0;
  }

  // Advance active gesture
  if (_activeGesture) {
    _activeGesture.elapsed += delta;
    if (_activeGesture.elapsed >= _activeGesture.def.duration) {
      _activeGesture = null;
    }
  }

  // Evaluate current gesture frame
  const gFrame = _activeGesture
    ? evaluateGestureAtTime(_activeGesture.def, _activeGesture.elapsed)
    : { L: {} as GestureTarget, R: {} as GestureTarget };

  const scale = _gestureIntensity; // scale gesture amplitude by speaking intensity

  _armLTarget.upperArmX   = (gFrame.L.upperArmX   ?? 0) * scale;
  _armLTarget.upperArmZ   = (gFrame.L.upperArmZ   ?? 0) * scale;
  _armLTarget.upperArmY   = (gFrame.L.upperArmY   ?? 0) * scale;
  _armLTarget.lowerArmY   = (gFrame.L.lowerArmY   ?? 0) * scale;
  _armLTarget.lowerArmX   = (gFrame.L.lowerArmX   ?? 0) * scale;
  _armLTarget.handZ       = (gFrame.L.handZ       ?? 0) * scale;
  _armLTarget.handX       = (gFrame.L.handX       ?? 0) * scale;
  // Finger targets: fallback to natural relaxed pose (not 0 = stiff board)
  _armLTarget.thumbCurl   = gFrame.L.thumbCurl   ?? 0.15;
  _armLTarget.indexCurl   = gFrame.L.indexCurl   ?? 0.20;
  _armLTarget.middleCurl  = gFrame.L.middleCurl  ?? 0.25;
  _armLTarget.ringCurl    = gFrame.L.ringCurl    ?? 0.30;
  _armLTarget.pinkyCurl   = gFrame.L.pinkyCurl   ?? 0.32;
  _armLTarget.indexSpread  = gFrame.L.indexSpread  ?? 0.04;
  _armLTarget.middleSpread = gFrame.L.middleSpread ?? 0.01;
  _armLTarget.ringSpread   = gFrame.L.ringSpread   ?? -0.01;
  _armLTarget.pinkySpread  = gFrame.L.pinkySpread  ?? -0.04;

  _armRTarget.upperArmX   = (gFrame.R.upperArmX   ?? 0) * scale;
  _armRTarget.upperArmZ   = (gFrame.R.upperArmZ   ?? 0) * scale;
  _armRTarget.upperArmY   = (gFrame.R.upperArmY   ?? 0) * scale;
  _armRTarget.lowerArmY   = (gFrame.R.lowerArmY   ?? 0) * scale;
  _armRTarget.lowerArmX   = (gFrame.R.lowerArmX   ?? 0) * scale;
  _armRTarget.handZ       = (gFrame.R.handZ       ?? 0) * scale;
  _armRTarget.handX       = (gFrame.R.handX       ?? 0) * scale;
  _armRTarget.thumbCurl   = gFrame.R.thumbCurl   ?? 0.15;
  _armRTarget.indexCurl   = gFrame.R.indexCurl   ?? 0.20;
  _armRTarget.middleCurl  = gFrame.R.middleCurl  ?? 0.25;
  _armRTarget.ringCurl    = gFrame.R.ringCurl    ?? 0.30;
  _armRTarget.pinkyCurl   = gFrame.R.pinkyCurl   ?? 0.32;
  _armRTarget.indexSpread  = gFrame.R.indexSpread  ?? 0.04;
  _armRTarget.middleSpread = gFrame.R.middleSpread ?? 0.01;
  _armRTarget.ringSpread   = gFrame.R.ringSpread   ?? -0.01;
  _armRTarget.pinkySpread  = gFrame.R.pinkySpread  ?? -0.04;

  // Smooth arm state toward targets
  const armLerp = Math.min(4.5 * delta, 1);
  for (const k of Object.keys(_armL) as (keyof ArmSmooth)[]) {
    _armL[k] += (_armLTarget[k] - _armL[k]) * armLerp;
    _armR[k] += (_armRTarget[k] - _armR[k]) * armLerp;
  }
}

export function getGestureState() {
  return {
    intensity: _gestureIntensity,
    headNodOffset: _headNodOffset,
    armL: { ..._armL },
    armR: { ..._armR },
    // Legacy beat fields kept for compatibility
    beat: 0,
    beatSide: 'right' as const,
  };
}

// ============================================
// 5. IDLE FIDGETS (random small movements)
// ============================================

let _fidgetTimer = 0;
let _nextFidgetIn = 8 + Math.random() * 7;
let _fidgetHeadOffsetY = 0;
let _fidgetHeadOffsetTarget = 0;
let _fidgetShoulderOffset = 0;
let _fidgetShoulderTarget = 0;

export function updateIdleFidgets(delta: number, isSpeaking: boolean): void {
  // Decay fidget toward target, target decays toward 0
  _fidgetHeadOffsetY += (_fidgetHeadOffsetTarget - _fidgetHeadOffsetY) * Math.min(2.5 * delta, 1);
  _fidgetHeadOffsetTarget *= Math.max(0, 1 - 1.5 * delta);
  _fidgetShoulderOffset += (_fidgetShoulderTarget - _fidgetShoulderOffset) * Math.min(2 * delta, 1);
  _fidgetShoulderTarget *= Math.max(0, 1 - 1.2 * delta);

  if (isSpeaking) return; // pause fidgets during speech (gestures take over)

  _fidgetTimer += delta;
  if (_fidgetTimer >= _nextFidgetIn) {
    _fidgetTimer = 0;
    _nextFidgetIn = 8 + Math.random() * 7;
    const choice = Math.floor(Math.random() * 3);
    if (choice === 0) {
      _fidgetHeadOffsetTarget = (Math.random() - 0.5) * 0.18; // small head turn
    } else if (choice === 1) {
      _fidgetShoulderTarget = 0.06 + Math.random() * 0.04; // shoulder roll
    } else {
      _fidgetHeadOffsetTarget = (Math.random() - 0.5) * 0.10; // small dart
    }
  }
}

// ============================================
// 6. IDLE BODY ANIMATION
// ============================================

export function updateIdleAnimation(elapsed: number, vrm: VRM, isSpeaking = false): void {
  if (!vrm.humanoid) return;

  // Breathing — engages 30% more when speaking
  const breathBoost = 1 + _gestureIntensity * 0.3;
  const breathCycle = Math.sin(elapsed * 1.4);
  const breathX = breathCycle * 0.025 * breathBoost;

  const spineBone = vrm.humanoid.getNormalizedBoneNode('spine');
  if (spineBone) {
    spineBone.rotation.x = breathX;
    spineBone.rotation.z = Math.sin(elapsed * 0.4) * 0.018;
  }

  const upperChest = vrm.humanoid.getNormalizedBoneNode('upperChest');
  if (upperChest) upperChest.rotation.x = breathX * 0.6;

  const chest = vrm.humanoid.getNormalizedBoneNode('chest');
  if (chest) chest.rotation.x = breathX * 0.4;

  // Hip sway
  const swayCycle = Math.sin(elapsed * 0.5);
  const hipBone = vrm.humanoid.getNormalizedBoneNode('hips');
  if (hipBone) {
    hipBone.rotation.z = swayCycle * 0.022;
    hipBone.rotation.y = Math.sin(elapsed * 0.3) * 0.01;
  }

  // Head — combine baseline drift + mood bias + nod offset + fidget
  const moodBias = getMoodHeadBias();
  const headBone = vrm.humanoid.getNormalizedBoneNode('head');
  if (headBone) {
    headBone.rotation.y = Math.sin(elapsed * 0.35) * 0.12 + _fidgetHeadOffsetY;
    headBone.rotation.x = Math.sin(elapsed * 0.45) * 0.06 + moodBias.pitchX * 0.18 + _headNodOffset;
    headBone.rotation.z = Math.sin(elapsed * 0.28) * 0.03 + moodBias.tiltZ * 0.12;
  }

  // Shoulders — fidget + speaking engagement
  const shoulderLift = _fidgetShoulderOffset + _gestureIntensity * 0.04;
  const leftShoulder = vrm.humanoid.getNormalizedBoneNode('leftShoulder');
  if (leftShoulder) leftShoulder.rotation.z = shoulderLift;
  const rightShoulder = vrm.humanoid.getNormalizedBoneNode('rightShoulder');
  if (rightShoulder) rightShoulder.rotation.z = -shoulderLift;

  // Arms — base posture + natural speaking gesture overlay.
  const gesture = getGestureState();
  const gL = gesture.armL;
  const gR = gesture.armR;

  // Rest pose: arms hanging slightly forward & inward, like a relaxed human.
  const REST_Z = 1.27;
  const REST_X_FWD = 0.05;
  const REST_HUMERUS_Y = 0.10;
  const REST_ELBOW = 0.18;

  // Micro organic noise for liveliness
  const microL = Math.sin(elapsed * 0.55 + 0.3) * 0.012;
  const microR = Math.sin(elapsed * 0.55 + 1.1) * 0.012;

  const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
  if (leftUpperArm) {
    leftUpperArm.rotation.z =  REST_Z - gL.upperArmZ + breathCycle * 0.012 + swayCycle * 0.006;
    leftUpperArm.rotation.x =  REST_X_FWD + gL.upperArmX + microL;
    leftUpperArm.rotation.y =  REST_HUMERUS_Y + gL.upperArmY;
  }

  const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
  if (rightUpperArm) {
    rightUpperArm.rotation.z = -REST_Z + gR.upperArmZ - breathCycle * 0.012 - swayCycle * 0.006;
    rightUpperArm.rotation.x =  REST_X_FWD + gR.upperArmX + microR;
    rightUpperArm.rotation.y = -REST_HUMERUS_Y - gR.upperArmY;
  }

  // Lower arms — elbow bend uses Y axis (Z would twist forearm).
  const elbowBend = _gestureIntensity * 0.15;
  const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
  if (leftLowerArm) {
    leftLowerArm.rotation.z = 0;
    leftLowerArm.rotation.y = -(REST_ELBOW + elbowBend + gL.lowerArmY) + Math.sin(elapsed * 0.45) * 0.010;
    leftLowerArm.rotation.x = gL.lowerArmX;
  }

  const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
  if (rightLowerArm) {
    rightLowerArm.rotation.z = 0;
    rightLowerArm.rotation.y =  REST_ELBOW + elbowBend + gR.lowerArmY + Math.sin(elapsed * 0.45) * 0.010;
    rightLowerArm.rotation.x = gR.lowerArmX;
  }

  // ----------------------------------------
  // Wrists & Fingers
  // ----------------------------------------
  // hand.z = wrist flex (positive = palm faces viewer)
  // hand.x = wrist side deviation
  // Finger proximal bones: x = curl, z = spread (for index/middle/ring/pinky)
  // Thumb: different axis layout — proximalX for abduction, proximalZ for curl
  // MAX_CURL: max rotation in radians for fully curled (1.0) = ~1.4 rad per segment
  const CURL_SCALE = 1.2; // radians at curl=1.0 per joint

  // Helper: apply curl to all 3 joints of a finger
  function setCurl(proximalBone: ReturnType<typeof vrm.humanoid.getNormalizedBoneNode>,
                   intermediateBone: ReturnType<typeof vrm.humanoid.getNormalizedBoneNode>,
                   distalBone: ReturnType<typeof vrm.humanoid.getNormalizedBoneNode>,
                   curl: number, spread: number, axis: 'x' | 'z' = 'x') {
    if (proximalBone) {
      proximalBone.rotation[axis]  = curl * CURL_SCALE * 0.6;
      proximalBone.rotation.z      = axis === 'x' ? spread : proximalBone.rotation.z;
    }
    if (intermediateBone) intermediateBone.rotation[axis] = curl * CURL_SCALE * 0.9;
    if (distalBone)       distalBone.rotation[axis]       = curl * CURL_SCALE * 0.6;
  }

  // Organic idle flutter — very small finger micro-movement
  const fingerFlutterL = Math.sin(elapsed * 1.8 + 0.2) * 0.015;
  const fingerFlutterR = Math.sin(elapsed * 1.8 + 1.5) * 0.015;

  // -- LEFT HAND --
  const leftHand = vrm.humanoid.getNormalizedBoneNode('leftHand');
  if (leftHand) {
    leftHand.rotation.z = gL.handZ + Math.sin(elapsed * 0.6 + 0.4) * 0.008;
    leftHand.rotation.x = gL.handX;
  }

  const lThumbMeta   = vrm.humanoid.getNormalizedBoneNode('leftThumbMetacarpal');
  const lThumbProx   = vrm.humanoid.getNormalizedBoneNode('leftThumbProximal');
  const lThumbDist   = vrm.humanoid.getNormalizedBoneNode('leftThumbDistal');
  if (lThumbMeta) lThumbMeta.rotation.z = -(0.30 + gL.thumbCurl * 0.5);
  if (lThumbProx) lThumbProx.rotation.x = gL.thumbCurl * CURL_SCALE * 0.6;
  if (lThumbDist) lThumbDist.rotation.x = gL.thumbCurl * CURL_SCALE * 0.5;

  setCurl(
    vrm.humanoid.getNormalizedBoneNode('leftIndexProximal'),
    vrm.humanoid.getNormalizedBoneNode('leftIndexIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('leftIndexDistal'),
    gL.indexCurl + fingerFlutterL * 0.3, gL.indexSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('leftMiddleProximal'),
    vrm.humanoid.getNormalizedBoneNode('leftMiddleIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('leftMiddleDistal'),
    gL.middleCurl, gL.middleSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('leftRingProximal'),
    vrm.humanoid.getNormalizedBoneNode('leftRingIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('leftRingDistal'),
    gL.ringCurl + fingerFlutterL * 0.2, gL.ringSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('leftLittleProximal'),
    vrm.humanoid.getNormalizedBoneNode('leftLittleIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('leftLittleDistal'),
    gL.pinkyCurl + fingerFlutterL * 0.4, gL.pinkySpread
  );

  // -- RIGHT HAND --
  const rightHand = vrm.humanoid.getNormalizedBoneNode('rightHand');
  if (rightHand) {
    rightHand.rotation.z = gR.handZ + Math.sin(elapsed * 0.6 + 1.0) * 0.008;
    rightHand.rotation.x = gR.handX;
  }

  const rThumbMeta = vrm.humanoid.getNormalizedBoneNode('rightThumbMetacarpal');
  const rThumbProx = vrm.humanoid.getNormalizedBoneNode('rightThumbProximal');
  const rThumbDist = vrm.humanoid.getNormalizedBoneNode('rightThumbDistal');
  if (rThumbMeta) rThumbMeta.rotation.z =  0.30 + gR.thumbCurl * 0.5;
  if (rThumbProx) rThumbProx.rotation.x = gR.thumbCurl * CURL_SCALE * 0.6;
  if (rThumbDist) rThumbDist.rotation.x = gR.thumbCurl * CURL_SCALE * 0.5;

  setCurl(
    vrm.humanoid.getNormalizedBoneNode('rightIndexProximal'),
    vrm.humanoid.getNormalizedBoneNode('rightIndexIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('rightIndexDistal'),
    gR.indexCurl + fingerFlutterR * 0.3, -gR.indexSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('rightMiddleProximal'),
    vrm.humanoid.getNormalizedBoneNode('rightMiddleIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('rightMiddleDistal'),
    gR.middleCurl, -gR.middleSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('rightRingProximal'),
    vrm.humanoid.getNormalizedBoneNode('rightRingIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('rightRingDistal'),
    gR.ringCurl + fingerFlutterR * 0.2, -gR.ringSpread
  );
  setCurl(
    vrm.humanoid.getNormalizedBoneNode('rightLittleProximal'),
    vrm.humanoid.getNormalizedBoneNode('rightLittleIntermediate'),
    vrm.humanoid.getNormalizedBoneNode('rightLittleDistal'),
    gR.pinkyCurl + fingerFlutterR * 0.4, -gR.pinkySpread
  );
  const neckBone = vrm.humanoid.getNormalizedBoneNode('neck');
  if (neckBone) {
    neckBone.rotation.y = Math.sin(elapsed * 0.35) * 0.05 + _fidgetHeadOffsetY * 0.3;
    neckBone.rotation.x = Math.sin(elapsed * 0.45) * 0.03 + moodBias.pitchX * 0.05;
  }
}
