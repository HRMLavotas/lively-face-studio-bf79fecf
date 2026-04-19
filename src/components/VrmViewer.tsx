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
} from '@/lib/vrm-animations';
import { detectMood } from '@/lib/sentiment';
import { useAudioAnalyser } from '@/hooks/useAudioAnalyser';
import { loadVRMA, createMixer, playVRMA, stopVRMA, type PlayVrmaOptions } from '@/lib/vrma-player';

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectAudioElement, getAudioLevel, disconnect: disconnectAudio } = useAudioAnalyser();

  isSpeakingRef.current = isSpeaking;

  // Connect audio element for lip sync.
  useEffect(() => {
    if (!audioElement) return;
    try {
      connectAudioElement(audioElement);
    } catch (e) {
      console.warn('Could not connect audio element:', e);
    }
  }, [audioElement, connectAudioElement]);

  // Reset mouth + return to neutral mood when speech ends
  useEffect(() => {
    if (!isSpeaking && vrmRef.current) {
      resetMouthExpressions(vrmRef.current);
      setTargetMood('neutral');
    }
  }, [isSpeaking]);

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

      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action === vrmaActionRef.current) {
          // Keep vrmaPlayingRef.current = true so the mixer keeps updating
          // and clampWhenFinished holds the final pose.
          // Only reset when stopVrma() is called explicitly.
          mixer.removeEventListener('finished', onFinished);
          console.log('[VRMA] Playback finished (pose clamped at last frame)');
        }
      };
      mixer.addEventListener('finished', onFinished);
    },
    stopVrma: (fadeOut = 0.3) => {
      stopVRMA(mixerRef.current, fadeOut);
      vrmaPlayingRef.current = false;
      vrmaActionRef.current = null;
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

      // Update VRMA mixer when active — only source of body motion
      if (mixerRef.current && vrmaPlayingRef.current) {
        mixerRef.current.update(delta);
      }
      // No procedural body/arm/idle animations — face-only blendshapes

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
