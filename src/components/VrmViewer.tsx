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
} from '@/lib/vrm-animations';
import { detectMood } from '@/lib/sentiment';
import { createMixer, playVRMA } from '@/lib/vrma-player';
import { initLookAt, updateLookAt, setLookAtEnabled } from '@/lib/vrm-lookat';
import { initSpringBones, updateSpringBones } from '@/lib/vrm-spring';
import { getWebSpeechLipLevel } from '@/lib/web-speech-tts';
import type { PlayVrmaOptions } from '@/lib/vrma-player';
import {
  computeAdaptivePresets,
  CAMERA_PRESETS_STATIC,
  type CameraPreset,
  type CameraPresetData,
} from '@/lib/camera-presets';
import { useVrmaAnimations } from '@/hooks/useVrmaAnimations';

export type { CameraPreset };

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
  isWebSpeechActive?: boolean;
  audioElement?: HTMLAudioElement | null;
  currentMessage?: string;
  className?: string;
  getAudioLevel?: () => number;
}

const VrmViewer = forwardRef<VrmViewerHandle, VrmViewerProps>(function VrmViewer(
  { modelUrl, isSpeaking = false, isWebSpeechActive = false, audioElement, currentMessage, className, getAudioLevel },
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

  // Camera
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const cameraFreeRef = useRef(false);
  const cameraAnimationRef = useRef<number>(0);
  const adaptivePresetsRef = useRef<Record<CameraPreset, CameraPresetData> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  isSpeakingRef.current = isSpeaking;

  // ── Animation system ──────────────────────────────────────────────────────
  const {
    mixerRef,
    vrmaPlayingRef,
    vrmaActionRef,
    talkingClipsRef,
    isTalkingPlayingRef,
    isReturnToRestRef,
    idleClipsRef,
    idleClipRef,
    idleActionRef,
    idlePausedForActivityRef,
    idleCurrentIndexRef,
    activeDrivenBonesRef,
    restartIdleLoop,
    playNextTalking,
    playVrmaUrl,
    stopVrmaImperative,
  } = useVrmaAnimations(vrmRef, isSpeakingRef, modelUrl, loading);

  // ── Sync mixer ref to VRM after load ─────────────────────────────────────
  // The mixer is created inside the main useEffect after VRM loads.
  // useVrmaAnimations reads mixerRef directly so no extra wiring needed.

  // ── Talking / idle transitions driven by isSpeaking ──────────────────────
  useEffect(() => {
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;

    if (isSpeaking) {
      if (vrmaActionRef.current) return; // gesture active — wait for it to finish

      const clips = talkingClipsRef.current;
      if (!vrm || !mixer) return;

      if (clips.length === 0) {
        // Retry until clips arrive (max 3s)
        const retryId = setInterval(() => {
          if (talkingClipsRef.current.length > 0 && isSpeakingRef.current && !isTalkingPlayingRef.current) {
            clearInterval(retryId);
            isTalkingPlayingRef.current = true;
            idlePausedForActivityRef.current = true;
            playNextTalking();
          }
        }, 200);
        setTimeout(() => clearInterval(retryId), 3000);
        return;
      }

      isReturnToRestRef.current = false;
      isTalkingPlayingRef.current = true;
      idlePausedForActivityRef.current = true;
      playNextTalking();
    } else {
      if (isTalkingPlayingRef.current) {
        isTalkingPlayingRef.current = false;
        idlePausedForActivityRef.current = false;

        const clips = idleClipsRef.current;
        if (mixer && clips.length > 0) {
          const idleClip = clips[idleCurrentIndexRef.current % clips.length];
          idleClipRef.current = idleClip;
          const idleAction = playVRMA(mixer, idleClip, { loop: true, fadeIn: 0.25 });
          if (idleAction) {
            idleActionRef.current = idleAction;
            vrmaPlayingRef.current = true;
          } else {
            vrmaPlayingRef.current = false;
            setTimeout(() => {
              if (!isSpeakingRef.current && !isTalkingPlayingRef.current) restartIdleLoop();
            }, 300);
          }
        } else if (mixer && vrmaPlayingRef.current) {
          isReturnToRestRef.current = true;
          const actions = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
          actions.forEach((a) => { try { a.fadeOut(0.5); } catch (_) { /* ok */ } });
          setTimeout(() => {
            isReturnToRestRef.current = false;
            vrmaPlayingRef.current = false;
            restartIdleLoop();
          }, 600);
        }
      }

      if (vrm) {
        resetMouthExpressions(vrm);
        setTargetMood('neutral');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, restartIdleLoop, playNextTalking]);

  useEffect(() => {
    if (isSpeaking && currentMessage) {
      setTargetMood(detectMood(currentMessage));
    }
  }, [isSpeaking, currentMessage]);

  // ── Camera animation ──────────────────────────────────────────────────────
  const animateCameraToPreset = useCallback((preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera) return;

    const presets = adaptivePresetsRef.current ?? CAMERA_PRESETS_STATIC;
    const presetData = presets[preset];
    const startPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3(0, 0.95, 0);
    const endPos = new THREE.Vector3(...presetData.position);
    const endTarget = new THREE.Vector3(...presetData.target);
    const duration = 0.6;
    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / (duration * 1000), 1);
      const t = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      camera.position.lerpVectors(startPos, endPos, t);
      if (controls) {
        controls.target.lerpVectors(startTarget, endTarget, t);
      } else {
        camera.lookAt(
          THREE.MathUtils.lerp(startTarget.x, endTarget.x, t),
          THREE.MathUtils.lerp(startTarget.y, endTarget.y, t),
          THREE.MathUtils.lerp(startTarget.z, endTarget.z, t),
        );
      }
      camera.fov = THREE.MathUtils.lerp(camera.fov, presetData.fov, t);
      camera.updateProjectionMatrix();

      if (progress < 1) {
        cameraAnimationRef.current = requestAnimationFrame(animate);
      } else {
        cameraAnimationRef.current = 0;
        controls?.update();
      }
    };

    if (cameraAnimationRef.current) cancelAnimationFrame(cameraAnimationRef.current);
    cameraAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Imperative handle ─────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    isVrmLoaded: () => !!vrmRef.current,
    setCameraPreset: (preset) => {
      cameraFreeRef.current = false;
      animateCameraToPreset(preset);
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = false;
    },
    setCameraFree: (enabled) => {
      cameraFreeRef.current = enabled;
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = enabled;
      setLookAtEnabled(!enabled); // disable look-at in free camera mode
    },
    isCameraFree: () => cameraFreeRef.current,
    playVrmaUrl,
    stopVrma: stopVrmaImperative,
  }), [animateCameraToPreset, playVrmaUrl, stopVrmaImperative]);

  // Keep getAudioLevel stable across renders
  const getAudioLevelRef = useRef<(() => number) | undefined>(getAudioLevel);
  getAudioLevelRef.current = getAudioLevel;
  const isWebSpeechActiveRef = useRef(isWebSpeechActive);
  isWebSpeechActiveRef.current = isWebSpeechActive;

  // ── Render loop ───────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);
    if (!isVisibleRef.current) return;

    const now = performance.now();
    // Target: 60fps desktop, 30fps mobile
    const targetInterval = isMobileRef.current ? 1000 / 30 : 1000 / 60;
    const elapsed = now - lastFrameTimeRef.current;
    if (elapsed < targetInterval) return;
    lastFrameTimeRef.current = now - (elapsed % targetInterval);

    const delta = Math.min(clockRef.current.getDelta(), 0.1);
    const elapsedTime = clockRef.current.getElapsedTime();
    const vrm = vrmRef.current;
    frameCountRef.current++;

    if (vrm) {
      // On mobile: run expressions every other frame to save CPU
      const runExpressions = !isMobileRef.current || frameCountRef.current % 3 === 0;

      // 1. Update mixer first — VRMA clips drive bones
      mixerRef.current?.update(delta);

      // 2. Expression overrides (run after mixer so they win)
      if (runExpressions) {
        updateMicroExpressions(elapsedTime, vrm, delta);
      }

      // 3. Procedural micro-gestures (skip when talking/gesture active)
      const isManualOrTalking = !!vrmaActionRef.current || isTalkingPlayingRef.current;
      if (!isManualOrTalking && (!isMobileRef.current || frameCountRef.current % 2 === 0)) {
        updateIdleMicroGestures(elapsedTime, vrm, activeDrivenBonesRef.current);
      }
      if (!isMobileRef.current || frameCountRef.current % 2 === 0) {
        updateIdleSmile(delta, vrm, isManualOrTalking);
      }

      // 4. Look-at ALWAYS runs after mixer — passes empty set so it always
      //    overrides neck/head even when VRMA clips drive those bones.
      //    This is intentional: look-at should always win over animation.
      if (cameraRef.current && !cameraFreeRef.current) {
        updateLookAt(delta, vrm, cameraRef.current, new Set());
      }

      // 5. Lip sync
      if (isSpeakingRef.current) {
        vrm.expressionManager?.setValue('aa', 0);
        const level = isWebSpeechActiveRef.current
          ? getWebSpeechLipLevel(delta)
          : (getAudioLevelRef.current?.() ?? 0);
        updateLipSync(level, vrm, delta);
      }

      // 5. Apply all expression weights to morph targets
      vrm.update(delta);

      // 6. Spring bones — secondary motion (hair, accessories, etc.)
      //    Runs after vrm.update() so it adds on top of the base pose
      updateSpringBones(delta, vrm);

      // 7. Blink MUST run after vrm.update() every frame (no throttle)
      updateBlink(delta, vrm);
    }

    if (orbitControlsRef.current?.enabled) {
      orbitControlsRef.current.update();
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  // ── Three.js setup & VRM load ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Dispose previous renderer
    if (rendererRef.current) {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current.dispose();
      rendererRef.current.domElement.parentNode?.removeChild(rendererRef.current.domElement);
    }
    sceneRef.current?.clear();
    adaptivePresetsRef.current = null;

    if (!modelUrl) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const isMobile = container.clientWidth < 768;
    isMobileRef.current = isMobile;

    const camera = new THREE.PerspectiveCamera(
      isMobile ? 38 : 34,
      container.clientWidth / container.clientHeight,
      0.1,
      20,
    );
    camera.position.set(0, isMobile ? 1.0 : 1.05, isMobile ? 1.8 : 1.6);
    camera.lookAt(0, 0.95, 0);
    cameraRef.current = camera;

    // Check WebGL support before attempting to create renderer
    const canvas = document.createElement('canvas');
    const webgl2 = canvas.getContext('webgl2');
    const webgl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!webgl2 && !webgl1) {
      setError('WebGL tidak didukung di browser ini. Coba aktifkan hardware acceleration di pengaturan browser.');
      setLoading(false);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance',
        // Fallback to WebGL1 if WebGL2 not available
        ...(webgl2 ? {} : { context: webgl1 as WebGLRenderingContext }),
      });
    } catch (e) {
      // Second attempt: minimal settings
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
      } catch (e2) {
        setError('WebGL tidak dapat diinisialisasi. Pastikan hardware acceleration diaktifkan di browser Anda.');
        setLoading(false);
        return;
      }
    }

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls (disabled by default)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.95, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.enabled = false;
    controls.update();
    orbitControlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0x88cccc, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1, 2, 2);
    scene.add(keyLight);
    if (!isMobile) {
      const fill = new THREE.DirectionalLight(0x40e0d0, 0.4);
      fill.position.set(-2, 1, 0);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0x9966ff, 0.3);
      rim.position.set(0, 1, -2);
      scene.add(rim);
    }

    // Load VRM
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) { setError('File bukan VRM yang valid'); setLoading(false); return; }
        try { VRMUtils.rotateVRM0(vrm); } catch (_) { /* VRM1 */ }
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        mixerRef.current = createMixer(vrm);

        // Init spring bones for secondary motion
        initSpringBones(vrm);

        requestAnimationFrame(() => {
          const presets = computeAdaptivePresets(vrm);
          adaptivePresetsRef.current = presets;
          if (cameraRef.current && !cameraFreeRef.current) {
            const ms = presets['medium-shot'];
            cameraRef.current.position.set(...ms.position);
            cameraRef.current.fov = ms.fov;
            cameraRef.current.updateProjectionMatrix();
            if (orbitControlsRef.current) {
              orbitControlsRef.current.target.set(...ms.target);
              orbitControlsRef.current.update();
            } else {
              cameraRef.current.lookAt(...ms.target);
            }
          }
        });

        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('VRM load error:', err);
        setError(`Gagal memuat model VRM: ${(err as Error).message ?? err}`);
        setLoading(false);
      },
    );

    clockRef.current = new THREE.Clock();
    clockRef.current.start();
    lastFrameTimeRef.current = performance.now();
    frameCountRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    // Init look-at mouse tracking
    const cleanupLookAt = initLookAt(container);

    const onResize = () => {
      if (!container) return;
      const wasMobile = isMobileRef.current;
      const nowMobile = container.clientWidth < 768;
      isMobileRef.current = nowMobile;

      if (vrmRef.current && wasMobile !== nowMobile && adaptivePresetsRef.current) {
        adaptivePresetsRef.current = computeAdaptivePresets(vrmRef.current);
      }
      if (!cameraFreeRef.current && adaptivePresetsRef.current) {
        const p = adaptivePresetsRef.current['medium-shot'];
        camera.position.set(...p.position);
        camera.fov = p.fov;
        camera.lookAt(...p.target);
        orbitControlsRef.current?.target.set(...p.target);
      }
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      if (wasMobile !== nowMobile) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, nowMobile ? 1.5 : 2));
      }
      orbitControlsRef.current?.handleResize?.();
    };

    const onVisibility = () => { isVisibleRef.current = document.visibilityState === 'visible'; };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      cleanupLookAt();
      cancelAnimationFrame(rafRef.current);
      if (cameraAnimationRef.current) cancelAnimationFrame(cameraAnimationRef.current);
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      orbitControlsRef.current?.dispose();
      orbitControlsRef.current = null;
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
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3 text-center max-w-xs">
            <span className="text-2xl">⚠️</span>
            <span className="text-sm text-destructive font-mono">{error}</span>
            {error.toLowerCase().includes('webgl') && (
              <a
                href="https://get.webgl.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Cek dukungan WebGL browser Anda
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default VrmViewer;
