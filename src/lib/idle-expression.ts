/**
 * Idle Expression Rotation System
 *
 * Secara otomatis merotasi ekspresi wajah model saat idle,
 * dengan lerp halus antar ekspresi dan timing yang variatif.
 *
 * Desain:
 * - Pool ekspresi idle yang subtle (tidak ekstrem)
 * - Setiap ekspresi punya bobot probabilitas berbeda
 * - Transisi lerp halus (bukan snap)
 * - Pause saat TTS aktif, resume setelah selesai
 * - Mood override dari AI reply → kembali ke rotasi setelah durasi tertentu
 */

import type { VRM } from '@pixiv/three-vrm';
import { loadPresets } from './blendshape-store';

// ── Tipe ──────────────────────────────────────────────────────────────────────
interface ExpressionSlot {
  name: string;       // nama preset (case-insensitive match)
  weight: number;     // probabilitas relatif
  minDuration: number; // detik minimum tampil
  maxDuration: number; // detik maksimum tampil
  intensity: number;  // 0-1, scale weights sebelum apply (untuk subtle effect)
}

// ── Pool ekspresi idle ────────────────────────────────────────────────────────
// Menggunakan standard VRM expression names (lowercase)
const IDLE_POOL: ExpressionSlot[] = [
  { name: 'happy',       weight: 3.5, minDuration: 3,  maxDuration: 8,  intensity: 0.75 },
  { name: 'relaxed',     weight: 2.5, minDuration: 4,  maxDuration: 10, intensity: 0.80 },
  { name: 'surprised',   weight: 1.0, minDuration: 2,  maxDuration: 4,  intensity: 0.65 },
  { name: 'sad',         weight: 0.8, minDuration: 3,  maxDuration: 6,  intensity: 0.55 },
];

// Neutral reset (kembali ke default model) punya bobot sendiri
const NEUTRAL_WEIGHT = 3.5; // Lebih sering neutral untuk natural
const NEUTRAL_MIN = 4;
const NEUTRAL_MAX = 10;

// Kecepatan lerp antar ekspresi
const LERP_IN_SPEED  = 1.8; // Lebih cepat untuk transisi natural
const LERP_OUT_SPEED = 2.0; // Lebih cepat keluar

// ── State ─────────────────────────────────────────────────────────────────────
let _enabled = true;
let _paused  = false; // true saat TTS aktif atau mood override

// Ekspresi saat ini (weights yang sedang di-lerp)
let _currentWeights: Record<string, number> = {};
// Target weights yang sedang dituju
let _targetWeights: Record<string, number> = {};
// Apakah sedang dalam transisi
let _transitioning = false;
// Timer untuk ganti ekspresi berikutnya
let _holdTimer  = 0;
let _holdTarget = 8; // detik
// Nama ekspresi aktif saat ini
let _activeName = 'neutral';
// Index terakhir agar tidak repeat
let _lastIndex = -1;

// Mood override state
let _moodOverrideTimer = 0;
let _moodOverrideDuration = 0;
let _inMoodOverride = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _pickNext(): { weights: Record<string, number>; name: string; duration: number; intensity: number } {
  // Bangun pool dengan neutral
  const pool: Array<{ name: string; weight: number; minDuration: number; maxDuration: number; intensity: number }> = [
    { name: 'neutral', weight: NEUTRAL_WEIGHT, minDuration: NEUTRAL_MIN, maxDuration: NEUTRAL_MAX, intensity: 1.0 },
  ];

  // Tambahkan semua ekspresi dari IDLE_POOL
  for (const slot of IDLE_POOL) {
    pool.push(slot);
  }

  // Kurangi bobot ekspresi terakhir agar tidak repeat
  const adjusted = pool.map((p, i) => ({
    ...p,
    weight: i === _lastIndex ? p.weight * 0.2 : p.weight, // Lebih kecil untuk variasi
  }));

  const total = adjusted.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  let chosen = adjusted[0];
  let chosenIdx = 0;
  for (let i = 0; i < adjusted.length; i++) {
    r -= adjusted[i].weight;
    if (r <= 0) { chosen = adjusted[i]; chosenIdx = i; break; }
  }
  _lastIndex = chosenIdx;

  const dur = chosen.minDuration + Math.random() * (chosen.maxDuration - chosen.minDuration);
  
  // Untuk standard VRM, gunakan expression name langsung sebagai key dengan intensity
  const weights: Record<string, number> = {};
  if (chosen.name !== 'neutral') {
    weights[chosen.name] = chosen.intensity;
  }
  
  return { weights, name: chosen.name, duration: dur, intensity: chosen.intensity };
}

function _lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initIdleExpression(): void {
  _enabled = true;
  _paused  = false;
  _currentWeights = {};
  _targetWeights  = {};
  _transitioning  = false;
  _holdTimer  = 0;
  _holdTarget = 3 + Math.random() * 4; // mulai cepat (3-7 detik)
  _activeName = 'neutral';
  _lastIndex  = -1;
  _inMoodOverride = false;
  _moodOverrideTimer = 0;
  _moodOverrideDuration = 0;
  
  console.log('[Idle Expression] Initialized! First expression in', _holdTarget.toFixed(1), 'seconds');
}

/**
 * Debug function: Log available expression names in VRM
 */
export function debugExpressionKeys(vrm: VRM): void {
  if (!vrm.expressionManager) {
    console.warn('[Idle Expression] No expressionManager found!');
    return;
  }
  
  const expressions = vrm.expressionManager.expressions;
  const keys = Object.keys(expressions);
  console.log('[Idle Expression] Available expression keys:', keys);
  console.log('[Idle Expression] Total expressions:', keys.length);
  
  // Log actual expression names (not just indices)
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

/** Pause saat TTS aktif */
export function setIdleExpressionPaused(paused: boolean): void {
  _paused = paused;
}

/**
 * Override sementara dengan ekspresi mood dari AI reply.
 * Setelah `duration` detik, kembali ke rotasi idle.
 */
export function applyMoodOverride(
  moodName: string,
  duration: number,
  vrm: VRM,
): void {
  if (!_enabled || manualMode) return;

  // Map mood names ke standard VRM expressions
  const moodMap: Record<string, string> = {
    'happy': 'happy',
    'sad': 'sad',
    'angry': 'angry',
    'surprised': 'surprised',
    'relaxed': 'relaxed',
    'neutral': 'neutral',
  };
  
  const expressionName = moodMap[moodName.toLowerCase()] || 'neutral';
  
  // Set target ke mood expression dengan intensity
  const weights: Record<string, number> = {};
  if (expressionName !== 'neutral') {
    weights[expressionName] = 0.95; // Kuat untuk mood override
  }
  
  _targetWeights = weights;
  _transitioning = true;
  _inMoodOverride = true;
  _moodOverrideTimer = 0;
  _moodOverrideDuration = duration;
  _activeName = expressionName;
  
  console.log('[Idle Expression] Mood override:', expressionName, 'for', duration, 'seconds');
}

let manualMode = false;
export function setIdleExpressionManual(manual: boolean): void {
  manualMode = manual;
}

/**
 * Dipanggil setiap frame dari render loop.
 * Mengelola lerp dan rotasi ekspresi.
 */
export function updateIdleExpression(delta: number, vrm: VRM): void {
  if (!_enabled || manualMode || !vrm.expressionManager) return;

  // Debug log setiap 3 detik
  if (Math.random() < 0.005) { // Kurangi frekuensi logging
    console.log('[Idle Expression]', {
      active: _activeName,
      holdTimer: _holdTimer.toFixed(1),
      holdTarget: _holdTarget.toFixed(1),
      transitioning: _transitioning,
      paused: _paused,
      inMoodOverride: _inMoodOverride,
      currentWeights: Object.keys(_currentWeights).length,
    });
  }

  // ── Mood override countdown ───────────────────────────────────────────────
  if (_inMoodOverride) {
    _moodOverrideTimer += delta;
    if (_moodOverrideTimer >= _moodOverrideDuration) {
      _inMoodOverride = false;
      // Mulai transisi ke ekspresi idle berikutnya
      const next = _pickNext();
      _targetWeights = next.weights;
      _holdTarget = next.duration;
      _holdTimer  = 0;
      _activeName = next.name;
      _transitioning = true;
      console.log('[Idle Expression] Mood override ended, switching to:', next.name);
    }
  }

  // ── Hold timer (saat tidak paused dan tidak mood override) ───────────────
  if (!_paused && !_inMoodOverride) {
    _holdTimer += delta;
    if (_holdTimer >= _holdTarget) {
      // Waktunya ganti ekspresi
      const next = _pickNext();
      _targetWeights = next.weights;
      _holdTarget = next.duration;
      _holdTimer  = 0;
      _activeName = next.name;
      _transitioning = true;
      console.log('[Idle Expression] Switching to:', next.name, 'for', next.duration.toFixed(1), 'seconds');
    }
  }

  // ── Lerp current → target ─────────────────────────────────────────────────
  if (_transitioning) {
    const speed = LERP_IN_SPEED;
    const t = Math.min(speed * delta, 1);

    // Kumpulkan semua keys dari current dan target
    const allKeys = new Set([
      ...Object.keys(_currentWeights),
      ...Object.keys(_targetWeights),
    ]);

    let maxDiff = 0;
    const next: Record<string, number> = {};

    for (const k of allKeys) {
      const cur = _currentWeights[k] ?? 0;
      const tgt = _targetWeights[k] ?? 0;
      
      // Smooth easing function untuk transisi yang lebih natural
      const eased = 1 - Math.pow(1 - t, 2); // ease-out quadratic
      next[k] = _lerp(cur, tgt, eased);
      maxDiff = Math.max(maxDiff, Math.abs(next[k] - tgt));
    }

    _currentWeights = next;

    // Selesai lerp jika sudah sangat dekat
    if (maxDiff < 0.01) {
      _currentWeights = { ..._targetWeights };
      _transitioning = false;
      // Log hanya untuk transisi selesai
      console.log('[Idle Expression] ✓', _activeName);
    }
  }

  // ── Apply ke VRM ──────────────────────────────────────────────────────────
  const em = vrm.expressionManager;

  // Reset semua expression keys yang kita kelola ke 0 dulu
  for (const k of MANAGED_KEYS) {
    try { em.setValue(k, 0); } catch (_) { /* ok */ }
  }

  // Apply current weights dengan threshold untuk menghindari nilai terlalu kecil
  let appliedCount = 0;
  for (const [k, v] of Object.entries(_currentWeights)) {
    if (v <= 0.005) continue; // Threshold lebih kecil untuk detail halus
    const clamped = Math.max(0, Math.min(1, v));
    try { 
      em.setValue(k, clamped);
      appliedCount++;
      // Debug: log nilai yang di-apply (jarang)
      if (Math.random() < 0.002) {
        console.log(`[Idle Expression] Applied ${k} = ${clamped.toFixed(3)}`);
      }
    } catch (e) { 
      if (Math.random() < 0.005) {
        console.warn(`[Idle Expression] Failed to set ${k}:`, e);
      }
    }
    // camelCase fallback
    const camel = k.charAt(0).toLowerCase() + k.slice(1);
    if (camel !== k) { 
      try { em.setValue(camel, clamped); } catch (_) { /* ok */ } 
    }
  }
  
  // Debug: log jika tidak ada yang di-apply (jarang)
  if (appliedCount === 0 && Object.keys(_currentWeights).length > 0 && Math.random() < 0.01) {
    console.warn('[Idle Expression] No weights applied! Current weights:', _currentWeights);
  }
}

// Keys yang dikelola sistem ini — standard VRM expressions
// TIDAK termasuk blink karena dikelola oleh updateBlink()
const MANAGED_KEYS = [
  'happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral',
  // Fallback untuk model yang mungkin punya nama berbeda
  'joy', 'sorrow', 'fun', 'extra',
];
