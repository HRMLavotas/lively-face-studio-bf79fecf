import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { loadVRMA, createMixer, playVRMA, stopVRMA, straightenClip, type PlayVrmaOptions } from '@/lib/vrma-player';
import { getClipDrivenBones } from '@/lib/vrm-animations';
import { supabase } from '@/integrations/supabase/client';

export interface VrmaAnimationRefs {
  mixerRef: React.MutableRefObject<THREE.AnimationMixer | null>;
  vrmaPlayingRef: React.MutableRefObject<boolean>;
  vrmaActionRef: React.MutableRefObject<THREE.AnimationAction | null>;
  talkingClipsRef: React.MutableRefObject<THREE.AnimationClip[]>;
  talkingClipIndexRef: React.MutableRefObject<number>;
  isTalkingPlayingRef: React.MutableRefObject<boolean>;
  isReturnToRestRef: React.MutableRefObject<boolean>;
  idleClipsRef: React.MutableRefObject<THREE.AnimationClip[]>;
  idleClipRef: React.MutableRefObject<THREE.AnimationClip | null>;
  idleActionRef: React.MutableRefObject<THREE.AnimationAction | null>;
  idlePausedForActivityRef: React.MutableRefObject<boolean>;
  idleLoopCountRef: React.MutableRefObject<number>;
  idleCurrentIndexRef: React.MutableRefObject<number>;
  idleLoopsBeforeSwitchRef: React.MutableRefObject<number>;
  activeDrivenBonesRef: React.MutableRefObject<Set<string>>;
}

export function useVrmaAnimations(
  vrmRef: React.MutableRefObject<VRM | null>,
  isSpeakingRef: React.MutableRefObject<boolean>,
  modelUrl: string,
  loading: boolean,
) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const vrmaPlayingRef = useRef(false);
  const vrmaActionRef = useRef<THREE.AnimationAction | null>(null);

  const talkingClipsRef = useRef<THREE.AnimationClip[]>([]);
  const talkingClipIndexRef = useRef(0);
  const isTalkingPlayingRef = useRef(false);
  const isReturnToRestRef = useRef(false);

  const idleClipsRef = useRef<THREE.AnimationClip[]>([]);
  const idleClipRef = useRef<THREE.AnimationClip | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const idlePausedForActivityRef = useRef(false);
  const idleLoopCountRef = useRef(0);
  const idleCurrentIndexRef = useRef(0);
  const idleLoopsBeforeSwitchRef = useRef(3);
  const activeDrivenBonesRef = useRef<Set<string>>(new Set());

  // ── Load talking clips ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vrm = vrmRef.current;
      if (!vrm) return;
      try {
        const { data } = await supabase
          .from('vrma_animations')
          .select('file_path, name')
          .eq('category', 'talking')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (cancelled || !data || data.length === 0) return;

        const clips: THREE.AnimationClip[] = [];
        for (const row of data) {
          if (cancelled) break;
          try {
            const { data: urlData } = supabase.storage
              .from('vrma-animations')
              .getPublicUrl(row.file_path);
            if (!urlData?.publicUrl) continue;
            const clip = await loadVRMA(urlData.publicUrl, vrm);
            if (!cancelled && clip.duration >= 1.5) {
              straightenClip(clip);
              clips.push(clip);
            }
          } catch (e) {
            console.warn('[VRMA Talking] Failed to load clip:', e);
          }
        }
        if (!cancelled) {
          talkingClipsRef.current = clips;
          talkingClipIndexRef.current = 0;
        }
      } catch (e) {
        console.warn('[VRMA Talking] Query error:', e);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // ── Load idle clips ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vrm = vrmRef.current;
      const mixer = mixerRef.current;
      if (!vrm || !mixer) return;
      try {
        const { data } = await supabase
          .from('vrma_animations')
          .select('file_path,name')
          .eq('category', 'idle')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (cancelled || !data || data.length === 0) return;

        const clips: THREE.AnimationClip[] = [];
        let firstStarted = false;

        for (const row of data) {
          if (cancelled) break;
          try {
            const { data: urlData } = supabase.storage
              .from('vrma-animations')
              .getPublicUrl(row.file_path);
            if (!urlData?.publicUrl) continue;
            const clip = await loadVRMA(urlData.publicUrl, vrm);
            if (cancelled) break;
            clips.push(clip);
            idleClipsRef.current = clips;

            // Auto-start on first clip to prevent T-pose
            if (!firstStarted && !vrmaActionRef.current && !isTalkingPlayingRef.current && !isSpeakingRef.current) {
              firstStarted = true;
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
                action.fadeIn(1.0); // Increased from 0.3 to 1.0 for slower transition
                action.play();
                idleActionRef.current = action;
                vrmaPlayingRef.current = true;
                activeDrivenBonesRef.current = getClipDrivenBones(clip);
                console.log('[VRMA Idle] First idle animation started - model ready to show');
              }
            } else if (!firstStarted) {
              firstStarted = true;
            }
          } catch (e) {
            console.warn('[VRMA Idle] Failed to load clip:', e);
          }
        }

        if (cancelled || clips.length === 0) return;

        // Shuffle for random rotation (keep first active)
        if (clips.length > 1) {
          for (let i = clips.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [clips[i], clips[j]] = [clips[j], clips[i]];
          }
        }
        idleClipsRef.current = clips;
      } catch (e) {
        console.warn('[VRMA Idle] Query error:', e);
      }
    })();
    return () => {
      cancelled = true;
      try { idleActionRef.current?.stop(); } catch (_) { /* ok */ }
      idleActionRef.current = null;
      idleClipRef.current = null;
      idleClipsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, loading]);

  // ── Restart idle loop ─────────────────────────────────────────────────────
  const restartIdleLoop = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = idleClipsRef.current;
    if (!mixer || clips.length === 0) return;
    if (vrmaActionRef.current || isTalkingPlayingRef.current) return;
    if (idleActionRef.current?.isRunning()) return;

    const clip = clips[idleCurrentIndexRef.current % clips.length];
    idleClipRef.current = clip;
    try {
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.weight = 1;
      action.fadeIn(1.2); // Increased from 0.4 to 1.2 for slower transition
      action.play();
      idleActionRef.current = action;
      vrmaPlayingRef.current = true;
      activeDrivenBonesRef.current = getClipDrivenBones(clip);
    } catch (e) {
      console.warn('[VRMA Idle] Could not restart:', e);
    }
  }, []);

  // ── Switch idle clip ──────────────────────────────────────────────────────
  const switchIdleClip = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = idleClipsRef.current;
    if (!mixer || clips.length <= 1) return;
    if (vrmaActionRef.current || isTalkingPlayingRef.current) return;

    let nextIdx: number;
    if (clips.length === 2) {
      nextIdx = idleCurrentIndexRef.current === 0 ? 1 : 0;
    } else {
      do { nextIdx = Math.floor(Math.random() * clips.length); }
      while (nextIdx === idleCurrentIndexRef.current);
    }

    idleCurrentIndexRef.current = nextIdx;
    idleLoopCountRef.current = 0;
    idleLoopsBeforeSwitchRef.current = 3 + Math.floor(Math.random() * 5);

    const nextClip = clips[nextIdx];
    idleClipRef.current = nextClip;
    try {
      idleActionRef.current?.fadeOut(1.8); // Increased from 0.6 to 1.8 for slower fade out
      const newAction = mixer.clipAction(nextClip);
      newAction.reset();
      newAction.setLoop(THREE.LoopRepeat, Infinity);
      newAction.enabled = true;
      newAction.weight = 1;
      newAction.fadeIn(1.8); // Increased from 0.6 to 1.8 for slower fade in
      newAction.play();
      idleActionRef.current = newAction;
      activeDrivenBonesRef.current = getClipDrivenBones(nextClip);
    } catch (e) {
      console.warn('[VRMA Idle] Failed to switch clip:', e);
    }
  }, []);

  // ── Idle loop event listener ──────────────────────────────────────────────
  useEffect(() => {
    let attached = false;
    // eslint-disable-next-line prefer-const
    let intervalId: ReturnType<typeof setInterval>;

    const attachListener = () => {
      const mixer = mixerRef.current;
      if (!mixer || attached) return;
      attached = true;
      clearInterval(intervalId);

      const onLoop = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== idleActionRef.current) return;
        if (vrmaActionRef.current || isTalkingPlayingRef.current) return;
        if (idleClipsRef.current.length <= 1) return;
        idleLoopCountRef.current += 1;
        if (idleLoopCountRef.current >= idleLoopsBeforeSwitchRef.current) {
          switchIdleClip();
        }
      };

      mixer.addEventListener('loop', onLoop as (e: object) => void);
      (mixer as unknown as { _tempoLoopHandler?: (e: object) => void })._tempoLoopHandler = onLoop as (e: object) => void;
    };

    intervalId = setInterval(attachListener, 200);
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
   
  }, [modelUrl, loading, switchIdleClip]);

  // ── Play next talking clip ────────────────────────────────────────────────
  const playNextTalking = useCallback(() => {
    const mixer = mixerRef.current;
    const clips = talkingClipsRef.current;
    if (!mixer || clips.length === 0 || !isTalkingPlayingRef.current || vrmaActionRef.current) return;

    const idx = talkingClipIndexRef.current % clips.length;
    talkingClipIndexRef.current = (idx + 1) % clips.length;
    const clip = clips[idx];
    vrmaPlayingRef.current = true;

    const fadeIn = idleActionRef.current?.isRunning() ? 0.8 : 1.0; // Increased from 0.25/0.3 to 0.8/1.0 for slower transition
    const action = playVRMA(mixer, clip, { loop: false, fadeIn });
    if (!action) { vrmaPlayingRef.current = false; return; }

    idleActionRef.current = null;
    activeDrivenBonesRef.current = getClipDrivenBones(clip);

    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== action) return;
      mixer.removeEventListener('finished', onFinished);
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

  // ── Play VRMA from URL (imperative, called by parent) ────────────────────
  const playVrmaUrl = useCallback(async (url: string, opts?: PlayVrmaOptions) => {
    const vrmBefore = vrmRef.current;
    if (!vrmBefore) throw new Error('VRM model belum dimuat');

    const clip = await loadVRMA(url, vrmBefore);

    // Removed the duration < 1.0 guard — short clips (e.g. quick gestures) are valid
    const vrm = vrmRef.current;
    if (!vrm || vrm !== vrmBefore) return;

    // Don't block gesture playback when talking — allow override
    if (!mixerRef.current) mixerRef.current = createMixer(vrm);
    const mixer = mixerRef.current;

    vrmaPlayingRef.current = true;
    vrmaActionRef.current = playVRMA(mixer, clip, { clamp: true, ...opts });
    if (!vrmaActionRef.current) {
      vrmaPlayingRef.current = false;
      throw new Error('Gagal memulai animasi');
    }
    activeDrivenBonesRef.current = getClipDrivenBones(clip);

    if (!isSpeakingRef.current) isTalkingPlayingRef.current = false;

    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== vrmaActionRef.current) return;
      mixer.removeEventListener('finished', onFinished);

      const finishedAction = vrmaActionRef.current;
      if (finishedAction) { finishedAction.enabled = true; finishedAction.paused = true; }

      vrmaActionRef.current = null;
      const idleClips = idleClipsRef.current;
      const m = mixerRef.current;

      if (isSpeakingRef.current && talkingClipsRef.current.length > 0) {
        isTalkingPlayingRef.current = true;
        idlePausedForActivityRef.current = true;
        playNextTalking();
      } else if (m && idleClips.length > 0) {
        const idleClip = idleClips[idleCurrentIndexRef.current % idleClips.length];
        idleClipRef.current = idleClip;
        const idleAction = playVRMA(m, idleClip, { loop: true, fadeIn: 1.5 }); // Increased from 0.5 to 1.5 for slower transition
        if (idleAction) {
          idleActionRef.current = idleAction;
          vrmaPlayingRef.current = true;
          activeDrivenBonesRef.current = getClipDrivenBones(idleClip);
        } else {
          vrmaPlayingRef.current = false;
        }
      } else if (m) {
        isReturnToRestRef.current = true;
        const actions = (m as unknown as { _actions: THREE.AnimationAction[] })._actions ?? [];
        actions.forEach((a) => { try { a.fadeOut(1.5); } catch (_) { /* ok */ } }); // Increased from 0.5 to 1.5 for slower fade out
        vrmaPlayingRef.current = false;
        setTimeout(() => { isReturnToRestRef.current = false; restartIdleLoop(); }, 1600); // Increased from 600 to 1600 to match fade duration
      } else {
        vrmaPlayingRef.current = false;
      }
    };
    mixer.addEventListener('finished', onFinished);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playNextTalking, restartIdleLoop]);

  // ── Stop VRMA (imperative) ────────────────────────────────────────────────
  const stopVrmaImperative = useCallback((fadeOut = 1.0) => { // Increased from 0.3 to 1.0 for slower fade out
    isTalkingPlayingRef.current = false;
    vrmaActionRef.current = null;
    const mixer = mixerRef.current;
    const idleClips = idleClipsRef.current;

    if (mixer && idleClips.length > 0) {
      stopVRMA(mixer, fadeOut);
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
      stopVRMA(mixer, fadeOut);
      vrmaPlayingRef.current = false;
      setTimeout(() => restartIdleLoop(), fadeOut * 1000 + 50);
    } else {
      vrmaPlayingRef.current = false;
    }
  }, [restartIdleLoop]);

  return {
    // Refs (for animate loop and imperative handle)
    mixerRef,
    vrmaPlayingRef,
    vrmaActionRef,
    talkingClipsRef,
    talkingClipIndexRef,
    isTalkingPlayingRef,
    isReturnToRestRef,
    idleClipsRef,
    idleClipRef,
    idleActionRef,
    idlePausedForActivityRef,
    idleLoopCountRef,
    idleCurrentIndexRef,
    idleLoopsBeforeSwitchRef,
    activeDrivenBonesRef,
    // Callbacks
    restartIdleLoop,
    switchIdleClip,
    playNextTalking,
    playVrmaUrl,
    stopVrmaImperative,
  };
}
