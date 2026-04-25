/**
 * Advanced Idle Expression System - Human-like Natural Behavior
 *
 * Fitur untuk realisme maksimal:
 * 1. Micro-expressions (0.3-1.5s) - Ekspresi sangat singkat
 * 2. Variable intensity - Tidak selalu sama, ada variasi
 * 3. Emotional momentum - Cenderung stay di mood yang sama
 * 4. Asymmetric timing - Tidak predictable
 * 5. Random long pauses - Kadang neutral lama (seperti melamun)
 * 6. Intensity fluctuation - Ekspresi naik-turun sedikit
 */

import type { VRM } from '@pixiv/three-vrm';

interface ExpressionSlot {
  name: string;
  weight: number;
  minDuration: number;
  maxDuration: number;
  baseIntensity: number;
  intensityVariation: number; // ±variation
  isMicro?: boolean;
  mood?: 'positive' | 'negative' | 'neutral';
}

// ── Expression Pool ───────────────────────────────────────────────────────────
const EXPRESSIONS: ExpressionSlot[] = [
  // Regular expressions - durasi lebih panjang untuk lebih natural
  { name: 'happy',     weight: 2.0, minDuration: 3,   maxDuration: 8,  baseIntensity: 0.65, intensityVariation: 0.15, mood: 'positive' },
  { name: 'relaxed',   weight: 2.0, minDuration: 4,   maxDuration: 10, baseIntensity: 0.70, intensityVariation: 0.10, mood: 'positive' },
  { name: 'surprised', weight: 0.5, minDuration: 2,   maxDuration: 4,  baseIntensity: 0.55, intensityVariation: 0.15, mood: 'neutral' },
  { name: 'sad',       weight: 0.4, minDuration: 3,   maxDuration: 6,  baseIntensity: 0.45, intensityVariation: 0.10, mood: 'negative' },
  
  // Micro-expressions - dikurangi weight dan frekuensi
  { name: 'happy',     weight: 1.0, minDuration: 0.5, maxDuration: 1.5, baseIntensity: 0.30, intensityVariation: 0.10, isMicro: true, mood: 'positive' },
  { name: 'surprised', weight: 0.8, minDuration: 0.4, maxDuration: 1.0, baseIntensity: 0.25, intensityVariation: 0.10, isMicro: true, mood: 'neutral' },
  { name: 'relaxed',   weight: 0.8, minDuration: 0.6, maxDuration: 1.5, baseIntensity: 0.35, intensityVariation: 0.08, isMicro: true, mood: 'positive' },
];

// Neutral configuration - DIPERPANJANG untuk lebih natural
const NEUTRAL_WEIGHT = 6.0; // Increased weight - lebih sering neutral
const NEUTRAL_MIN = 5;      // Increased from 2.5 - minimal 5 detik
const NEUTRAL_MAX = 15;     // Increased from 8 - maksimal 15 detik
const NEUTRAL_LONG_PAUSE_CHANCE = 0.20; // Increased from 0.12 - 20% chance pause panjang
const NEUTRAL_LONG_MIN = 15; // Increased from 12
const NEUTRAL_LONG_MAX = 30; // Increased from 20

// Emotional momentum
const MOOD_MOMENTUM_BOOST = 2.2; // Boost untuk mood yang sama

// Lerp speed range (variable per transition)
const LERP_SPEED_MIN = 0.2;  // Reduced from 0.4 - extremely slow
const LERP_SPEED_MAX = 0.6;  // Reduced from 1.0 - extremely slow
const LERP_SPEED_RESUME = 0.1; // Reduced from 0.2 - extremely slow for first transition after TTS

// Intensity fluctuation during hold
const INTENSITY_FLUCTUATION_SPEED = 0.3; // Cycles per second
const INTENSITY_FLUCTUATION_AMOUNT = 0.08; // ±8%

// ── State ─────────────────────────────────────────────────────────────────────
let _enabled = true;
let _paused = false;
let _currentWeights: Record<string, number> = {};
let _targetWeights: Record<string, number> = {};
let _baseTargetIntensity = 0; // Base intensity untuk fluctuation
let _transitioning = false;
let _holdTimer = 0;
let _holdTarget = 5;
let _activeName = 'neutral';
let _lastIndex = -1;
let _currentMood: 'positive' | 'negative' | 'neutral' = 'neutral';
let _lerpSpeed = 2.0;
let _fluctuationPhase = 0; // Untuk intensity fluctuation
let _resumeTransitionCount = 0; // Counter untuk transisi setelah resume - gradually speed up

// Mood override
let _moodOverrideTimer = 0;
let _moodOverrideDuration = 0;
let _inMoodOverride = false;

let manualMode = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pickNext(): { 
  weights: Record<string, number>; 
  name: string; 
  duration: number; 
  intensity: number;
  mood: 'positive' | 'negative' | 'neutral';
} {
  // Build pool with neutral
  const pool: Array<{
    name: string;
    weight: number;
    minDuration: number;
    maxDuration: number;
    intensity: number;
    mood: 'positive' | 'negative' | 'neutral';
    isMicro: boolean;
  }> = [];
  
  // Neutral dengan chance untuk long pause
  const isLongPause = Math.random() < NEUTRAL_LONG_PAUSE_CHANCE;
  pool.push({
    name: 'neutral',
    weight: NEUTRAL_WEIGHT,
    minDuration: isLongPause ? NEUTRAL_LONG_MIN : NEUTRAL_MIN,
    maxDuration: isLongPause ? NEUTRAL_LONG_MAX : NEUTRAL_MAX,
    intensity: 0,
    mood: 'neutral',
    isMicro: false,
  });
  
  // Add expressions dengan mood momentum
  for (const expr of EXPRESSIONS) {
    let weight = expr.weight;
    
    // Boost weight jika mood sama dengan current mood
    if (expr.mood === _currentMood && _currentMood !== 'neutral') {
      weight *= MOOD_MOMENTUM_BOOST;
    }
    
    // Randomize intensity dalam range
    const intensityVariation = (Math.random() - 0.5) * 2 * expr.intensityVariation;
    const intensity = Math.max(0.1, Math.min(1, expr.baseIntensity + intensityVariation));
    
    pool.push({
      name: expr.name,
      weight,
      minDuration: expr.minDuration,
      maxDuration: expr.maxDuration,
      intensity,
      mood: expr.mood || 'neutral',
      isMicro: expr.isMicro || false,
    });
  }
  
  // Reduce weight untuk ekspresi terakhir (anti-repeat)
  const adjusted = pool.map((p, i) => ({
    ...p,
    weight: i === _lastIndex ? p.weight * 0.15 : p.weight,
  }));
  
  // Weighted random selection
  const total = adjusted.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  let chosen = adjusted[0];
  let chosenIdx = 0;
  
  for (let i = 0; i < adjusted.length; i++) {
    r -= adjusted[i].weight;
    if (r <= 0) {
      chosen = adjusted[i];
      chosenIdx = i;
      break;
    }
  }
  
  _lastIndex = chosenIdx;
  _currentMood = chosen.mood;
  
  // Randomize duration dengan slight bias ke tengah (lebih natural)
  const durationRange = chosen.maxDuration - chosen.minDuration;
  const bias = (Math.random() + Math.random()) / 2; // Triangular distribution
  const duration = chosen.minDuration + bias * durationRange;
  
  // Randomize lerp speed - slower for first few transitions after resume
  if (_resumeTransitionCount < 5) {
    // Gradually increase speed: 0.1 → 0.2 → 0.3 → 0.4 → 0.5 → normal (extremely slow progression)
    _lerpSpeed = LERP_SPEED_RESUME + (_resumeTransitionCount * 0.1);
    _resumeTransitionCount++;
  } else {
    // Normal random lerp speed
    _lerpSpeed = LERP_SPEED_MIN + Math.random() * (LERP_SPEED_MAX - LERP_SPEED_MIN);
  }
  
  // Build weights
  const weights: Record<string, number> = {};
  if (chosen.name !== 'neutral') {
    weights[chosen.name] = chosen.intensity;
  }
  
  // Log dengan info tambahan
  const microLabel = chosen.isMicro ? ' [micro]' : '';
  const longLabel = isLongPause && chosen.name === 'neutral' ? ' [long pause]' : '';
  const speedLabel = _resumeTransitionCount > 0 && _resumeTransitionCount <= 3 ? ` [slow transition ${_resumeTransitionCount}/3]` : '';
  console.log(`[Idle Expression] → ${chosen.name}${microLabel}${longLabel}${speedLabel} (${duration.toFixed(1)}s, intensity: ${chosen.intensity.toFixed(2)}, lerp: ${_lerpSpeed.toFixed(1)})`);
  
  return {
    weights,
    name: chosen.name,
    duration,
    intensity: chosen.intensity,
    mood: chosen.mood,
  };
}

function _lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initIdleExpression(): void {
  _enabled = true;
  _paused = false;
  _currentWeights = {};
  _targetWeights = {};
  _transitioning = false;
  _holdTimer = 0;
  _holdTarget = 8 + Math.random() * 7; // Increased: 8-15 detik untuk expression pertama
  _activeName = 'neutral';
  _lastIndex = -1;
  _currentMood = 'neutral';
  _lerpSpeed = 2.0;
  _fluctuationPhase = 0;
  _inMoodOverride = false;
  _moodOverrideTimer = 0;
  _moodOverrideDuration = 0;
  
  console.log('[Idle Expression] Advanced system initialized! First expression in', _holdTarget.toFixed(1), 'seconds');
}

export function debugExpressionKeys(vrm: VRM): void {
  if (!vrm.expressionManager) {
    console.warn('[Idle Expression] No expressionManager found!');
    return;
  }
  
  const expressions = vrm.expressionManager.expressions;
  const keys = Object.keys(expressions);
  console.log('[Idle Expression] Available expression keys:', keys);
  console.log('[Idle Expression] Total expressions:', keys.length);
  
  const names: string[] = [];
  for (const key of keys) {
    const expr = expressions[key];
    if (expr && typeof expr === 'object' && 'expressionName' in expr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      names.push((expr as any).expressionName || key);
    } else {
      names.push(key);
    }
  }
  console.log('[Idle Expression] Expression names:', names);
}

export function setIdleExpressionPaused(paused: boolean): void {
  _paused = paused;
  
  // CRITICAL: Reset all idle expression weights saat paused
  // Ini mencegah idle expression (seperti happy/relaxed yang buka mulut)
  // mengganggu lip sync saat TTS berbicara
  if (paused) {
    _currentWeights = {};
    _targetWeights = {};
    _transitioning = false;
    _fluctuationPhase = 0;
    console.log('[Idle Expression] Paused - all weights cleared for lip sync');
  } else {
    // Resume: Mulai dengan neutral dulu, beri waktu untuk settle
    // Ini membuat transisi lebih natural setelah TTS selesai
    _currentWeights = {}; // Start from neutral (all 0)
    _targetWeights = {};  // Target neutral first
    _holdTarget = 10 + Math.random() * 5; // Increased: Hold neutral 10-15 detik (was 7-11)
    _holdTimer = 0;
    _activeName = 'neutral';
    _transitioning = false; // Tidak transitioning, langsung neutral
    _lerpSpeed = LERP_SPEED_RESUME; // Use slower lerp speed for next transition
    _resumeTransitionCount = 0; // Reset counter - next 2-3 transitions will be slower
    console.log('[Idle Expression] Resumed - holding neutral for', _holdTarget.toFixed(1), 'seconds before next expression');
  }
}

/**
 * Smoothly fade out idle expressions to neutral before TTS starts.
 * This creates a more natural transition compared to instant reset.
 * Returns true when fade is complete.
 * 
 * IMPORTANT: Does NOT fade mouth expressions (aa, ih, ou, ee, oh) to allow
 * lip sync to work immediately during fade out.
 */
export function fadeOutIdleExpressions(delta: number, vrm: VRM): boolean {
  if (!vrm.expressionManager) return true;
  
  const em = vrm.expressionManager;
  const FADE_SPEED = 0.3; // Reduced from 0.5 - extremely slow fade for maximum natural transition
  
  // Mouth expressions that should NOT be faded (reserved for lip sync)
  const mouthExpressions = new Set(['aa', 'ih', 'ou', 'ee', 'oh']);
  
  // Lerp all current weights toward 0 (except mouth expressions)
  let maxValue = 0;
  for (const [key, value] of Object.entries(_currentWeights)) {
    // Skip mouth expressions - let lip sync handle them
    if (mouthExpressions.has(key)) {
      continue;
    }
    
    const newValue = value * (1 - FADE_SPEED * delta);
    _currentWeights[key] = newValue;
    maxValue = Math.max(maxValue, Math.abs(newValue));
    
    // Apply to VRM
    try { em.setValue(key, Math.max(0, newValue)); } catch (_) { /* ok */ }
  }
  
  // Fade complete when all values are near 0
  if (maxValue < 0.01) {
    // Clear all weights except mouth expressions
    const mouthWeights: Record<string, number> = {};
    for (const [key, value] of Object.entries(_currentWeights)) {
      if (mouthExpressions.has(key)) {
        mouthWeights[key] = value;
      }
    }
    _currentWeights = mouthWeights;
    _targetWeights = {};
    return true;
  }
  
  return false;
}

/**
 * Force clear all idle expression values from VRM immediately.
 * Call this right before TTS starts to ensure clean slate for lip sync.
 * NOTE: This is instant - use fadeOutIdleExpressions() for smooth transition.
 */
export function forceResetIdleExpressions(vrm: VRM): void {
  if (!vrm.expressionManager) return;
  
  const em = vrm.expressionManager;
  const managedKeys = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral', 'joy', 'sorrow', 'fun', 'extra'];
  
  for (const k of managedKeys) {
    try { em.setValue(k, 0); } catch (_) { /* ok */ }
  }
  
  // Also clear internal state
  _currentWeights = {};
  _targetWeights = {};
  
  console.log('[Idle Expression] Force reset - all expressions cleared from VRM');
}

export function applyMoodOverride(
  moodName: string,
  duration: number,
  vrm: VRM,
): void {
  if (!_enabled || manualMode) return;
  
  const moodMap: Record<string, string> = {
    'happy': 'happy',
    'sad': 'sad',
    'angry': 'angry',
    'surprised': 'surprised',
    'relaxed': 'relaxed',
    'neutral': 'neutral',
  };
  
  const expressionName = moodMap[moodName.toLowerCase()] || 'neutral';
  const weights: Record<string, number> = {};
  
  if (expressionName !== 'neutral') {
    weights[expressionName] = 0.90;
  }
  
  _targetWeights = weights;
  _baseTargetIntensity = 0.90;
  _transitioning = true;
  _inMoodOverride = true;
  _moodOverrideTimer = 0;
  _moodOverrideDuration = duration;
  _activeName = expressionName;
  
  console.log('[Idle Expression] Mood override:', expressionName, 'for', duration, 'seconds');
}

export function setIdleExpressionManual(manual: boolean): void {
  manualMode = manual;
}

export function updateIdleExpression(delta: number, vrm: VRM): void {
  if (!_enabled || manualMode || !vrm.expressionManager) return;
  
  // CRITICAL: Jangan apply weights sama sekali saat paused
  // Ini mencegah idle expression mengganggu lip sync
  if (_paused) {
    return;
  }
  
  // ── Mood override countdown ───────────────────────────────────────────────
  if (_inMoodOverride) {
    _moodOverrideTimer += delta;
    if (_moodOverrideTimer >= _moodOverrideDuration) {
      _inMoodOverride = false;
      const next = _pickNext();
      _targetWeights = next.weights;
      _baseTargetIntensity = next.intensity;
      _holdTarget = next.duration;
      _holdTimer = 0;
      _activeName = next.name;
      _transitioning = true;
    }
  }
  
  // ── Hold timer ────────────────────────────────────────────────────────────
  if (!_inMoodOverride) {
    _holdTimer += delta;
    
    // Intensity fluctuation during hold (subtle breathing effect)
    if (!_transitioning && _activeName !== 'neutral') {
      _fluctuationPhase += delta * INTENSITY_FLUCTUATION_SPEED * Math.PI * 2;
      const fluctuation = Math.sin(_fluctuationPhase) * INTENSITY_FLUCTUATION_AMOUNT;
      
      for (const [key, baseValue] of Object.entries(_targetWeights)) {
        const fluctuatedValue = baseValue * (1 + fluctuation);
        _currentWeights[key] = Math.max(0, Math.min(1, fluctuatedValue));
      }
    }
    
    if (_holdTimer >= _holdTarget) {
      const next = _pickNext();
      _targetWeights = next.weights;
      _baseTargetIntensity = next.intensity;
      _holdTarget = next.duration;
      _holdTimer = 0;
      _activeName = next.name;
      _transitioning = true;
      _fluctuationPhase = 0;
    }
  }
  
  // ── Lerp transition ───────────────────────────────────────────────────────
  if (_transitioning) {
    const t = Math.min(_lerpSpeed * delta, 1);
    
    const allKeys = new Set([
      ...Object.keys(_currentWeights),
      ...Object.keys(_targetWeights),
    ]);
    
    let maxDiff = 0;
    const next: Record<string, number> = {};
    
    for (const k of allKeys) {
      const cur = _currentWeights[k] ?? 0;
      const tgt = _targetWeights[k] ?? 0;
      
      // Variable easing - kadang ease-out, kadang ease-in-out
      const easingType = Math.random();
      let eased: number;
      
      if (easingType < 0.7) {
        // Ease-out quadratic (70% chance)
        eased = 1 - Math.pow(1 - t, 2);
      } else {
        // Ease-in-out cubic (30% chance)
        eased = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
      
      next[k] = _lerp(cur, tgt, eased);
      maxDiff = Math.max(maxDiff, Math.abs(next[k] - tgt));
    }
    
    _currentWeights = next;
    
    if (maxDiff < 0.01) {
      _currentWeights = { ..._targetWeights };
      _transitioning = false;
      console.log('[Idle Expression] ✓', _activeName);
    }
  }
  
  // ── Apply to VRM ──────────────────────────────────────────────────────────
  const em = vrm.expressionManager;
  
  // Reset managed keys - EXCLUDE blink keys to avoid interfering with blink system
  const managedKeys = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral', 'joy', 'sorrow', 'fun', 'extra'];
  for (const k of managedKeys) {
    try { em.setValue(k, 0); } catch (_) { /* ok */ }
  }
  
  // Apply current weights
  for (const [k, v] of Object.entries(_currentWeights)) {
    if (v <= 0.005) continue;
    const clamped = Math.max(0, Math.min(1, v));
    
    try {
      em.setValue(k, clamped);
    } catch (_) { /* ok */ }
    
    // camelCase fallback
    const camel = k.charAt(0).toLowerCase() + k.slice(1);
    if (camel !== k) {
      try { em.setValue(camel, clamped); } catch (_) { /* ok */ }
    }
  }
}
