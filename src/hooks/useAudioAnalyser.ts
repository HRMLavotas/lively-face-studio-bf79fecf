import { useRef, useCallback, useState } from 'react';

export interface AudioAnalyserControls {
  /** Connect an HTMLAudioElement or MediaStream to the analyser. Safe to call
   *  multiple times — will skip if the same element is already attached, and
   *  swap the source if a new element is passed in. */
  connectAudioElement: (audio: HTMLAudioElement) => void;
  connectMediaStream: (stream: MediaStream) => void;
  /** Read current normalized volume 0–1 */
  getAudioLevel: () => number;
  /** Whether audio is currently being analysed */
  isActive: boolean;
  /** Disconnect and clean up */
  disconnect: () => void;
}

export function useAudioAnalyser(): AudioAnalyserControls {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  // Track which HTMLAudioElement (if any) is currently attached, because a
  // given audio element can only be passed to createMediaElementSource ONCE
  // per AudioContext lifetime.
  const attachedElementRef = useRef<HTMLAudioElement | null>(null);
  const [isActive, setIsActive] = useState(false);

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    // Browsers may suspend the AudioContext if it was created before user
    // gesture — resume on every connect to be safe.
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => { /* ignore */ });
    }
    if (!analyserRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    return { ctx: audioContextRef.current, analyser: analyserRef.current };
  }, []);

  const connectAudioElement = useCallback((audio: HTMLAudioElement) => {
    // Already attached to this exact element — nothing to do.
    if (attachedElementRef.current === audio && sourceRef.current) {
      // Ensure context is running for subsequent plays.
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => { /* ignore */ });
      }
      setIsActive(true);
      return;
    }

    const { ctx, analyser } = ensureContext();

    // Disconnect previous source (if any) so it stops feeding the analyser.
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch (_) { /* ignore */ }
      sourceRef.current = null;
    }

    try {
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      attachedElementRef.current = audio;
      setIsActive(true);
    } catch (err) {
      // Most common cause: this audio element was already connected to a
      // MediaElementSource in another AudioContext. Caller should reuse a
      // single persistent element to avoid this.
      console.warn('[useAudioAnalyser] createMediaElementSource failed:', err);
    }
  }, [ensureContext]);

  const connectMediaStream = useCallback((stream: MediaStream) => {
    const { ctx, analyser } = ensureContext();

    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch (_) { /* ignore */ }
      sourceRef.current = null;
    }

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;
    attachedElementRef.current = null;
    setIsActive(true);
  }, [ensureContext]);

  const getAudioLevel = useCallback((): number => {
    if (!analyserRef.current || !dataArrayRef.current) return 0;

    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);

    // Calculate RMS volume normalized to 0–1
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i];
    }
    const average = sum / dataArrayRef.current.length;
    return Math.min(average / 128, 1.0); // normalize
  }, []);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch (_) { /* ignore */ }
      sourceRef.current = null;
    }
    attachedElementRef.current = null;
    setIsActive(false);
  }, []);

  return { connectAudioElement, connectMediaStream, getAudioLevel, isActive, disconnect };
}
