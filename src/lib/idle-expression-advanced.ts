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
  // Regular expressions
  { name: 'happy',     weight: 3.0, minDuration: 2.5, maxDuration: 7,  baseIntensity: 0.70, intensityVariation: 0.15, mood: 'positive' },
  { name: 'relaxed',   weight: 2.5, minDuration: 3,   maxDuration: 9,  baseIntensity: 0.75, intensityVariation: 0.10, mood: 'positive' },
  { name: 'surprised', weight: 0.8, minDuration: 1.5, maxDuration: 3,  baseIntensity: 0.60, intensityVariation: 0.15, mood: 'neutral' },
  { name: 'sad',       weight: 0.6, minDuration: 2.5, maxDuration: 5,  baseIntensity: 0.50, intensityVariation: 0.10, mood: 'negative' },
  
  // Micro-expressions (sangat singkat, subtle)
  { name: 'happy',     weight: 2.5, minDuration: 0.4, maxDuration: 1.2, baseIntensity: 0.35, intensityVariation: 0.10, isMicro: true, mood: 'positive' },
  { name: 'surprised', weight: 1.8, minDuration: 0.3, maxDuration: 0.9, baseIntensity: 0.30, intensityVariation: 0.10, isMicro: true, mood: 'neutral' },
  { name: 'sad',       weight: 1.2, minDuration: 0.4, maxDuration: 1.0, baseIntensity: 0.25, intensityVariation: 0.08, isMicro: true, mood: 'negative' },
  { name: 'relaxed',   weight: 1.5, minDuration: 0.5, maxDuration: 1.3, baseIntensity: 0.40, intensityVariation: 0.08, isMicro: true, mood: 'positive' },
];

// Neutral configuration
const NEUTRAL_WEIGHT = 4.5;
const NEUTRAL_MIN = 2.5;
const NEUTRAL_MAX = 8;
const NEUTRAL_LONG_PAUSE_CHANCE = 0.12; // 12% chance pause panjang (12-20 detik)
const NEUTRAL_LONG_MIN = 12;
const NEUTRAL_LONG_MAX = 20;

// Emotional momentum
const MOOD_MOMENTUM_BOOST = 2.2; // Boost untuk mood yang sama

// Lerp speed range (variable per transition)
const LERP_SPEED_MIN = 1.6;
const LERP_SPEED_MAX = 3.2;

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
  
  // Randomize lerp speed
  _lerpSpeed = LERP_SPEED_MIN + Math.random() * (LERP_SPEED_MAX - LERP_SPEED_MIN);
  
  // Build weights
  const weights: Record<string, number> = {};
  if (chosen.name !== 'neutral') {
    weights[chosen.name] = chosen.intensity;
  }
  
  // Log dengan info tambahan
  const microLabel = chosen.isMicro ? ' [micro]' : '';
  const longLabel = isLongPause && chosen.name === 'neutral' ? ' [long pause]' : '';
  console.log(`[Idle Expression] → ${chosen.name}${microLabel}${longLabel} (${duration.toFixed(1)}s, intensity: ${chosen.intensity.toFixed(2)})`);
  
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
  _holdTarget = 2 + Math.random() * 3;
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
      names.push((expr as any).expressionName || key);
    } else {
      names.push(key);
    }
  }
  console.log('[Idle Expression] Expression names:', names);
}

export function setIdleExpressionPaused(paused: boolean): void {
  _paused = paused;
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
  if (!_paused && !_inMoodOverride) {
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
  
  // Reset managed keys
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
