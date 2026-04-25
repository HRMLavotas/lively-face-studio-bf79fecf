import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ChatPanel from '@/components/ChatPanel';
import UserMenu from '@/components/UserMenu';
import NewUserModelBanner from '@/components/NewUserModelBanner';
import CameraControls from '@/components/CameraControls';
import LightingControls from '@/components/LightingControls';
import BackgroundSelector from '@/components/BackgroundSelector';
import OnboardingGuide from '@/components/OnboardingGuide';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { detectMood } from '@/lib/sentiment';
import { useVrmaTriggers } from '@/hooks/useVrmaTriggers';
import { useAudioAnalyser } from '@/hooks/useAudioAnalyser';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useIdlePreset } from '@/hooks/useIdlePreset';
import { parseAnimTag, isWebSpeechUrl, getWebSpeechText } from '@/lib/chat-api';
import { speakWithWebSpeech, stopWebSpeech, preloadVoices } from '@/lib/web-speech-tts';
import { useTTSProvider } from '@/hooks/useTTSProvider';
import type { VrmViewerHandle, CameraPreset } from '@/components/VrmViewer';
import type { LangCode } from '@/lib/lang-detect';

const VrmViewer = lazy(() => import('@/components/VrmViewer'));

export default function Index() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { isPro } = useUserRole();
  const { activeProvider, handleRateLimit } = useTTSProvider(isPro);
  const { idlePresetId, setIdlePreset } = useIdlePreset();

  // Preload Web Speech voices on mount
  useEffect(() => { preloadVoices(); }, []);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWebSpeechActive, setIsWebSpeechActive] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [modelUrl, setModelUrl] = useState('');
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [personality, setPersonality] = useState<string | undefined>(undefined);
  const [spokenMessage, setSpokenMessage] = useState<string>('');
  const [isCameraFree, setIsCameraFree] = useState(false);
  const [currentCameraPreset, setCurrentCameraPreset] = useState<CameraPreset>('medium-shot');
  const [chatOpen, setChatOpen] = useState(() =>
    false // Always start closed for both desktop and mobile
  );
  const [hasUnread, setHasUnread] = useState(false);
  const lastInteractionTime = useRef(Date.now());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ambientEffect, setAmbientEffect] = useState<'none' | 'sakura' | 'rain' | 'snow' | 'leaves'>(() => 
    (localStorage.getItem('vrm.ambient') as any) || 'none'
  );
  const [showSubtitles, setShowSubtitles] = useState(() => 
    localStorage.getItem('vrm.showSubtitles') !== 'false'
  );
  const [autoEnvironment, setAutoEnvironment] = useState(() => 
    localStorage.getItem('vrm.autoEnvironment') !== 'false'
  );

  const viewerRef = useRef<VrmViewerHandle>(null);

  const { connectAudioElement, getAudioLevel } = useAudioAnalyser();
  const { clips, findMatch, findClipByName } = useVrmaTriggers();
  const userLangPref =
    (typeof window !== 'undefined'
      ? (localStorage.getItem('vrm.lang') as LangCode | null)
      : null) || null;

  if (audioRef.current === null && typeof window !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = 'anonymous';
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsSpeaking(false);
    const onError = () => setIsSpeaking(false);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    setAudioEl(audio);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const [audioConnected, setAudioConnected] = useState(false);
  useEffect(() => {
    if (!audioConnected || !audioEl) return;
    try { connectAudioElement(audioEl); } catch (e) { console.warn('[Index] Audio connect:', e); }
  }, [audioConnected, audioEl, connectAudioElement]);

  useEffect(() => {
    let cancelled = false;
    const loadActive = async () => {
      const { data: activeModel } = await supabase
        .from('vrm_models')
        .select('file_path, personality')
        .eq('is_active', true)
        .maybeSingle();

      if (cancelled) return;
      if (activeModel?.file_path) {
        const { data: urlData } = supabase.storage.from('vrm-models').getPublicUrl(activeModel.file_path);
        if (urlData?.publicUrl) setModelUrl(urlData.publicUrl);
        setPersonality(activeModel.personality || undefined);
      } else {
        setModelUrl('');
        setPersonality(undefined);
      }

      const { data: activeVoice } = await supabase
        .from('voice_settings')
        .select('voice_id')
        .eq('is_active', true)
        .maybeSingle();

      if (cancelled) return;
      setVoiceId(activeVoice?.voice_id ?? undefined);
    };
    loadActive();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleAmbientChange = useCallback((effect: 'none' | 'sakura' | 'rain' | 'snow' | 'leaves') => {
    setAmbientEffect(effect);
    localStorage.setItem('vrm.ambient', effect);
  }, []);

  const handleToggleSubtitles = useCallback(() => {
    setShowSubtitles(prev => {
      const next = !prev;
      localStorage.setItem('vrm.showSubtitles', String(next));
      return next;
    });
  }, []);

  const handleToggleAutoEnvironment = useCallback(() => {
    setAutoEnvironment(prev => {
      const next = !prev;
      localStorage.setItem('vrm.autoEnvironment', String(next));
      return next;
    });
  }, []);

  const handleSpeakStart = useCallback(
    (audioUrl: string, messageText?: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audioConnected) setAudioConnected(true);

      // Always stop both audio sources before starting a new one
      audio.pause();
      audio.src = '';
      stopWebSpeech();

      // Trigger animations regardless of audio source
      if (messageText) {
        setSpokenMessage(messageText);
        const { animName } = parseAnimTag(messageText);
        let triggered = false;
        if (animName) {
          const byName = findClipByName(animName);
          if (byName && viewerRef.current?.isVrmLoaded()) {
            viewerRef.current.playVrmaUrl(byName.url, { loop: false, fadeIn: 0.4 }).catch(console.warn);
            triggered = true;
          }
        }
        if (!triggered) {
          const match = findMatch(messageText, userLangPref);
          if (match && viewerRef.current?.isVrmLoaded()) {
            viewerRef.current.playVrmaUrl(match.url, { loop: false, fadeIn: 0.4 }).catch(console.warn);
          }
        }
      }

      if (isWebSpeechUrl(audioUrl)) {
        // Web Speech path — ElevenLabs is NOT used
        const text = getWebSpeechText(audioUrl);
        speakWithWebSpeech(text, {
          onStart: () => { setIsSpeaking(true); setIsWebSpeechActive(true); },
          onEnd:   () => { setIsSpeaking(false); setIsWebSpeechActive(false); },
          onError: () => { setIsSpeaking(false); setIsWebSpeechActive(false); },
        });
      } else {
        // ElevenLabs path — Web Speech is NOT used
        setIsWebSpeechActive(false);
        audio.src = audioUrl;
        setIsSpeaking(true);
        audio.play().catch(() => setIsSpeaking(false));
      }
    },
    [findMatch, findClipByName, userLangPref, audioConnected],
  );

  const handleSpeakEnd = useCallback(() => {
    audioRef.current?.pause();
    stopWebSpeech();
    setIsSpeaking(false);
    setIsWebSpeechActive(false);
  }, []);

  const handleUserMessage = useCallback(
    (text: string) => {
      // User interacted, ensures audio can play
      if (!audioConnected) setAudioConnected(true);
      lastInteractionTime.current = Date.now();
    },
    [audioConnected],
  );

  const handleCameraPresetChange = useCallback((preset: CameraPreset) => {
    setCurrentCameraPreset(preset);
    viewerRef.current?.setCameraPreset(preset);
  }, []);

  const handleCameraFreeModeChange = useCallback((enabled: boolean) => {
    setIsCameraFree(enabled);
    viewerRef.current?.setCameraFree(enabled);
  }, []);

  const handleToggleChat = useCallback(() => {
    setChatOpen((v) => {
      if (!v) setHasUnread(false);
      return !v;
    });
    lastInteractionTime.current = Date.now();
  }, []);

  const handleLevelUp = useCallback((level: number) => {
    // Cari animasi kategori 'reaction' atau 'emote' yang bahagia
    const reactionClips = clips.filter(c => c.category === 'reaction' || c.category === 'emote');
    if (reactionClips.length > 0 && viewerRef.current?.isVrmLoaded()) {
      const randomClip = reactionClips[Math.floor(Math.random() * reactionClips.length)];
      const result = findClipByName(randomClip.name);
      if (result) {
        viewerRef.current.playVrmaUrl(result.url, { loop: false, fadeIn: 0.5 }).catch(console.warn);
      }
    }
  }, [clips, findClipByName]);

  // Dynamic Environment Cycle (Day/Night)
  useEffect(() => {
    if (!autoEnvironment || !viewerRef.current?.isVrmLoaded()) return;

    const updateEnvironmentByTime = () => {
      const hour = new Date().getHours();
      let lighting: string;
      let env: string;

      if (hour >= 5 && hour < 10) {
        lighting = 'morning';
        env = 'morning-sky';
      } else if (hour >= 10 && hour < 17) {
        lighting = 'daylight';
        env = 'daylight-sky';
      } else if (hour >= 17 && hour < 19) {
        lighting = 'sunset';
        env = 'sunset-sky';
      } else {
        lighting = 'night-outdoor';
        env = 'night-sky';
      }

      const viewer = viewerRef.current;
      if (viewer) {
        // Only trigger if background images aren't currently override everything 
        // Background images are usually set via setImageBackground
        // We'll trust setEnvironment/setLighting to handle state properly inside VrmViewer
        const currentEnv = viewer.getCurrentEnvironment();
        if (currentEnv !== env) {
          viewer.setEnvironment(env);
          
          import('@/lib/vrm-lighting').then(({ LIGHTING_PRESETS }) => {
            if (LIGHTING_PRESETS[lighting]) {
              viewer.setLighting(LIGHTING_PRESETS[lighting]);
            }
          });
          
          console.log(`[Dynamic Env] Auto-switched to ${lighting} based on hour ${hour}`);
        }
      }
    };

    updateEnvironmentByTime();
    const interval = setInterval(updateEnvironmentByTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [autoEnvironment]);

  // Deep Idle (Boredom V2) Implementation
  useEffect(() => {
    const interval = setInterval(() => {
      const idleTime = Date.now() - lastInteractionTime.current;
      if (idleTime > 60000 && !isSpeaking) {
        // Reset timer immediately to avoid spamming
        lastInteractionTime.current = Date.now();
        
        // Pilih animasi idle dari library (Mixamo VRMA)
        const idleClips = clips.filter(c => c.category === 'idle');
        if (idleClips.length > 0 && viewerRef.current?.isVrmLoaded()) {
          const randomIdle = idleClips[Math.floor(Math.random() * idleClips.length)];
          const result = findClipByName(randomIdle.name);
          if (result) {
            viewerRef.current.playVrmaUrl(result.url, { loop: false, fadeIn: 0.8 }).catch(console.warn);
          }
        }
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [clips, isSpeaking, findClipByName]);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onToggleChat: handleToggleChat,
  });

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background cyber-grid-animated flex">
      <NewUserModelBanner />
      <OnboardingGuide />
      <KeyboardShortcutsHelp />

      {/* Full-screen VRM Viewer Background Layer */}
      <div className="absolute inset-0 z-0">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin neon-glow-purple" />
            </div>
          }
        >
          <ErrorBoundary
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Gagal memuat viewer 3D</p>
                  <p className="text-xs text-muted-foreground/60">Coba refresh halaman</p>
                </div>
              </div>
            }
          >
            <VrmViewer
              ref={viewerRef}
              modelUrl={modelUrl}
              isSpeaking={isSpeaking}
              isWebSpeechActive={isWebSpeechActive}
              audioElement={audioEl}
              currentMessage={spokenMessage}
              getAudioLevel={audioConnected ? getAudioLevel : undefined}
              onLevelUp={handleLevelUp}
              ambientEffect={ambientEffect}
              showSubtitles={showSubtitles}
              className="w-full h-full"
            />
          </ErrorBoundary>
        </Suspense>
      </div>

      {/* Content Layer - VRM Viewer area (for controls only) */}
      <div className="flex-1 relative min-w-0 scanlines z-30 pointer-events-none">
        {/* Right-side vertical control column — all controls in one column */}
        <TooltipProvider delayDuration={600}>
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col gap-2 z-40 pointer-events-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto overflow-x-visible scrollbar-none"
          style={{ scrollbarWidth: 'none' }}>
          {/* User menu — identity, stands alone */}
          <UserMenu />

          {/* Divider */}
          <div className="h-px mx-1" style={{ background: 'rgba(168,85,247,0.25)' }} />

          {/* Chat + scene controls — one logical group */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleChat}
                className={`relative h-10 w-10 btn-overlay transition-all ${chatOpen ? 'active' : ''}`}
              >
                {chatOpen ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                {!chatOpen && hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background animate-pulse neon-glow-purple-strong" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="panel-overlay border-0 text-xs text-foreground/90">
              {chatOpen ? 'Tutup chat' : 'Buka chat'} <span className="opacity-40 ml-1">Ctrl+K</span>
            </TooltipContent>
          </Tooltip>

          {modelUrl && (
            <>
              <CameraControls
                onPresetChange={handleCameraPresetChange}
                onFreeModeChange={handleCameraFreeModeChange}
                isFreeMode={isCameraFree}
                currentPreset={currentCameraPreset}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <BackgroundSelector
                      onBackgroundChange={(imageUrl) => viewerRef.current?.setImageBackground(imageUrl)}
                      onEnvironmentChange={(preset) => viewerRef.current?.setEnvironment(preset)}
                      currentEnvironment={viewerRef.current?.getCurrentEnvironment() ?? 'cyberpunk-void'}
                      currentAmbient={ambientEffect}
                      onAmbientChange={handleAmbientChange}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="panel-overlay border-0 text-xs text-foreground/90">
                  Background & Environment
                </TooltipContent>
              </Tooltip>
              <LightingControls
                onLightingChange={(config) => viewerRef.current?.setLighting(config)}
                onExposureChange={(val) => viewerRef.current?.setExposure(val)}
                initialConfig={viewerRef.current?.getCurrentLighting() || undefined}
              />
            </>
          )}
        </div>
        </TooltipProvider>

        {/* Top bar — app name only */}
        <div className="absolute top-0 left-0 right-0 flex items-center px-3 md:px-4 z-40 pointer-events-none"
          style={{
            paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
            paddingBottom: '3rem',
            background: 'linear-gradient(to bottom, rgba(6,4,14,0.55) 0%, rgba(6,4,14,0.15) 70%, transparent 100%)'
          }}>
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="w-7 h-7 rounded-lg btn-overlay flex items-center justify-center">
              <span className="text-xs font-bold text-neon-purple">V</span>
            </div>
            <h1 className="text-sm font-semibold tracking-tight hidden sm:block text-neon-purple"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              VRM Assistant
            </h1>
          </div>
        </div>
      </div>

      {/* Chat panel - always mobile-style (overlay) for both desktop and mobile */}
      <ChatPanel
        onSpeakStart={handleSpeakStart}
        onSpeakEnd={handleSpeakEnd}
        onUserMessage={handleUserMessage}
        voiceId={voiceId}
        ttsProvider={activeProvider}
        onTTSRateLimit={handleRateLimit}
        isMobile={true} // Always use mobile layout
        isOpen={chatOpen}
        onToggle={handleToggleChat}
        onUnreadChange={setHasUnread}
        personality={personality}
        isSpeaking={isSpeaking}
        showSubtitles={showSubtitles}
        onToggleSubtitles={handleToggleSubtitles}
        availableAnimations={clips.map(c => c.name)}
      />
    </div>
  );
}
