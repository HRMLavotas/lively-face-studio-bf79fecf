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

/** Play a clip with optional fade-in. Returns the action so caller can monitor it. */
export function playVRMA(
  mixer: THREE.AnimationMixer | null,
  clip: THREE.AnimationClip,
  opts: PlayVrmaOptions = {}
): THREE.AnimationAction | null {
  if (!mixer) {
    console.warn('playVRMA: mixer is null, skipping');
    return null;
  }
  const { loop = false, fadeIn = 0 } = opts;

  // Stop + uncache all previous actions so old clips don't interfere
  try {
    mixer.stopAllAction();
    // Uncache the clip so that re-uploading same file creates a fresh action
    mixer.uncacheClip(clip);
  } catch (e) {
    console.warn('playVRMA: cleanup failed (safe to ignore):', e);
  }

  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.timeScale = 1;
  action.weight = 1;
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = true;

  if (fadeIn > 0) {
    action.setEffectiveWeight(1);
    action.fadeIn(fadeIn);
  }

  action.play();

  console.log('[VRMA] Action started — duration:', clip.duration.toFixed(2), 's, loop:', loop);
  return action;
}

/** Stop all currently-playing actions. */
export function stopVRMA(mixer: THREE.AnimationMixer | null, _fadeOut = 0.3): void {
  if (!mixer) return;
  try {
    mixer.timeScale = 1;
    mixer.stopAllAction();
  } catch (e) {
    console.warn('stopVRMA: failed (safe to ignore):', e);
  }
}
