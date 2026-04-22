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
 * Does NOT call stopAllAction/uncacheRoot synchronously — that causes a
 * 1-frame T-pose flash. Instead, fadeOut old actions while fadeIn the new
 * one so THREE blends bones smoothly. Cleanup of old actions happens after
 * the cross-fade completes.
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
  const { loop = false, fadeIn = 0.4 } = opts;

  // Snapshot currently-running actions BEFORE creating the new one so we
  // can fade them out and clean them up after the cross-fade completes.
  const prevActions: THREE.AnimationAction[] = [];
  try {
    const all = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    for (const a of all) {
      // Include any enabled/running action, even at weight≈0. THREE keeps
      // them as a valid source pose for cross-fade — preventing T-pose flash.
      if (a.enabled || a.isRunning() || a.getEffectiveWeight() > 0.001) {
        prevActions.push(a);
      }
    }
  } catch (_) { /* ok */ }

  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.timeScale = 1;
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = true;

  // Cross-fade: ramp old actions to 0 while new action ramps to 1.
  if (fadeIn > 0 && prevActions.length > 0) {
    for (const prev of prevActions) {
      // Don't double-fade if the same action object somehow.
      if (prev === action) continue;
      try { prev.fadeOut(fadeIn); } catch (_) { /* ok */ }
    }
    action.setEffectiveWeight(0);
    action.fadeIn(fadeIn);
  } else {
    action.setEffectiveWeight(1);
    action.weight = 1;
  }

  action.play();

  // NOTE: We intentionally do NOT stop() prev actions after the fade.
  // THREE.AnimationMixer keeps actions in `_actions` even at weight=0; they
  // contribute nothing to the pose but remain valid as a "source pose" for
  // the NEXT cross-fade. Calling stop() here would deactivate them and the
  // next playVRMA call would have no source action → bones snap to bind
  // pose (T-pose flash) during fadeIn. Clip count is bounded (~120) so the
  // memory footprint is fine; clipAction() returns the same cached action
  // when re-invoked with the same clip.

  console.log('[VRMA] Action cross-faded in — duration:', clip.duration.toFixed(2), 's, loop:', loop, 'prev actions faded:', prevActions.length);
  return action;
}

/**
 * Fade out all currently-playing actions without stopping the mixer.
 * NEVER call stopAllAction() — that causes an immediate T-pose snap.
 * Callers should immediately crossfade to an idle/rest clip after calling this.
 */
export function stopVRMA(mixer: THREE.AnimationMixer | null, fadeOut = 0.3): void {
  if (!mixer) return;
  try {
    const actions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    actions.forEach((action) => {
      try { action.fadeOut(fadeOut); } catch (_) { /* ok */ }
    });
  } catch (e) {
    console.warn('stopVRMA: failed (safe to ignore):', e);
  }
}
