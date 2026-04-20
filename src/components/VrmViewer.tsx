import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import {
  updateBlink,
  updateMicroExpressions,
  updateLipSync,
  resetMouthExpressions,
  setTargetMood,
  updateIdleMicroGestures,
  getClipDrivenBones,
} from '@/lib/vrm-animations';
import { detectMood } from '@/lib/sentiment';
import { useAudioAnalyser } from '@/hooks/useAudioAnalyser';
import { loadVRMA, createMixer, playVRMA, stopVRMA, returnToRestPose, type PlayVrmaOptions } from '@/lib/vrma-player';
import { supabase } from '@/integrations/supabase/client';

export interface VrmViewerHandle {
  playVrmaUrl: (url: string, opts?: PlayVrmaOptions) => Promise<void>;
  stopVrma: (fadeOut?: number) => void;
  isVrmLoaded: () => boolean;
}

interface VrmViewerProps {
  modelUrl: string;
  isSpeaking?: boolean;
  audioElement?: HTMLAudioElement | null;
  /** Latest assistant message text — used to drive mood while speaking */
  currentMessage?: string;
  className?: string;
}

const VrmViewer = forwardRef<VrmViewerHandle, VrmViewerProps>(function VrmViewer(
  { modelUrl, isSpeaking = false, audioElement, currentMessage, className },
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

  // Talking animation state
  const talkingClipsRef = useRef<THREE.AnimationClip[]>([]);
  const talkingClipIndexRef = useRef(0);
  const isTalkingPlayingRef = useRef(false);
  const isReturnToRestRef = useRef(false);

  // Idle (default loop) animation state
  const idleClipRef = useRef<THREE.AnimationClip | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const idlePausedForActivityRef = useRef(false);
  // Bones currently driven by the active VRMA (idle, talking, or admin preview).
  // Used to skip those bones in procedural micro-gestures so we don't double-add.
  const activeDrivenBonesRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectAudioElement, getAudioLevel, disconnect: disconnectAudio } = useAudioAnalyser();

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
          .select('file_path')
          .eq('category', 'talking')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (cancelled || !data || data.length === 0) return;

        const clips: THREE.AnimationClip[] = [];
        for (const row of data) {
          try {
            const { data: urlData } = supabase.storage
              .from('vrma-animations')
              .getPublicUrl(row.file_path);
            if (urlData?.publicUrl) {
              const clip = await loadVRMA(urlData.publicUrl, vrm);
              if (!cancelled) clips.push(clip);
            }
          } catch (e) {
            console.warn('[VRMA Talking] Failed to load clip:', e);
          }
        }
        if (!cancelled) {
          talkingClipsRef.current = clips;
          talkingClipIndexRef.current = 0;
          console.log('[VRMA Talking] Loaded', clips.length, 'talking clip(s)');
        }
      } catch (e) {
        console.warn('[VRMA Talking] Could not query talking clips:', e);
      }
    };
    // Delay to ensure VRM is mounted
    const timer = setTimeout(loadTalkingClips, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // ── Load idle-category VRMA (auto-loop default) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadIdleClip = async () => {
      const vrm = vrmRef.current;
      const mixer = mixerRef.current;
      if (!vrm || !mixer) return;
      try {
        const { data } = await supabase
          .from('vrma_animations')
          .select('file_path,name')
          .eq('category', 'idle')
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(1);

        if (cancelled || !data || data.length === 0) {
          console.log('[VRMA Idle] No idle clip found in library — micro-gestures only');
          return;
        }

        const row = data[0];
        const { data: urlData } = supabase.storage
          .from('vrma-animations')
          .getPublicUrl(row.file_path);
        if (!urlData?.publicUrl) return;

        const clip = await loadVRMA(urlData.publicUrl, vrm);
        if (cancelled) return;
        idleClipRef.current = clip;
        console.log('[VRMA Idle] Loaded idle clip:', row.name);

        // Auto-play looped idle if nothing else is active
        const m = mixerRef.current;
        if (m && !vrmaActionRef.current && !isTalkingPlayingRef.current) {
          // Use a separate clipAction so we don't trigger the global uncacheRoot in playVRMA
          const action = m.clipAction(clip);
          action.reset();
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.enabled = true;
          action.weight = 1;
          action.fadeIn(0.5);
          action.play();
          idleActionRef.current = action;
          vrmaPlayingRef.current = true;
          activeDrivenBonesRef.current = getClipDrivenBones(clip);
          console.log('[VRMA Idle] Auto-loop started, driven bones:', Array.from(activeDrivenBonesRef.current));
        }
      } catch (e) {
        console.warn('[VRMA Idle] Could not load idle clip:', e);
      }
    };
    const timer = setTimeout(loadIdleClip, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      const action = idleActionRef.current;
      if (action) {
        try { action.stop(); } catch (_) { /* ok */ }
      }
      idleActionRef.current = null;
      idleClipRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // Helper: (re)start the idle VRMA loop if a clip is loaded and nothing else is active.
  // Called after talking ends or admin preview finishes (since playVRMA uncacheRoots
  // every previous action including idle).
  const restartIdleLoop = useCallback(() => {
    const mixer = mixerRef.current;
    const clip = idleClipRef.current;
    if (!mixer || !clip) return;
    if (vrmaActionRef.current || isTalkingPlayingRef.current) return;
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
      console.log('[VRMA Idle] Resumed idle loop');
    } catch (e) {
      console.warn('[VRMA Idle] Could not restart idle loop:', e);
    }
  }, []);

  // ── Play talking VRMA when TTS starts, return to rest when TTS ends ──────
  useEffect(() => {
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;

    if (isSpeaking) {
      // If external VRMA is playing (e.g. admin preview), don't override it
      if (vrmaActionRef.current) return;

      const clips = talkingClipsRef.current;
      if (!vrm || !mixer || clips.length === 0) return;

      isReturnToRestRef.current = false;
      isTalkingPlayingRef.current = true;

      const playNext = () => {
        if (!isTalkingPlayingRef.current) return;
        if (vrmaActionRef.current) return; // manual VRMA took over

        const clips = talkingClipsRef.current;
        if (clips.length === 0) return;

        const clip = clips[talkingClipIndexRef.current % clips.length];
        talkingClipIndexRef.current = (talkingClipIndexRef.current + 1) % clips.length;

        vrmaPlayingRef.current = true;
        const action = playVRMA(mixer, clip, { loop: false, fadeIn: 0.3 });
        if (!action) { vrmaPlayingRef.current = false; return; }

        // When this clip ends, play next (loop through talking clips)
        const onFinished = (e: { action: THREE.AnimationAction }) => {
          if (e.action !== action) return;
          mixer.removeEventListener('finished', onFinished);
          if (isTalkingPlayingRef.current && !vrmaActionRef.current) {
            playNext();
          } else {
            vrmaPlayingRef.current = false;
          }
        };
        mixer.addEventListener('finished', onFinished);
      };

      playNext();
    } else {
      // TTS ended — stop talking animation and return to rest pose
      if (isTalkingPlayingRef.current) {
        isTalkingPlayingRef.current = false;
        isReturnToRestRef.current = true;

        if (vrm && mixer && vrmaPlayingRef.current) {
          returnToRestPose(mixer, vrm, 0.6).then(() => {
            vrmaPlayingRef.current = false;
            isReturnToRestRef.current = false;
            // Restart idle loop after returning to rest
            restartIdleLoop();
          });
        } else {
          restartIdleLoop();
        }
      }

      // Also reset mouth / mood
      if (vrm) {
        resetMouthExpressions(vrm);
        setTargetMood('neutral');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking]);
  useEffect(() => {
    if (!audioElement) return;
    try {
      connectAudioElement(audioElement);
    } catch (e) {
      console.warn('Could not connect audio element:', e);
    }
  }, [audioElement, connectAudioElement]);

  useEffect(() => {
    if (isSpeaking && currentMessage) {
      const mood = detectMood(currentMessage);
      setTargetMood(mood);
    }
  }, [isSpeaking, currentMessage]);

  // Imperative API for parent (admin animation studio etc.)
  useImperativeHandle(ref, () => ({
    isVrmLoaded: () => !!vrmRef.current,
    playVrmaUrl: async (url, opts) => {
      const vrmBefore = vrmRef.current;
      if (!vrmBefore) throw new Error('VRM model belum dimuat');
      console.log('[VRMA] Loading clip from', url);

      // Load + parse can take time. Re-validate refs AFTER the await.
      const vrm = vrmRef.current;
      if (!vrm) {
        throw new Error('Model di-reload selama loading VRMA — coba lagi');
      }

      // If VRM changed while loading, re-load clip against the current model
      const targetVrm = vrm !== vrmBefore ? vrm : vrmBefore;
      if (vrm !== vrmBefore) {
        console.warn('[VRMA] VRM changed during load — re-loading clip for new model');
      }
      const clip = await loadVRMA(url, targetVrm);

      // Recreate mixer if it was nulled out (or never existed) for the current vrm.
      if (!mixerRef.current) {
        console.log('[VRMA] Recreating mixer for current VRM');
        mixerRef.current = createMixer(targetVrm);
      }

      // Reset pose to rest before applying new clip — prevents residual pose snap
      try {
        targetVrm.humanoid?.resetNormalizedPose();
      } catch (e) {
        console.warn('[VRMA] resetNormalizedPose failed (safe to ignore):', e);
      }

      const mixer = mixerRef.current;
      // Set vrmaPlayingRef BEFORE calling playVRMA so the animate loop
      // starts updating the mixer on the very next frame.
      vrmaPlayingRef.current = true;
      vrmaActionRef.current = playVRMA(mixer, clip, opts);
      if (!vrmaActionRef.current) {
        vrmaPlayingRef.current = false;
        throw new Error('Gagal memulai animasi (mixer tidak siap)');
      }
      console.log('[VRMA] Playback started, duration:', clip.duration.toFixed(2), 's');

      // When admin manually plays VRMA, also stop any talking loop
      isTalkingPlayingRef.current = false;

      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === vrmaActionRef.current) {
          mixer.removeEventListener('finished', onFinished);
          // After admin preview clip finishes, return to rest automatically
          const vrm = vrmRef.current;
          if (vrm) {
            returnToRestPose(mixer, vrm, 0.5).then(() => {
              vrmaPlayingRef.current = false;
              vrmaActionRef.current = null;
              restartIdleLoop();
            });
          } else {
            vrmaPlayingRef.current = false;
            vrmaActionRef.current = null;
            restartIdleLoop();
          }
          console.log('[VRMA] Playback finished — returning to rest pose');
        }
      };
      mixer.addEventListener('finished', onFinished);
    },
    stopVrma: (fadeOut = 0.3) => {
      isTalkingPlayingRef.current = false;
      const vrm = vrmRef.current;
      if (vrm && mixerRef.current) {
        returnToRestPose(mixerRef.current, vrm, fadeOut).then(() => {
          vrmaPlayingRef.current = false;
          vrmaActionRef.current = null;
          restartIdleLoop();
        });
      } else {
        stopVRMA(mixerRef.current, fadeOut);
        vrmaPlayingRef.current = false;
        vrmaActionRef.current = null;
        restartIdleLoop();
      }
    },
  }), []);

  // Keep latest getAudioLevel in a ref so animate() doesn't need it as a dep.
  // This prevents the main useEffect from re-running (and reloading VRM + mixer)
  // every time the audio analyser reference changes.
  const getAudioLevelRef = useRef(getAudioLevel);
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

      const level = isSpeakingRef.current ? getAudioLevelRef.current() : 0;

      // Update VRMA mixer when active OR during return-to-rest fade
      if (mixerRef.current && (vrmaPlayingRef.current || isReturnToRestRef.current)) {
        mixerRef.current.update(delta);
      }

      // Idle micro-gestures (chest-up only): apply ONLY when not talking and
      // not in admin manual playback. Layered on top of idle VRMA (head-only).
      const isManualOrTalking = !!vrmaActionRef.current || isTalkingPlayingRef.current;
      if (!isManualOrTalking) {
        updateIdleMicroGestures(elapsed, vrm);
      }

      // Lip sync + expressions ALWAYS run (don't conflict with VRMA bones)
      if (isSpeakingRef.current) {
        vrm.expressionManager?.setValue('aa', 0);
        updateLipSync(level, vrm, delta);
      }

      vrm.update(delta);
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
    // Close-up framing: waist → head
    const camera = new THREE.PerspectiveCamera(
      isMobileView ? 26 : 22,
      container.clientWidth / container.clientHeight,
      0.1,
      20
    );
    camera.position.set(0, isMobileView ? 1.42 : 1.45, isMobileView ? 1.15 : 0.95);
    camera.lookAt(0, 1.35, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobileView,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileView ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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
      camera.fov = nowMobile ? 26 : 22;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      if (wasMobile !== nowMobile) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, nowMobile ? 1.5 : 2));
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
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      disconnectAudio();
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
