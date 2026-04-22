import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import {
  updateBlink,
  updateMicroExpressions,
  updateLipSync,
  resetMouthExpressions,
  setTargetMood,
  updateIdleMicroGestures,
  updateIdleSmile,
  getClipDrivenBones,
} from '@/lib/vrm-animations';
import { detectMood } from '@/lib/sentiment';
import { loadVRMA, createMixer, playVRMA, stopVRMA, type PlayVrmaOptions } from '@/lib/vrma-player';
import { supabase } from '@/integrations/supabase/client';

export type CameraPreset =
  | 'extreme-closeup'
  | 'closeup'
  | 'medium-closeup'
  | 'medium-shot'
  | 'medium-wide-shot'
  | 'wide-shot'
  | 'extreme-wide-shot';

// Camera preset positions and settings
const CAMERA_PRESETS: Record<CameraPreset, {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}> = {
  'extreme-closeup': {
    position: [0, 1.2, 0.35],
    target: [0, 1.15, 0],
    fov: 50,
  },
  'closeup': {
    position: [0, 1.15, 0.55],
    target: [0, 1.1, 0],
    fov: 45,
  },
  'medium-closeup': {
    position: [0, 1.1, 0.8],
    target: [0, 1.05, 0],
    fov: 40,
  },
  'medium-shot': {
    position: [0, 1.05, 1.1],
    target: [0, 0.95, 0],
    fov: 36,
  },
  'medium-wide-shot': {
    position: [0, 1.0, 1.4],
    target: [0, 0.9, 0],
    fov: 34,
  },
  'wide-shot': {
    position: [0, 0.95, 1.7],
    target: [0, 0.8, 0],
    fov: 32,
  },
  'extreme-wide-shot': {
    position: [0, 0.9, 2.1],
    target: [0, 0.7, 0],
    fov: 30,
  },
};

export interface VrmViewerHandle {
  playVrmaUrl: (url: string, opts?: PlayVrmaOptions) => Promise<void>;
  stopVrma: (fadeOut?: number) => void;
  isVrmLoaded: () => boolean;
  setCameraPreset: (preset: CameraPreset) => void;
  setCameraFree: (enabled: boolean) => void;
  isCameraFree: () => boolean;
}

interface VrmViewerProps {
  modelUrl: string;
  isSpeaking?: boolean;
  audioElement?: HTMLAudioElement | null;
  /** Latest assistant message text — used to drive mood while speaking */
  currentMessage?: string;
  className?: string;
  /** Callback to get current audio level (0–1) for lip sync. Provided by parent after user gesture. */
  getAudioLevel?: () => number;
}

const VrmViewer = forwardRef<VrmViewerHandle, VrmViewerProps>(function VrmViewer(
  { modelUrl, isSpeaking = false, audioElement, currentMessage, className, getAudioLevel },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const rafRef = useRef<number>(0);
  const isSpeakingRef = useRef(isSpeaking);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const isVisibleRef = useRef(true);
  const isMobileRef = useRef(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const vrmaPlayingRef = useRef(false);
  const vrmaActionRef = useRef<THREE.AnimationAction | null>(null);

  // Camera controls refs
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const cameraFreeRef = useRef(false);
  const cameraAnimationRef = useRef<number>(0);

  // Talking animation state
  const talkingClipsRef = useRef<THREE.AnimationClip[]>([]);
  const talkingClipIndexRef = useRef(0);
  const isTalkingPlayingRef = useRef(false);
  const isReturnToRestRef = useRef(false);

  // Idle (default loop) animation state — multi-clip rotation
  const idleClipsRef = useRef<THREE.AnimationClip[]>([]);          // all loaded idle clips
  const idleClipRef = useRef<THREE.AnimationClip | null>(null);    // currently-active idle clip
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const idlePausedForActivityRef = useRef(false);
  const idleLoopCountRef = useRef(0);      // how many loops have completed for current idle clip
  const idleCurrentIndexRef = useRef(0);   // index of currently-playing idle clip
  // How many loops before switching to the next idle clip (randomised per switch)
  const idleLoopsBeforeSwitchRef = useRef(3);
  // Bones currently driven by the active VRMA (idle, talking, or admin preview).
  // Used to skip those bones in procedural micro-gestures so we don't double-add.
  const activeDrivenBonesRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  isSpeakingRef.current = isSpeaking;

  // ── Load talking-category VRMA clips from Supabase ──────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadTalkingClips = async () => {
      const vrm = vrmRef.current;
      if (!vrm) return;
      try {
        const { data } = await supabase
          .from('vrma_animations')
          .select('file_path, name')
          .eq('category', 'talking')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (cancelled || !data || data.length === 0) {
          console.log('[VRMA Talking] No talking clips found');
          return;
        }

        console.log('[VRMA Talking] Loading', data.length, 'talking clip(s)…');
        const clips: THREE.AnimationClip[] = [];
        for (const row of data) {
          try {
            const { data: urlData } = supabase.storage
              .from('vrma-animations')
              .getPublicUrl(row.file_path);
            if (urlData?.publicUrl) {
              const clip = await loadVRMA(urlData.publicUrl, vrm);
              if (!cancelled) {
                // Skip clips that are too short to be useful as talking animations
                // (< 1.5s clips are likely corrupt or single-pose clips)
                if (clip.duration < 1.5) {
                  console.warn('[VRMA Talking] Skipping short clip:', row.name, 'duration:', clip.duration.toFixed(2), 's');
                } else {
                  clips.push(clip);
                  console.log('[VRMA Talking] Loaded:', row.name, '(' + clip.duration.toFixed(2) + 's)');
                }
              }
            }
          } catch (e) {
            console.warn('[VRMA Talking] Failed to load clip:', e);
          }
        }
        if (!cancelled) {
          talkingClipsRef.current = clips;
          talkingClipIndexRef.current = 0;
          console.log('[VRMA Talking] ✓ All', clips.length, 'talking clip(s) ready');
        }
      } catch (e) {
        console.warn('[VRMA Talking] Could not query talking clips:', e);
      }
    };
    // Load immediately instead of delaying — avoids T-pose flash during load
    loadTalkingClips().catch((e) => console.warn('[VRMA Talking] Load error:', e));
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // ── Load ALL idle-category VRMA clips (auto-loop with rotation) ─────────
  useEffect(() => {
    let cancelled = false;
    const loadIdleClips = async () => {
      const vrm = vrmRef.current;
      const mixer = mixerRef.current;
      if (!vrm || !mixer) return;
      try {
        console.log('[VRMA Idle] Starting idle clips load...');
        const { data } = await supabase
          .from('vrma_animations')
          .select('file_path,name')
          .eq('category', 'idle')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (cancelled) {
          console.log('[VRMA Idle] Load cancelled');
          return;
        }

        if (!data || data.length === 0) {
          console.warn('[VRMA Idle] No idle clips found in library — micro-gestures only');
          // Still try to ensure something is active to avoid T-pose
          if (!vrmaPlayingRef.current && !isTalkingPlayingRef.current && !vrmaActionRef.current) {
            console.log('[VRMA Idle] No animation active — waiting for content to arrive');
          }
          return;
        }

        console.log('[VRMA Idle] Loading', data.length, 'idle clip(s)…');
        const clips: THREE.AnimationClip[] = [];
        let firstClipLoaded = false;
        let firstClip: THREE.AnimationClip | null = null;

        // Load clips sequentially, but start animation as soon as first clip is ready
        for (const row of data) {
          try {
            const { data: urlData } = supabase.storage
              .from('vrma-animations')
              .getPublicUrl(row.file_path);
            if (!urlData?.publicUrl) continue;
            const clip = await loadVRMA(urlData.publicUrl, vrm);
            if (!cancelled) {
              clips.push(clip);
              console.log('[VRMA Idle] Loaded:', row.name);

              // AUTO-START on first clip without waiting for others
              // This prevents T-pose flash during loading
              // BUT: Don't start if talking or manual VRMA is already active
              if (!firstClipLoaded && !vrmaActionRef.current && !isTalkingPlayingRef.current && !isSpeakingRef.current) {
                firstClipLoaded = true;
                firstClip = clip;
                idleClipsRef.current = clips; // Update immediately with what we have
                idleCurrentIndexRef.current = 0;
                idleLoopCountRef.current = 0;
                idleLoopsBeforeSwitchRef.current = 3 + Math.floor(Math.random() * 4);

                const m = mixerRef.current;
                if (m) {
                  const action = m.clipAction(clip);
                  action.reset();
                  action.setLoop(THREE.LoopRepeat, Infinity);
                  action.enabled = true;
                  action.weight = 1;
                  action.fadeIn(0.3);
                  action.play();
                  idleActionRef.current = action;
                  vrmaPlayingRef.current = true;
                  activeDrivenBonesRef.current = getClipDrivenBones(clip);
                  console.log('[VRMA Idle] ✓ FIRST CLIP AUTO-STARTED (no T-pose!)');
                }
              } else if (!firstClipLoaded) {
                // First clip loaded but another animation is active — just store it
                firstClipLoaded = true;
                idleClipsRef.current = clips;
                console.log('[VRMA Idle] First clip loaded but another animation is active — stored for later');
              }
            }
          } catch (e) {
            console.warn('[VRMA Idle] Failed to load clip:', e);
          }
        }

        if (cancelled || clips.length === 0) {
          console.warn('[VRMA Idle] No idle clips loaded — will rely on procedural micro-gestures only');
          return;
        }

        // After all clips loaded, shuffle array for random switching
        // (but keep first one active since already started)
        if (clips.length > 1) {
          for (let i = clips.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [clips[i], clips[j]] = [clips[j], clips[i]];
          }
        }

        idleClipsRef.current = clips;
        console.log('[VRMA Idle] All clips loaded (' + clips.length + '). Idle loop active (' + (firstClipLoaded ? 'yes' : 'no') + ')');
      } catch (e) {
        console.warn('[VRMA Idle] Could not load idle clips:', e);
      }
    };
    // Load immediately instead of delaying — avoids T-pose flash during load.
    // This is safe because VRM will be available by the time this effect runs.
    loadIdleClips().catch((e) => console.warn('[VRMA Idle] Load error:', e));
    return () => {
      cancelled = true;
      const action = idleActionRef.current;
      if (action) {
        try { action.stop(); } catch (_) { /* ok */ }
      }
      idleActionRef.current = null;
      idleClipRef.current = null;
      idleClipsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // Helper: (re)start the idle VRMA loop. Picks the current idle clip from the pool.
  // Called after talking ends or admin preview finishes (since playVRMA uncacheRoots
  // every previous action including idle).
  // IMPORTANT: This ensures we never get stuck in T-pose by always returning to idle.
  const restartIdleLoop = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = idleClipsRef.current;

    // If no idle clips loaded, don't try to restart (will just use micro-gestures)
    if (!mixer || clips.length === 0) {
      console.log('[VRMA Idle] No idle clips available to restart — using micro-gestures only');
      return;
    }

    // Don't restart if another action is currently playing
    if (vrmaActionRef.current || isTalkingPlayingRef.current) {
      console.log('[VRMA Idle] Cannot restart — another action is active (vrma:', !!vrmaActionRef.current, 'talking:', isTalkingPlayingRef.current, ')');
      return;
    }

    // Check if idle is already running
    if (idleActionRef.current?.isRunning()) {
      console.log('[VRMA Idle] Already running — no need to restart');
      return;
    }

    const clip = clips[idleCurrentIndexRef.current % clips.length];
    idleClipRef.current = clip;
    try {
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.weight = 1;
      action.fadeIn(0.4);
      action.play();
      idleActionRef.current = action;
      vrmaPlayingRef.current = true;
      activeDrivenBonesRef.current = getClipDrivenBones(clip);
      console.log('[VRMA Idle] ✓ Resumed idle loop, clip index:', idleCurrentIndexRef.current, 'name:', clip.name || 'unnamed');
    } catch (e) {
      console.warn('[VRMA Idle] ✗ Could not restart idle loop:', e);
    }
  }, []);

  // ── Idle clip rotation: switch to next idle clip after N loops ───────────
  // We attach a 'loop' event to the mixer and count completions.
  // After idleLoopsBeforeSwitchRef loops, we cross-fade to the next random idle clip.
  const switchIdleClip = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = idleClipsRef.current;
    if (!mixer || clips.length <= 1) return;
    if (vrmaActionRef.current || isTalkingPlayingRef.current) return;

    // Pick next index — avoid repeating same clip if possible
    let nextIdx: number;
    if (clips.length === 2) {
      nextIdx = idleCurrentIndexRef.current === 0 ? 1 : 0;
    } else {
      do {
        nextIdx = Math.floor(Math.random() * clips.length);
      } while (nextIdx === idleCurrentIndexRef.current);
    }

    idleCurrentIndexRef.current = nextIdx;
    idleLoopCountRef.current = 0;
    // Randomise next switch threshold: 3–7 loops
    idleLoopsBeforeSwitchRef.current = 3 + Math.floor(Math.random() * 5);

    const nextClip = clips[nextIdx];
    idleClipRef.current = nextClip;

    try {
      // Fade out old action
      const oldAction = idleActionRef.current;
      if (oldAction) {
        oldAction.fadeOut(0.6);
      }

      // Create & start new action
      const newAction = mixer.clipAction(nextClip);
      newAction.reset();
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      newAction.enabled = true;
      newAction.weight = 1;
      newAction.fadeIn(0.6);
      newAction.play();
      idleActionRef.current = newAction;
      activeDrivenBonesRef.current = getClipDrivenBones(nextClip);

      console.log(
        `[VRMA Idle] Switched to clip index ${nextIdx}, next switch after`,
        idleLoopsBeforeSwitchRef.current, 'loops'
      );
    } catch (e) {
      console.warn('[VRMA Idle] Failed to switch idle clip:', e);
    }
  }, []);

  // Register mixer 'loop' event listener to count loops and trigger switches.
  // Re-registers whenever the model changes (mixer changes).
  useEffect(() => {
    // The mixer is created during model load (async). We poll with a short
    // interval until the mixer is available, then attach the listener.
    let attached = false;
    let intervalId: ReturnType<typeof setInterval>;

    const attachListener = () => {
      const mixer = mixerRef.current;
      if (!mixer) return;
      if (attached) return;
      attached = true;
      clearInterval(intervalId);

      const onLoop = (e: { action: THREE.AnimationAction }) => {
        // Only count loops for the active idle action
        if (e.action !== idleActionRef.current) return;
        if (vrmaActionRef.current || isTalkingPlayingRef.current) return;
        if (idleClipsRef.current.length <= 1) return;

        idleLoopCountRef.current += 1;
        console.log(
          `[VRMA Idle] Loop #${idleLoopCountRef.current} / ${idleLoopsBeforeSwitchRef.current}`
        );
        if (idleLoopCountRef.current >= idleLoopsBeforeSwitchRef.current) {
          switchIdleClip();
        }
      };

      mixer.addEventListener('loop', onLoop as (e: object) => void);
      console.log('[VRMA Idle] Loop event listener attached');

      // Store cleanup on the ref so we can remove it when mixer changes
      (mixer as unknown as { _tempoLoopHandler?: (e: object) => void })._tempoLoopHandler = onLoop as (e: object) => void;
    };

    intervalId = setInterval(attachListener, 200);
    // Try immediately too
    attachListener();

    return () => {
      clearInterval(intervalId);
      const mixer = mixerRef.current;
      if (mixer) {
        const handler = (mixer as unknown as { _tempoLoopHandler?: (e: object) => void })._tempoLoopHandler;
        if (handler) {
          mixer.removeEventListener('loop', handler);
          delete (mixer as unknown as { _tempoLoopHandler?: (e: object) => void })._tempoLoopHandler;
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading, switchIdleClip]);

  // Reusable: play next talking clip in rotation. Used by TTS-start effect
  // AND by gesture onFinished handler so talking can resume after a gesture.
  const playNextTalking = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = talkingClipsRef.current;
    if (!mixer || clips.length === 0) {
      console.warn('[TTS] Cannot play talking — no mixer or clips available');
      return;
    }
    if (!isTalkingPlayingRef.current) {
      console.log('[TTS] Talking flag is false — not playing next clip');
      return;
    }
    if (vrmaActionRef.current) {
      console.log('[TTS] Manual VRMA active — talking paused');
      return;
    }

    // Pick next clip — advance index first to avoid repeating same clip
    // when called back-to-back (e.g. gesture interrupts then resumes talking)
    const idx = talkingClipIndexRef.current % clips.length;
    talkingClipIndexRef.current = (idx + 1) % clips.length;
    const clip = clips[idx];

    vrmaPlayingRef.current = true;

    // Check if idle action is still running (first talking clip case)
    const idleStillRunning = idleActionRef.current?.isRunning() ?? false;
    // Faster fadeIn: 0.25s feels snappy without being jarring
    const fadeIn = idleStillRunning ? 0.25 : 0.3;

    // Log current mixer state for debugging
    const allActions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
    const activeCount = allActions.filter(a => a.enabled && (a.isRunning() || a.paused)).length;
    console.log('[TTS] Playing talking clip idx:', idx, 'name:', clip.name || 'unnamed',
      'duration:', clip.duration.toFixed(2), 'active actions in mixer:', activeCount);

    const action = playVRMA(mixer, clip, { loop: false, fadeIn });
    if (!action) {
      console.warn('[TTS] Failed to create talking action');
      vrmaPlayingRef.current = false;
      return;
    }
    // Clear idle ref immediately — playVRMA already faded it out.
    // Keeping it set causes the loop event handler to try switching clips
    // while talking is active.
    idleActionRef.current = null;
    activeDrivenBonesRef.current = getClipDrivenBones(clip);

    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== action) return;
      mixer.removeEventListener('finished', onFinished);
      console.log('[TTS] Talking clip finished, isTalking:', isTalkingPlayingRef.current, 'vrmaAction:', !!vrmaActionRef.current);
      // THREE disables LoopOnce actions after 'finished'. Re-enable + pause
      // so it stays as a valid source pose for the next crossfade.
      action.enabled = true;
      action.paused = true;
      if (isTalkingPlayingRef.current && !vrmaActionRef.current) {
        playNextTalking();
      } else {
        vrmaPlayingRef.current = false;
      }
    };
    mixer.addEventListener('finished', onFinished);
  }, []);

  // ── Play talking VRMA when TTS starts, cross-fade back to idle when ends ──
  useEffect(() => {
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;

    if (isSpeaking) {
      // If external VRMA is playing (e.g. admin preview / AI-chosen gesture),
      // don't override it — let it finish, then talking takes over.
      if (vrmaActionRef.current) {
        console.log('[TTS] Gesture active — talking will resume after gesture finishes');
        return;
      }

      const clips = talkingClipsRef.current;
      if (!vrm || !mixer) {
        console.warn('[TTS] VRM or mixer not ready — cannot start talking animation');
        return;
      }

      if (clips.length === 0) {
        console.warn('[TTS] No talking clips loaded yet — will use idle + lip sync only');
        // Set up a retry mechanism to check if clips become available
        const retryInterval = setInterval(() => {
          if (talkingClipsRef.current.length > 0 && isSpeakingRef.current && !isTalkingPlayingRef.current) {
            console.log('[TTS] Talking clips now available — starting talking animation');
            clearInterval(retryInterval);
            isTalkingPlayingRef.current = true;
            idlePausedForActivityRef.current = true;
            playNextTalking();
          }
        }, 200);
        // Clean up after 3 seconds
        setTimeout(() => clearInterval(retryInterval), 3000);
        return;
      }

      isReturnToRestRef.current = false;
      isTalkingPlayingRef.current = true;
      idlePausedForActivityRef.current = true;

      console.log('[TTS] Starting talking animation with', clips.length, 'clips available');
      playNextTalking();
    } else {
      // TTS ended — cross-fade from talking back to idle clip (no T-pose flash).
      if (isTalkingPlayingRef.current) {
        isTalkingPlayingRef.current = false;
        idlePausedForActivityRef.current = false;
        console.log('[TTS] Speaking ended — transitioning back to idle');

        const clips = idleClipsRef.current;
        if (mixer && clips.length > 0) {
          console.log('[TTS] Crossfading to idle clip');
          const idleClip = clips[idleCurrentIndexRef.current % clips.length];
          idleClipRef.current = idleClip;
          // Fast fadeIn (0.25s) so idle starts immediately when TTS ends
          const idleAction = playVRMA(mixer, idleClip, { loop: true, fadeIn: 0.25 });
          if (idleAction) {
            idleActionRef.current = idleAction;
            vrmaPlayingRef.current = true;
            activeDrivenBonesRef.current = getClipDrivenBones(idleClip);
            console.log('[TTS] ✓ Successfully crossfaded to idle');
          } else {
            console.warn('[TTS] ✗ Failed to crossfade to idle — retrying');
            vrmaPlayingRef.current = false;
            setTimeout(() => {
              if (!isSpeakingRef.current && !isTalkingPlayingRef.current) {
                restartIdleLoop();
              }
            }, 300);
          }
        } else if (mixer && vrmaPlayingRef.current) {
          // Fallback: no idle clips loaded yet — fade everything out softly (no T-pose).
          console.log('[TTS] No idle clips loaded — soft fade out and retry');
          isReturnToRestRef.current = true;
          const actions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
          actions.forEach((a) => { try { a.fadeOut(0.5); } catch (_) { /* ok */ } });
          setTimeout(() => {
            isReturnToRestRef.current = false;
            vrmaPlayingRef.current = false;
            // Retry idle loop once
            console.log('[TTS] Retry: checking for idle clips after fade');
            restartIdleLoop();
          }, 600);
        } else {
          console.warn('[TTS] No mixer available for transition');
        }
      }

      // Also reset mouth / mood
      if (vrm) {
        resetMouthExpressions(vrm);
        setTargetMood('neutral');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, restartIdleLoop, playNextTalking]);
  useEffect(() => {
    if (isSpeaking && currentMessage) {
      const mood = detectMood(currentMessage);
      setTargetMood(mood);
    }
  }, [isSpeaking, currentMessage]);

  // Camera animation helper: smoothly animate camera to preset position
  const animateCameraToPreset = useCallback((preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera) return;

    const presetData = CAMERA_PRESETS[preset];
    const startPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3(0, 0.95, 0);
    const endPos = new THREE.Vector3(...presetData.position);
    const endTarget = new THREE.Vector3(...presetData.target);
    const duration = 0.6; // 600ms animation
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      // Easing: ease-out-cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPos, endPos, easeProgress);
      if (controls) {
        controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      } else {
        camera.lookAt(
          THREE.MathUtils.lerp(startTarget.x, endTarget.x, easeProgress),
          THREE.MathUtils.lerp(startTarget.y, endTarget.y, easeProgress),
          THREE.MathUtils.lerp(startTarget.z, endTarget.z, easeProgress)
        );
      }

      camera.fov = THREE.MathUtils.lerp(camera.fov, presetData.fov, easeProgress);
      camera.updateProjectionMatrix();

      if (progress < 1) {
        cameraAnimationRef.current = requestAnimationFrame(animate);
      } else {
        cameraAnimationRef.current = 0;
        if (controls) {
          controls.update();
        }
      }
    };

    if (cameraAnimationRef.current) {
      cancelAnimationFrame(cameraAnimationRef.current);
    }
    cameraAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // Imperative API for parent (admin animation studio etc.)
  useImperativeHandle(ref, () => ({
    isVrmLoaded: () => !!vrmRef.current,
    setCameraPreset: (preset: CameraPreset) => {
      cameraFreeRef.current = false;
      animateCameraToPreset(preset);
      const controls = orbitControlsRef.current;
      if (controls) {
        controls.enabled = false;
      }
    },
    setCameraFree: (enabled: boolean) => {
      cameraFreeRef.current = enabled;
      const controls = orbitControlsRef.current;
      if (controls) {
        controls.enabled = enabled;
      }
    },
    isCameraFree: () => cameraFreeRef.current,
    playVrmaUrl: async (url, opts) => {
      const vrmBefore = vrmRef.current;
      if (!vrmBefore) throw new Error('VRM model belum dimuat');
      console.log('[VRMA] Loading clip from', url);

      const clip = await loadVRMA(url, vrmBefore);

      // Skip clips that are too short — they cause T-pose flash
      if (clip.duration < 1.0) {
        console.warn('[VRMA] Skipping very short clip:', clip.duration.toFixed(2), 's — replace this clip in the admin panel.');
        return;
      }

      // Re-validate VRM after async load — model may have changed
      const vrm = vrmRef.current;
      if (!vrm || vrm !== vrmBefore) {
        console.warn('[VRMA] VRM changed during load — aborting gesture');
        return;
      }

      // If talking is already active AND this is an AI-triggered gesture
      // (isSpeaking = true), only allow it if vrmaActionRef is not already set.
      // This prevents a late-loading gesture from overriding an already-running
      // talking animation when the gesture load took longer than TTS start.
      if (isSpeakingRef.current && isTalkingPlayingRef.current) {
        console.log('[VRMA] Talking already active — skipping late gesture (load took too long)');
        return;
      }

      // Recreate mixer if it was nulled out (or never existed) for the current vrm.
      if (!mixerRef.current) {
        console.log('[VRMA] Recreating mixer for current VRM');
        mixerRef.current = createMixer(vrm);
      }

      const mixer = mixerRef.current;
      // Set vrmaPlayingRef BEFORE calling playVRMA so the animate loop
      // starts updating the mixer on the very next frame.
      vrmaPlayingRef.current = true;
      // Gesture/preview clips: clamp=true so they hold their end pose until
      // the next clip (idle/talking) fades in — prevents snapping to bind pose.
      vrmaActionRef.current = playVRMA(mixer, clip, { clamp: true, ...opts });
      if (!vrmaActionRef.current) {
        vrmaPlayingRef.current = false;
        throw new Error('Gagal memulai animasi (mixer tidak siap)');
      }
      activeDrivenBonesRef.current = getClipDrivenBones(clip);
      console.log('[VRMA] Playback started, duration:', clip.duration.toFixed(2), 's', 'driven bones:', Array.from(activeDrivenBonesRef.current));

      // When admin manually plays VRMA, also stop any talking loop —
      // BUT only if TTS isn't currently active (AI-driven gestures during
      // TTS must allow talking to resume after the gesture finishes).
      if (!isSpeakingRef.current) {
        isTalkingPlayingRef.current = false;
      }

      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === vrmaActionRef.current) {
          mixer.removeEventListener('finished', onFinished);
          // After preview/gesture finishes, decide what to resume:
          //   - If TTS still active → resume talking loop
          //   - If idle clips available → cross-fade to idle (smooth, no T-pose)
          //   - Otherwise → fade out and wait for idle to be ready

          // IMPORTANT: THREE disables a LoopOnce action after it fires 'finished'.
          // Re-enable it briefly so playVRMA can see it as a valid source pose
          // for the crossfade — otherwise prev actions = 0 and the next clip
          // starts from bind pose (T-pose flash).
          const finishedAction = vrmaActionRef.current;
          if (finishedAction) {
            finishedAction.enabled = true;
            finishedAction.paused = true; // hold last frame, don't advance time
          }

          vrmaActionRef.current = null;
          const idleClips = idleClipsRef.current;
          const m = mixerRef.current;

          if (isSpeakingRef.current && talkingClipsRef.current.length > 0) {
            // Talking still ongoing — resume it from where we are. The talking
            // action will cross-fade from the gesture pose smoothly.
            console.log('[VRMA] Gesture finished while speaking — resuming talking');
            isTalkingPlayingRef.current = true;
            idlePausedForActivityRef.current = true;
            playNextTalking();
          } else if (m && idleClips.length > 0) {
            // Idle clips available — smooth cross-fade to idle (never T-pose)
            console.log('[VRMA] Gesture finished — cross-fading to idle');
            const idleClip = idleClips[idleCurrentIndexRef.current % idleClips.length];
            idleClipRef.current = idleClip;
            const idleAction = playVRMA(m, idleClip, { loop: true, fadeIn: 0.5 });
            if (idleAction) {
              idleActionRef.current = idleAction;
              vrmaPlayingRef.current = true;
              activeDrivenBonesRef.current = getClipDrivenBones(idleClip);
            } else {
              console.warn('[VRMA] Failed to play idle clip after gesture');
              vrmaPlayingRef.current = false;
            }
          } else if (m) {
            // No idle clips loaded yet — just fade out current action and set flag
            // so idle loop restarts once clips become available
            console.log('[VRMA] Gesture finished, no idle clips yet — soft fade out');
            isReturnToRestRef.current = true;
            const actions = (m as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
            actions.forEach((a) => { try { a.fadeOut(0.5); } catch (_) { /* ok */ } });
            vrmaPlayingRef.current = false;
            // Try to start idle loop after short delay
            setTimeout(() => {
              isReturnToRestRef.current = false;
              restartIdleLoop();
            }, 600);
          } else {
            console.warn('[VRMA] Gesture finished but no mixer available');
            vrmaPlayingRef.current = false;
          }
        }
      };
      mixer.addEventListener('finished', onFinished);
    },
    stopVrma: (fadeOut = 0.3) => {
      isTalkingPlayingRef.current = false;
      vrmaActionRef.current = null;
      const mixer = mixerRef.current;
      const idleClips = idleClipsRef.current;

      if (mixer && idleClips.length > 0) {
        // Crossfade directly to idle — never go through T-pose.
        // fadeOut old actions via stopVRMA (which only fadeOut, no stopAllAction)
        stopVRMA(mixer, fadeOut);
        // Immediately start idle with a matching fadeIn
        const idleClip = idleClips[idleCurrentIndexRef.current % idleClips.length];
        idleClipRef.current = idleClip;
        const idleAction = playVRMA(mixer, idleClip, { loop: true, fadeIn: fadeOut });
        if (idleAction) {
          idleActionRef.current = idleAction;
          vrmaPlayingRef.current = true;
          activeDrivenBonesRef.current = getClipDrivenBones(idleClip);
        } else {
          vrmaPlayingRef.current = false;
        }
      } else if (mixer) {
        // No idle clips yet — just fade out existing actions softly
        stopVRMA(mixer, fadeOut);
        vrmaPlayingRef.current = false;
        // Try to restart idle once clips are available
        setTimeout(() => restartIdleLoop(), fadeOut * 1000 + 50);
      } else {
        vrmaPlayingRef.current = false;
      }
    },
  }), [animateCameraToPreset, restartIdleLoop, playNextTalking]);

  // Keep latest getAudioLevel in a ref so animate() doesn't need it as a dep.
  // This prevents the main useEffect from re-running (and reloading VRM + mixer)
  // every time the audio analyser reference changes.
  const getAudioLevelRef = useRef<(() => number) | undefined>(getAudioLevel);
  getAudioLevelRef.current = getAudioLevel;

  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);

    if (!isVisibleRef.current) return;

    const now = performance.now();
    const targetInterval = isMobileRef.current ? 1000 / 30 : 1000 / 60;
    const elapsedMs = now - lastFrameTimeRef.current;
    if (elapsedMs < targetInterval) return;
    lastFrameTimeRef.current = now - (elapsedMs % targetInterval);

    const delta = clockRef.current.getDelta();
    const elapsed = clockRef.current.getElapsedTime();
    const vrm = vrmRef.current;
    frameCountRef.current++;

    if (vrm) {
      const runExpressions = !isMobileRef.current || frameCountRef.current % 2 === 0;
      if (runExpressions) {
        updateBlink(delta, vrm);
        updateMicroExpressions(elapsed, vrm, delta);
      }

      const level = isSpeakingRef.current ? (getAudioLevelRef.current?.() ?? 0) : 0;

      // ALWAYS update mixer to prevent T-pose: even with no active actions,
      // mixer.update() is safe and ensures bones stay synchronized with any
      // running animations. This is critical during initial load before clips
      // are ready, and for smooth transitions between animations.
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      } else if (frameCountRef.current % 300 === 0) {
        // Log warning every 5 seconds (at 60fps) if mixer is missing
        console.warn('[Animate] Mixer is null — animations cannot play');
      }

      // Idle micro-gestures (chest-up only): apply ONLY when not talking and
      // not in admin manual playback. Layered on top of idle VRMA, but skip
      // any bones that the active clip already drives to avoid double-add.
      const isManualOrTalking = !!vrmaActionRef.current || isTalkingPlayingRef.current;
      if (!isManualOrTalking) {
        updateIdleMicroGestures(elapsed, vrm, activeDrivenBonesRef.current);
      }
      updateIdleSmile(delta, vrm, isManualOrTalking);

      // Lip sync + expressions ALWAYS run (don't conflict with VRMA bones)
      if (isSpeakingRef.current) {
        vrm.expressionManager?.setValue('aa', 0);
        updateLipSync(level, vrm, delta);
      }

      // Debug: log animation state every 5 seconds (dev only)
      if (import.meta.env.DEV && frameCountRef.current % 600 === 0) {
        console.log('[Animate] State:', {
          idle: idleActionRef.current?.isRunning() ?? false,
          talking: isTalkingPlayingRef.current,
          speaking: isSpeakingRef.current,
        });
      }

      vrm.update(delta);
    }

    // Update OrbitControls if enabled
    if (orbitControlsRef.current && orbitControlsRef.current.enabled) {
      orbitControlsRef.current.update();
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (rendererRef.current) {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current.dispose();
      if (rendererRef.current.domElement.parentNode) {
        rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement);
      }
    }
    if (sceneRef.current) {
      sceneRef.current.clear();
    }
    // NOTE: Don't nullify mixerRef here — the cleanup return below handles
    // disposal. Nullifying at effect start breaks in-flight async playVrmaUrl
    // calls during strict-mode double-invoke.

    if (!modelUrl) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const isMobileView = container.clientWidth < 768;
    isMobileRef.current = isMobileView;
    // Wide framing: waist → head visible on all devices.
    const camera = new THREE.PerspectiveCamera(
      isMobileView ? 38 : 34,
      container.clientWidth / container.clientHeight,
      0.1,
      20
    );
    camera.position.set(0, isMobileView ? 1.0 : 1.05, isMobileView ? 1.8 : 1.6);
    camera.lookAt(0, 0.95, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isMobileView,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (webglErr) {
      console.warn('WebGL not available in this environment:', webglErr);
      setError('WebGL is not supported in this environment. Please open the app directly in a browser.');
      setLoading(false);
      return;
    }
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileView ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize OrbitControls (disabled by default)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.95, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.enabled = false; // disabled by default, only enable when user switches to free mode
    controls.update();
    orbitControlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0x88cccc, 0.8);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1, 2, 2);
    scene.add(keyLight);
    if (!isMobileView) {
      const fillLight = new THREE.DirectionalLight(0x40e0d0, 0.4);
      fillLight.position.set(-2, 1, 0);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0x9966ff, 0.3);
      rimLight.position.set(0, 1, -2);
      scene.add(rimLight);
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          setError('File bukan VRM yang valid');
          setLoading(false);
          return;
        }
        try { VRMUtils.rotateVRM0(vrm); } catch (_) { /* VRM1 — skip */ }
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        mixerRef.current = createMixer(vrm);
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('VRM load error:', err);
        setError(`Gagal memuat model VRM: ${(err as Error).message ?? err}`);
        setLoading(false);
      }
    );

    clockRef.current = new THREE.Clock();
    clockRef.current.start();
    lastFrameTimeRef.current = performance.now();
    frameCountRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      if (!container) return;
      const wasMobile = isMobileRef.current;
      const nowMobile = container.clientWidth < 768;
      isMobileRef.current = nowMobile;

      // Only reset camera if not in free mode
      if (!cameraFreeRef.current) {
        camera.fov = nowMobile ? 38 : 34;
        camera.position.set(0, nowMobile ? 1.0 : 1.05, nowMobile ? 1.8 : 1.6);
        camera.lookAt(0, 0.95, 0);
      }

      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      if (wasMobile !== nowMobile) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, nowMobile ? 1.5 : 2));
      }

      if (orbitControlsRef.current) {
        orbitControlsRef.current.handleResize?.();
      }
    };
    window.addEventListener('resize', onResize);

    const onVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(rafRef.current);
      if (cameraAnimationRef.current) {
        cancelAnimationFrame(cameraAnimationRef.current);
      }
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      orbitControlsRef.current?.dispose();
      orbitControlsRef.current = null;
      // IMPORTANT: Do NOT call stopAllAction() — it causes an immediate T-pose snap.
      // Let THREE handle cleanup naturally on mixer dispose.
      // Just clear the ref and let GC clean up.
      mixerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className ?? ''}`}>
      {!modelUrl && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <span className="text-4xl">🤖</span>
            <span className="text-sm text-muted-foreground font-mono">Upload a VRM file to display your avatar</span>
          </div>
        </div>
      )}
      {loading && modelUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-sm text-muted-foreground font-mono">Loading VRM…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-destructive font-mono">{error}</span>
        </div>
      )}
    </div>
  );
});

export default VrmViewer;
