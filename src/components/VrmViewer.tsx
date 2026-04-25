import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
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
import { initLookAt, updateLookAt, setLookAtEnabled, forceNeutral } from '@/lib/vrm-lookat';
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
  onLevelUp?: (newLevel: number) => void;
  ambientEffect?: 'none' | 'sakura' | 'rain' | 'snow' | 'leaves';
  showSubtitles?: boolean;
}

const VrmViewer = forwardRef<VrmViewerHandle, VrmViewerProps>(function VrmViewer(
  { modelUrl, isSpeaking = false, isWebSpeechActive = false, audioElement, currentMessage, className, getAudioLevel, onLevelUp, ambientEffect = 'none', showSubtitles = true },
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

    const now = performance.now();
    // Target: 60fps desktop, 30fps mobile. Drops strictly to 10fps if hidden tab to save battery.
    const targetInterval = !isVisibleRef.current ? 1000 / 10 : (isMobileRef.current ? 1000 / 30 : 1000 / 60);
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

    // Hanya draw scene jika tab peramban benar-benar sedang dibuka (visibilitas tak tersembunyi), menghemat drastis beban GPU.
    if (rendererRef.current && sceneRef.current && cameraRef.current && isVisibleRef.current) {
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

        // Setup Headpat hitbox (invisible sphere around head bone)
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        if (headNode) {
          const hitboxGeom = new THREE.SphereGeometry(0.22, 12, 12);
          const hitboxMat = new THREE.MeshBasicMaterial({ visible: false }); 
          const hitboxMesh = new THREE.Mesh(hitboxGeom, hitboxMat);
          hitboxMesh.name = 'headpat_hitbox';
          // Offset sedikit ke atas ubun-ubun kepala (0.1m)
          hitboxMesh.position.set(0, 0.1, 0.02); 
          headNode.add(hitboxMesh);
        }

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

      // Dispose VRM model — geometry, materials, textures
      const vrm = vrmRef.current;
      if (vrm) {
        vrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (m) {
                // Dispose all texture maps on the material
                Object.values(m).forEach((val) => {
                  if (val instanceof THREE.Texture) val.dispose();
                });
                m.dispose();
              }
            });
          }
        });
        try { VRMUtils.deepDispose(vrm.scene); } catch (_) { /* ok */ }
        vrmRef.current = null;
      }

      // Dispose hidden scene if model never became visible
      if (vrmSceneHiddenRef.current) {
        vrmSceneHiddenRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => { m?.dispose(); });
          }
        });
        vrmSceneHiddenRef.current = null;
      }

      // Clear mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
        mixerRef.current = null;
      }

      // Dispose scene objects
      sceneRef.current?.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m) {
              Object.values(m).forEach((val) => {
                if (val instanceof THREE.Texture) val.dispose();
              });
              m.dispose();
            }
          });
        }
      });
      sceneRef.current?.clear();

      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      orbitControlsRef.current?.dispose();
      orbitControlsRef.current = null;
      environmentManagerRef.current?.dispose();
      environmentManagerRef.current = null;
      lightingManagerRef.current?.dispose();
      lightingManagerRef.current = null;

      // Clear window debug refs
      if (typeof window !== 'undefined') {
        delete (window as any).scene;
        delete (window as any).camera;
        delete (window as any).renderer;
        delete (window as any).environmentManager;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  // Affection & Headpat states
  const [affection, setAffection] = useState(() => parseInt(localStorage.getItem('vrm.affection') || '0', 10));
  const pointerSpeedY = useRef(0);
  const lastPointerY = useRef(0);
  const isPattingRef = useRef(false);
  
  // Taptic particle pop
  const [tapticParticles, setTapticParticles] = useState<{id: number, x: number, y: number, char: string}[]>([]);
  const tapticIdCounter = useRef(0);

  const saveAffection = (addAmount: number) => {
    setAffection(prev => {
      const oldLevel = Math.floor(prev / 100);
      const newVal = prev + addAmount;
      const newLevel = Math.floor(newVal / 100);
      
      if (newLevel > oldLevel && newLevel >= 1) {
        onLevelUp?.(newLevel);
      }
      
      localStorage.setItem('vrm.affection', newVal.toString());
      return newVal;
    });
  };

  const syncAffectionFromChat = useCallback(() => {
    if (isSpeaking && currentMessage && currentMessage.length > 5) {
      saveAffection(1); // Bertambah 1 tiap bicara
    }
  }, [isSpeaking, currentMessage]);

  useEffect(() => { syncAffectionFromChat(); }, [isSpeaking]);

  const handlePointerMoveHitbox = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraFreeRef.current || !cameraRef.current || !sceneRef.current) return;
    if (e.buttons !== 1) return; // Only process on drag (mouse down + move)

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const deltaY = e.clientY - lastPointerY.current;
    lastPointerY.current = e.clientY;
    
    // Akumulasi speed patokan y (sapuan atas-bawah)
    pointerSpeedY.current += Math.abs(deltaY);

    const rc = new THREE.Raycaster();
    rc.setFromCamera({ x, y }, cameraRef.current);

    const allHitMeshes: THREE.Mesh[] = [];
    sceneRef.current.traverse(child => {
      if (child.name === 'headpat_hitbox') allHitMeshes.push(child as THREE.Mesh);
    });

    const intersects = rc.intersectObjects(allHitMeshes);
    if (intersects.length > 0) {
      if (!isPattingRef.current) {
        isPattingRef.current = true;
        forceNeutral(true); // Lerp back to center smoothly
      }
      
      if (pointerSpeedY.current > 30) {
        pointerSpeedY.current = 0; // reset
        
        // --- Spawn Taptic Particle ---
        const ex = e.clientX;
        const ey = e.clientY;
        const emojis = ['✨', '💕', '⭐', '🌸'];
        const randomChar = emojis[Math.floor(Math.random() * emojis.length)];
        const id = tapticIdCounter.current++;
        setTapticParticles(prev => [...prev, { id, x: ex, y: ey, char: randomChar }]);
        setTimeout(() => setTapticParticles(prev => prev.filter(p => p.id !== id)), 1000); // auto clear
        
        // --- Trigger Blush ---
        if (vrmRef.current) {
          applyMoodOverride('happy', 3, vrmRef.current);
          saveAffection(2); // Elusan nambah lumayan banyak
        }
      }
    } else {
      if (isPattingRef.current) {
        isPattingRef.current = false;
        setLookAtEnabled(true);
      }
    }
  };

  // --- Ambient Particles Data (Memoized to prevent jitter on re-render) ---
  const ambientParticles = useMemo(() => {
    return {
      sakura: Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * 12 + 8,
        duration: Math.random() * 8 + 8,
        delay: Math.random() * 10
      })),
      rain: Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        duration: Math.random() * 1 + 1.5,
        delay: Math.random() * -5
      })),
      snow: Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * 5 + 3,
        duration: Math.random() * 10 + 5,
        delay: Math.random() * -15 // Negative delay to scatter
      })),
      leaves: Array.from({ length: 25 }).map((_, i) => ({
        id: i,
        left: Math.random() * 120,
        size: Math.random() * 15 + 10,
        duration: Math.random() * 8 + 6,
        delay: Math.random() * -10 // Negative delay to scatter
      }))
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className ?? ''}`}
         onPointerMove={handlePointerMoveHitbox}
         onPointerUp={() => {
           if (isPattingRef.current) {
             isPattingRef.current = false;
             forceNeutral(false); // Resume following mouse
           }
         }}
         onPointerDown={(e) => { lastPointerY.current = e.clientY; pointerSpeedY.current = 0; }}>
      
      {/* Taptic Particles Rendering */}
      {tapticParticles.map(p => (
        <div key={p.id} className="taptic-particle pointer-events-none z-[99999]" style={{ position: 'fixed', left: p.x - 16 + 'px', top: p.y - 16 + 'px', fontSize: '32px', textShadow: '0 0 10px rgba(236,72,153,1)' }}>
          {p.char}
        </div>
      ))}

      {/* Ambient Aura Rendering */}
      {ambientEffect !== 'none' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {ambientEffect === 'sakura' && ambientParticles.sakura.map(p => (
            <div key={p.id} className="sakura-petal" style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `sakura-fall ${p.duration}s linear ${p.delay}s infinite`,
            }} />
          ))}
          {ambientEffect === 'rain' && ambientParticles.rain.map(p => (
            <div key={p.id} className="rain-drop" style={{
              left: `${p.left}%`,
              animation: `rain-fall ${p.duration}s linear ${p.delay}s infinite`,
            }} />
          ))}
          {ambientEffect === 'snow' && ambientParticles.snow.map(p => (
            <div key={p.id} className="snow-flake" style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `snow-fall ${p.duration}s linear ${p.delay}s infinite`,
            }} />
          ))}
          {ambientEffect === 'leaves' && ambientParticles.leaves.map(p => (
            <div key={p.id} className="leaf-particle" style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size * 0.7}px`,
              animation: `leaves-fall ${p.duration}s linear ${p.delay}s infinite`,
            }} />
          ))}
        </div>
      )}

      {/* HTML image background — fade transition, never affected by Three.js tone mapping */}
      {bgImageUrl && (
        <img
          key={bgImageUrl}
          src={bgImageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{ zIndex: 0, animation: 'bgFadeIn 0.4s ease-out forwards' }}
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

      {/* Companion HUD Overlay (Lovometer & Cinematic Subtitles) */}
      <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between overflow-hidden">
        
        {/* Top Header Region for Lovometer */}
        <div className="absolute top-0 left-0 right-0 flex justify-center sm:justify-start sm:ml-40 mt-3 md:mt-4 pointer-events-none">
          {/* Lovometer - Affection level indicator */}
          <div className="bg-background/80 backdrop-blur-md border px-3 py-1.5 flex items-center gap-2 pointer-events-auto shadow-md select-none transition-all rounded-full border-pink-500/20 max-w-[160px] h-8">
            <span className="text-[11px] font-bold tracking-widest text-pink-400 drop-shadow-sm font-mono leading-none">
              LV.{Math.floor(affection / 100)}
            </span>
            <div className="relative flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden shadow-inner w-16">
              <div 
                className="absolute left-0 top-0 bottom-0 bg-pink-500 transition-all duration-500 ease-out"
                style={{ width: `${affection % 100}%` }}
              />
            </div>
            <span className="text-sm cursor-pointer hover:scale-125 transition-transform drop-shadow-md leading-none" 
                  title="Affection Level (Peningkatan melalui obrolan & sentuhan wajah)">
              💖
            </span>
          </div>
        </div>

        {/* Floating Subtitle - Positioned at bottom center with safe margin */}
        {showSubtitles && isSpeaking && currentMessage && (
          <div className="absolute bottom-32 left-0 right-0 px-4 flex justify-center pointer-events-none z-30">
            <div className="px-6 py-3 rounded-2xl cyber-glass border border-white/10 text-center shadow-2xl relative overflow-hidden group max-w-[85%] md:max-w-2xl">
              <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent opacity-50" />
              <p className="text-white text-lg md:text-xl font-medium tracking-tight drop-shadow-lg relative z-10 leading-relaxed">
                {currentMessage}
              </p>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            </div>
          </div>
        )}
      </div>

    </div>
  );
});

export default VrmViewer;

