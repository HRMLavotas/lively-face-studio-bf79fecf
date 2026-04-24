import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  VRMLookAtQuaternionProxy,
  VRMAnimation,
} from '@pixiv/three-vrm-animation';

export interface PlayVrmaOptions {
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** If true, freeze on last frame when finished. Default false for talking clips
   *  to avoid frozen pose bleeding into crossfades. Use true only for one-shot
   *  gestures that should hold their end pose until the next clip takes over. */
  clamp?: boolean;
}

/**
 * Gently fade out all active actions without ever calling stopAllAction()
 * or resetNormalizedPose(). Those two calls cause an immediate T-pose snap
 * which we must avoid at all costs.
 *
 * Callers should cross-fade to an idle clip immediately after this resolves.
 */
export function returnToRestPose(
  mixer: THREE.AnimationMixer | null,
  _vrm: VRM,
  duration = 0.5
): Promise<void> {
  return new Promise((resolve) => {
    if (!mixer) {
      resolve();
      return;
    }

    // Fade out every active action — THREE blends bones smoothly to
    // zero-contribution. NEVER call stopAllAction/resetNormalizedPose here;
    // those produce a 1-frame T-pose snap.
    const actions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    actions.forEach((action) => {
      try { action.fadeOut(duration); } catch (_) { /* ok */ }
    });

    // Resolve after fade so caller can start the next clip
    setTimeout(() => { resolve(); }, duration * 1000 + 30);
  });
}

/**
 * Ensure a VRMLookAtQuaternionProxy exists in the VRM scene so that
 * createVRMAnimationClip can find it and avoid re-creating it every call
 * (which would leave orphaned proxies in the scene).
 */
function ensureLookAtProxy(vrm: VRM): void {
  if (!vrm.lookAt) return;
  const existing = vrm.scene.children.find(
    (obj) => obj instanceof VRMLookAtQuaternionProxy
  );
  if (!existing) {
    const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    (proxy as unknown as THREE.Object3D).name = 'VRMLookAtQuaternionProxy';
    vrm.scene.add(proxy);
    console.log('[VRMA] VRMLookAtQuaternionProxy added to scene');
  }
}

/** Load a .vrma file and convert it into a THREE.AnimationClip targeting `vrm`. */
export async function loadVRMA(url: string, vrm: VRM): Promise<THREE.AnimationClip> {
  if (!vrm) {
    throw new Error('VRM model belum dimuat');
  }
  if (!vrm.humanoid) {
    throw new Error('Model VRM tidak punya humanoid mapping — VRMA butuh humanoid bones');
  }

  // Ensure LookAt proxy exists before creating clip
  ensureLookAtProxy(vrm);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    throw new Error(`Tidak bisa parse file VRMA: ${msg}`);
  }

  const vrmAnimations: VRMAnimation[] | undefined = gltf.userData.vrmAnimations;
  if (!vrmAnimations || vrmAnimations.length === 0) {
    throw new Error(
      'File ini bukan VRMA standar (kurang ekstensi VRMC_vrm_animation). Pastikan diekspor dari VRoid Studio / Pixiv VRMA 1.0+'
    );
  }

  const anim = vrmAnimations[0];
  console.log('[VRMA] Animation loaded:', {
    duration: anim.duration,
    humanoidBones: [...anim.humanoidTracks.rotation.keys()],
    expressionCount: anim.expressionTracks?.preset?.size ?? 0,
  });

  let clip: THREE.AnimationClip;
  try {
    clip = createVRMAnimationClip(anim, vrm);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    throw new Error(`Bone mapping VRMA tidak cocok dengan model: ${msg}`);
  }

  console.log('[VRMA] Clip created:', {
    duration: clip.duration,
    trackCount: clip.tracks.length,
    trackNames: clip.tracks.slice(0, 5).map((t) => t.name),
  });

  if (clip.tracks.length === 0) {
    throw new Error(
      'Clip tidak punya tracks — kemungkinan bone names di VRMA tidak cocok dengan model VRM ini. Pastikan model VRM memiliki humanoid rig yang valid.'
    );
  }

  // Debug: verify that the track target names actually exist in vrm.scene
  if (import.meta.env.DEV) {
    const missingNodes: string[] = [];
    clip.tracks.forEach((track) => {
      const dotIdx = track.name.indexOf('.');
      const nodeName = dotIdx !== -1 ? track.name.substring(0, dotIdx) : track.name;
      const found = vrm.scene.getObjectByName(nodeName);
      if (!found) missingNodes.push(nodeName);
    });
    if (missingNodes.length > 0) {
      console.warn('[VRMA] Track target nodes NOT found in vrm.scene:', [...new Set(missingNodes)]);
    } else {
      console.log('[VRMA] All track target nodes found in vrm.scene ✓');
    }
  }

  return clip;
}

/**
 * Post-process a clip to neutralize hips Y-rotation (yaw) so the model
 * always faces forward regardless of how the animation was authored.
 * Only modifies the hips quaternion track — all other bones are untouched.
 * Safe to call on any clip; no-op if hips track is not found.
 */
export function straightenClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const track of clip.tracks) {
    // Match hips quaternion track: "Normalized_J_Bip_C_Hips.quaternion"
    if (!track.name.includes('Hips') || !track.name.endsWith('.quaternion')) continue;
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

    const values = track.values as Float32Array;
    // Each quaternion = [x, y, z, w] — 4 floats per keyframe
    for (let i = 0; i < values.length; i += 4) {
      const x = values[i];
      const y = values[i + 1];
      const z = values[i + 2];
      const w = values[i + 3];

      // Decompose: extract Y rotation (yaw) and remove it.
      // For a quaternion q, the yaw component can be isolated and zeroed.
      // We reconstruct the quaternion keeping only pitch (X) and roll (Z).
      const q = new THREE.Quaternion(x, y, z, w).normalize();
      const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      // Zero out Y (yaw) — keep X (pitch) and Z (roll)
      euler.y = 0;
      const fixed = new THREE.Quaternion().setFromEuler(euler);

      values[i]     = fixed.x;
      values[i + 1] = fixed.y;
      values[i + 2] = fixed.z;
      values[i + 3] = fixed.w;
    }
    console.log('[VRMA] straightenClip: hips Y-rotation zeroed on', clip.tracks.length, 'track clip');
    break;
  }
  return clip;
}

/** Create an AnimationMixer bound to the VRM scene root. */
export function createMixer(vrm: VRM): THREE.AnimationMixer {
  // Mixer MUST be bound to vrm.scene so it can find bone nodes by name.
  // The normalized bone nodes are children of vrm.scene (added during VRMLoaderPlugin).
  const mixer = new THREE.AnimationMixer(vrm.scene);
  if (import.meta.env.DEV) {
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    console.log('[VRMA] createMixer — normalized bone names:', {
      hips: hips?.name ?? 'MISSING',
      spine: spine?.name ?? 'MISSING',
      head: head?.name ?? 'MISSING',
      sceneChildren: vrm.scene.children.length,
    });
  }
  return mixer;
}

/**
 * Play a clip with cross-fade from the currently active actions.
 * Uses THREE's built-in crossFadeTo when possible for smooth transitions.
 * Does NOT call stopAllAction/uncacheRoot synchronously — that causes a
 * 1-frame T-pose flash.
 */
export function playVRMA(
  mixer: THREE.AnimationMixer | null,
  clip: THREE.AnimationClip,
  opts: PlayVrmaOptions = {}
): THREE.AnimationAction | null {
  if (!mixer) {
    console.warn('playVRMA: mixer is null, skipping');
    return null;
  }
  const { loop = false, fadeIn = 1.5, clamp = false } = opts; // Increased from 0.4 to 1.5 for slower, more natural transitions

  // Find the single most-weighted active action to crossfade FROM.
  // Using crossFadeTo is more reliable than manual weight manipulation.
  let dominantPrev: THREE.AnimationAction | null = null;
  let maxWeight = 0;
  try {
    const all = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    for (const a of all) {
      if (!a.enabled) continue;
      const w = a.getEffectiveWeight();
      if ((a.isRunning() || a.paused) && w > maxWeight) {
        maxWeight = w;
        dominantPrev = a;
      }
    }
  } catch (_) { /* ok */ }

  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.timeScale = 1;
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = clamp;

  if (fadeIn > 0 && dominantPrev && dominantPrev !== action) {
    // Use THREE's crossFadeTo for smooth weight transfer — guarantees
    // total weight stays at 1 throughout the transition (no T-pose window).
    action.setEffectiveWeight(1);
    action.play();
    dominantPrev.crossFadeTo(action, fadeIn, true);

    // Also fade out any other secondary actions that aren't the dominant one
    try {
      const all = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
      for (const a of all) {
        if (!a.enabled || a === action || a === dominantPrev) continue;
        if (a.isRunning() || a.paused || a.getEffectiveWeight() > 0.001) {
          try { a.fadeOut(fadeIn); } catch (_) { /* ok */ }
        }
      }
    } catch (_) { /* ok */ }
  } else if (dominantPrev === action) {
    // Same action — just ensure it's playing
    action.play();
  } else {
    // No prev action — start immediately at full weight
    action.setEffectiveWeight(1);
    action.weight = 1;
    action.play();
  }

  console.log('[VRMA] Action cross-faded in — duration:', clip.duration.toFixed(2), 's, loop:', loop, 'prev faded:', dominantPrev ? 'yes' : 'none');
  return action;
}

/**
 * Fade out all currently-playing actions without stopping the mixer.
 * NEVER call stopAllAction() — that causes an immediate T-pose snap.
 * Callers should immediately crossfade to an idle/rest clip after calling this.
 */
export function stopVRMA(mixer: THREE.AnimationMixer | null, fadeOut = 1.0): void { // Increased from 0.3 to 1.0 for slower fade out
  if (!mixer) return;
  try {
    const actions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    actions.forEach((action) => {
      try {
        // If action is already at weight 0 and not running, just disable it
        // so it doesn't linger as a "source pose" for future crossfades.
        if (!action.isRunning() && action.getEffectiveWeight() <= 0.001) {
          action.enabled = false;
        } else {
          action.fadeOut(fadeOut);
        }
      } catch (_) { /* ok */ }
    });
  } catch (e) {
    console.warn('stopVRMA: failed (safe to ignore):', e);
  }
}
