import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import {
  updateBlink,
  setBlinkSpeakingMode,
  updateLipSync,
  resetMouthExpressions,
  updateIdleMicroGestures,
  setGestureIntensity,
} from '@/lib/vrm-animations';

import { detectMood } from '@/lib/sentiment';
import {
  initIdleExpression,
  updateIdleExpression,
  setIdleExpressionPaused,
  setIdleExpressionManual,
  applyMoodOverride,
  debugExpressionKeys,
  forceResetIdleExpressions,
  fadeOutIdleExpressions,
} from '@/lib/idle-expression-advanced';
import { createMixer, playVRMA } from '@/lib/vrma-player';
import { initLookAt, updateLookAt, setLookAtEnabled } from '@/lib/vrm-lookat';
import { initSpringBones, updateSpringBones } from '@/lib/vrm-spring';
import { getWebSpeechLipLevel } from '@/lib/web-speech-tts';
import { createEnvironmentManager, type EnvironmentManager } from '@/lib/vrm-environment';
import { createLightingManager, type LightingManager, type LightingConfig } from '@/lib/vrm-lighting';
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
  /** Apply a map of blendshape key → weight (0–1) directly to the loaded VRM. */
  applyBlendshape: (weights: Record<string, number>) => void;
  /** Reset all expression weights to 0. */
  clearBlendshape: () => void;
  /** Enable/disable automatic mood expressions (for manual blendshape preview). */
  setManualBlendshapeMode: (enabled: boolean) => void;
  /** Set environment background */
  setEnvironment: (preset: string) => void;
  /** Set image background */
  setImageBackground: (imageUrl: string) => void;
  /** Get current environment preset */
  getCurrentEnvironment: () => string | null;
  /** Update lighting configuration */
  setLighting: (config: LightingConfig) => void;
  /** Get current lighting configuration */
  getCurrentLighting: () => LightingConfig | null;
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
  const manualBlendshapeRef = useRef(false); // true = skip auto mood expressions

  // Camera
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const cameraFreeRef = useRef(false);
  const cameraAnimationRef = useRef<number>(0);
  const adaptivePresetsRef = useRef<Record<CameraPreset, CameraPresetData> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const isFadingOutRef = useRef(false); // Track if we're fading out idle expression
  const vrmSceneHiddenRef = useRef<THREE.Group | null>(null); // Store VRM scene before adding to main scene
  const mixerUpdateCountRef = useRef(0); // Count mixer updates before showing model
  const environmentManagerRef = useRef<EnvironmentManager | null>(null);
  const lightingManagerRef = useRef<LightingManager | null>(null);

  isSpeakingRef.current = isSpeaking;

  // Pause/resume idle expression saat speaking berubah
  useEffect(() => {
    if (isSpeaking) {
      // Start fade out when TTS begins
      isFadingOutRef.current = true;
      // Fade out body gestures smoothly
      setGestureIntensity(0.0); // Target 0, will lerp smoothly
      console.log('[Idle Expression] Starting fade out for TTS...');
      console.log('[Body Gestures] Fading out...');
    } else {
      // Resume when TTS ends
      isFadingOutRef.current = false;
      setIdleExpressionPaused(false);
      // Fade in body gestures smoothly
      setGestureIntensity(1.0); // Target 1, will lerp smoothly
      console.log('[Body Gestures] Fading in...');
    }
    setBlinkSpeakingMode(isSpeaking);
  }, [isSpeaking]);

  // Mood override dari AI reply
  useEffect(() => {
    if (!currentMessage || !isSpeaking) return;
    const mood = detectMood(currentMessage);
    if (mood !== 'neutral' && vrmRef.current) {
      applyMoodOverride(mood, 4, vrmRef.current);
    }
  }, [currentMessage, isSpeaking]);

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
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, restartIdleLoop, playNextTalking]);

  useEffect(() => {
    if (!isSpeaking && vrmRef.current) {
      resetMouthExpressions(vrmRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking]);

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
    applyBlendshape: (weights: Record<string, number>) => {
      const vrm = vrmRef.current;
      if (!vrm?.expressionManager) return;
      manualBlendshapeRef.current = true; // pause auto mood
      for (const [key, value] of Object.entries(weights)) {
        const v = Math.max(0, Math.min(1, value));
        try { vrm.expressionManager.setValue(key, v); } catch (_) { /* ok */ }
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        if (camel !== key) { try { vrm.expressionManager.setValue(camel, v); } catch (_) { /* ok */ } }
      }
    },
    clearBlendshape: () => {
      const vrm = vrmRef.current;
      if (!vrm?.expressionManager) return;
      manualBlendshapeRef.current = false; // resume auto mood
      const allKeys = [
        'EyeBlinkLeft','EyeBlinkRight','EyeWideLeft','EyeWideRight','EyeSquintLeft','EyeSquintRight',
        'BrowDownLeft','BrowDownRight','BrowInnerUp','BrowOuterUpLeft','BrowOuterUpRight',
        'CheekPuff','CheekSquintLeft','CheekSquintRight','NoseSneerLeft','NoseSneerRight',
        'JawOpen','JawLeft','JawRight','MouthSmileLeft','MouthSmileRight','MouthFrownLeft','MouthFrownRight',
        'MouthDimpleLeft','MouthDimpleRight','MouthStretchLeft','MouthStretchRight',
        'MouthRollLower','MouthRollUpper','MouthShrugLower','MouthShrugUpper',
        'MouthPressLeft','MouthPressRight','MouthLowerDownLeft','MouthLowerDownRight',
        'MouthUpperUpLeft','MouthUpperUpRight','MouthClose','MouthFunnel','MouthPucker','MouthLeft','MouthRight',
        'happy','sad','relaxed','surprised','angry','blinkLeft','blinkRight','aa','ih','ou','ee','oh',
      ];
      for (const k of allKeys) { try { vrm.expressionManager.setValue(k, 0); } catch (_) { /* ok */ } }
    },
    setManualBlendshapeMode: (enabled: boolean) => {
      manualBlendshapeRef.current = enabled;
      setIdleExpressionManual(enabled);
    },
    setEnvironment: (preset: string) => {
      setBgImageUrl(null); // clear HTML image background when switching to env preset
      environmentManagerRef.current?.setEnvironment(preset);
    },
    setImageBackground: (imageUrl: string) => {
      setBgImageUrl(imageUrl);
      // Clear any Three.js scene background so the HTML img layer shows through
      if (sceneRef.current) {
        sceneRef.current.background = null;
        // Remove any existing environment sphere
        const existing = sceneRef.current.getObjectByName('EnvironmentSphere');
        if (existing) sceneRef.current.remove(existing);
      }
    },
    getCurrentEnvironment: () => {
      return environmentManagerRef.current?.getCurrentPreset() ?? null;
    },
    setLighting: (config: LightingConfig) => {
      lightingManagerRef.current?.updateLighting(config);
    },
    getCurrentLighting: () => {
      return lightingManagerRef.current?.getCurrentConfig() ?? null;
    },
  }), [animateCameraToPreset, playVrmaUrl, stopVrmaImperative]);

  // When bgImageUrl changes, ensure Three.js scene background is cleared
  useEffect(() => {
    if (bgImageUrl && sceneRef.current) {
      sceneRef.current.background = null;
      // Remove any existing environment sphere
      const existing = sceneRef.current.getObjectByName('EnvironmentSphere');
      if (existing) sceneRef.current.remove(existing);
    }
  }, [bgImageUrl]);

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
      // 1. Update mixer first — VRMA clips drive bones
      if (mixerRef.current) {
        mixerRef.current.update(delta);
        
        // Count mixer updates - need several frames for animation to fully apply
        if (vrmSceneHiddenRef.current && (idleActionRef.current || vrmaActionRef.current)) {
          mixerUpdateCountRef.current++;
        }
      }
      
      // 0. Add model to scene AFTER mixer has updated multiple times
      // This ensures bones are fully transformed by VRMA before model becomes visible
      // Wait for 10 frames (~166ms at 60fps) to ensure animation is fully applied
      if (vrmSceneHiddenRef.current && mixerUpdateCountRef.current >= 10) {
        const scene = sceneRef.current;
        if (scene) {
          scene.add(vrmSceneHiddenRef.current);
          console.log('[VRM] VRMA animation fully applied after', mixerUpdateCountRef.current, 'frames - model now visible');
          vrmSceneHiddenRef.current = null; // Clear reference
        }
      }

      // 2. Look-at — desktop only (no mouse on mobile)
      if (cameraRef.current && !cameraFreeRef.current && !isMobileRef.current) {
        updateLookAt(delta, vrm, cameraRef.current, new Set());
      }

      // 3. Fade out idle expression when TTS is about to start
      // Fade happens in parallel with lip sync starting
      if (isFadingOutRef.current) {
        const fadeComplete = fadeOutIdleExpressions(delta, vrm);
        if (fadeComplete) {
          isFadingOutRef.current = false;
          setIdleExpressionPaused(true);
          console.log('[Idle Expression] Fade out complete - paused for TTS');
        }
      }

      // 4. Lip sync - set expression values (starts immediately when speaking)
      // Lip sync can run in parallel with fade out - mouth movements override fading expressions
      if (isSpeakingRef.current) {
        vrm.expressionManager?.setValue('aa', 0);
        const level = isWebSpeechActiveRef.current
          ? getWebSpeechLipLevel(delta)
          : (getAudioLevelRef.current?.() ?? 0);
        updateLipSync(level, vrm, delta);
      }

      // 5. Idle expression rotation (auto mood system) - set expression values
      // CRITICAL: Automatically paused when speaking to prevent interference with lip sync
      // When paused, all idle expression weights are cleared to 0
      if (!manualBlendshapeRef.current && !isFadingOutRef.current) {
        updateIdleExpression(delta, vrm);
      }

      // 6. Apply all expression weights to morph targets - MUST be called after setting values
      vrm.update(delta);

      // 7. Blink - apply AFTER vrm.update() so blink has final say on morph targets
      // This prevents vrm.update() from overriding the direct morph target manipulation
      updateBlink(delta, vrm);

      // 8. Procedural micro-gestures — body breathing only (no expression override)
      // Now with smooth fade in/out based on gesture intensity
      const isManualOrTalking = !!vrmaActionRef.current || isTalkingPlayingRef.current;
      if (!isManualOrTalking) {
        updateIdleMicroGestures(elapsedTime, vrm, activeDrivenBonesRef.current, delta);
      }

      // 8. Spring bones — secondary motion (hair, accessories, etc.)
      updateSpringBones(delta, vrm);
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
    vrmSceneHiddenRef.current = null; // Reset hidden scene reference
    mixerUpdateCountRef.current = 0; // Reset mixer update counter

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

    // Initialize environment manager
    environmentManagerRef.current = createEnvironmentManager(scene);
    // Set default cyberpunk environment
    environmentManagerRef.current.setEnvironment('cyberpunk-void');

    // Initialize lighting manager
    lightingManagerRef.current = createLightingManager(scene, isMobile);
    // Set default cyberpunk lighting
    lightingManagerRef.current.updateLighting({
      preset: 'cyberpunk',
      ambientIntensity: 0.8,
      keyLightIntensity: 1.2,
      fillLightIntensity: 0.4,
      rimLightIntensity: 0.3,
      ambientColor: '#88cccc',
      keyLightColor: '#ffffff',
    });

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
    
    // Configure tone mapping - but exclude background materials
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    // Ensure background is always rendered properly
    renderer.autoClear = true;
    renderer.autoClearColor = true;
    renderer.autoClearDepth = true;
    renderer.autoClearStencil = true;
    
    // Set clear color transparent so HTML background layer shows through
    renderer.setClearColor(0x000000, 0);
    
    console.log('[VrmViewer] Renderer configured - tone mapping:', renderer.toneMapping, 'exposure:', renderer.toneMappingExposure);
    
    container.appendChild(renderer.domElement);
    renderer.domElement.style.position = 'relative';
    renderer.domElement.style.zIndex = '1';
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

    // Add debugging to window for console testing
    if (typeof window !== 'undefined') {
      (window as any).scene = scene;
      (window as any).camera = camera;
      (window as any).renderer = renderer;
      (window as any).environmentManager = environmentManagerRef.current;
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
        
        // DON'T add to scene yet - store it and wait for first VRMA animation
        // This prevents T-pose flash
        vrmSceneHiddenRef.current = vrm.scene;
        vrmRef.current = vrm;
        mixerRef.current = createMixer(vrm);
        
        console.log('[VRM] Model loaded, waiting for first VRMA animation before showing...');

        // Init spring bones for secondary motion
        initSpringBones(vrm);

        // Init idle expression rotation
        initIdleExpression();
        
        // Debug: log available expressions
        debugExpressionKeys(vrm);

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

    // Init look-at mouse tracking — desktop only (no mouse on mobile)
    const cleanupLookAt = isMobile ? () => {} : initLookAt(container);

    const onResize = () => {
      if (!container || !renderer || !camera) return;
      
      console.log('[VrmViewer] Resize triggered - container size:', container.clientWidth, 'x', container.clientHeight);
      
      const wasMobile = isMobileRef.current;
      const nowMobile = container.clientWidth < 768;
      isMobileRef.current = nowMobile;

      if (vrmRef.current && wasMobile !== nowMobile && adaptivePresetsRef.current) {
        adaptivePresetsRef.current = computeAdaptivePresets(vrmRef.current);
      }
      
      // Update lighting manager for mobile/desktop changes
      if (wasMobile !== nowMobile && lightingManagerRef.current) {
        lightingManagerRef.current.setMobileMode(nowMobile);
      }
      
      // Update camera settings
      if (!cameraFreeRef.current && adaptivePresetsRef.current) {
        const p = adaptivePresetsRef.current['medium-shot'];
        camera.position.set(...p.position);
        camera.fov = p.fov;
        camera.lookAt(...p.target);
        orbitControlsRef.current?.target.set(...p.target);
      }
      
      // Update camera aspect ratio and renderer size
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      
      // Ensure background is still visible after resize
      if (environmentManagerRef.current && sceneRef.current) {
        // Force background refresh to ensure it's still visible
        const currentBg = sceneRef.current.background;
        if (currentBg) {
          console.log('[VrmViewer] Refreshing background after resize');
          // Trigger a re-render to ensure background is visible
          renderer.render(sceneRef.current, camera);
        }
      }
      
      if (wasMobile !== nowMobile) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, nowMobile ? 1.5 : 2));
        // Disable look-at on mobile, re-enable on desktop
        setLookAtEnabled(!nowMobile);
      }
      orbitControlsRef.current?.handleResize?.();
      
      console.log('[VrmViewer] Resize complete - new aspect ratio:', camera.aspect);
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
      environmentManagerRef.current?.dispose();
      environmentManagerRef.current = null;
      lightingManagerRef.current?.dispose();
      lightingManagerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className ?? ''}`}>
      {/* HTML image background — always cover, never affected by Three.js tone mapping */}
      {bgImageUrl && (
        <img
          src={bgImageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{ zIndex: 0 }}
        />
      )}
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
