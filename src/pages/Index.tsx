import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AudioStatusIndicator from '@/components/AudioStatusIndicator';
import ChatPanel from '@/components/ChatPanel';
import UserMenu from '@/components/UserMenu';
import NewUserModelBanner from '@/components/NewUserModelBanner';
import CameraControls from '@/components/CameraControls';
import OnboardingGuide from '@/components/OnboardingGuide';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [hasUnread, setHasUnread] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerRef = useRef<VrmViewerHandle>(null);

  const { connectAudioElement, getAudioLevel } = useAudioAnalyser();
  const { findMatch, findClipByName } = useVrmaTriggers();
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
      if (!audioConnected) setAudioConnected(true);
      const match = findMatch(text, userLangPref, ['greeting', 'emote']);
      if (match && viewerRef.current?.isVrmLoaded()) {
        viewerRef.current.playVrmaUrl(match.url, { loop: false, fadeIn: 0.4 }).catch(console.warn);
      }
    },
    [findMatch, userLangPref, audioConnected],
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
  }, []);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onToggleChat: handleToggleChat,
  });

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background cyber-grid-animated flex">
      <NewUserModelBanner />
      <OnboardingGuide />
      <KeyboardShortcutsHelp />

      {/* VRM Viewer — main area */}
      <div className="flex-1 relative min-w-0 scanlines">
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
              idlePresetId={idlePresetId}
            />
          </ErrorBoundary>
        </Suspense>

        {/* Camera Controls */}
        {modelUrl && (
          <CameraControls
            onPresetChange={handleCameraPresetChange}
            onFreeModeChange={handleCameraFreeModeChange}
            isFreeMode={isCameraFree}
            currentPreset={currentCameraPreset}
          />
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 z-10">
          {/* App name */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-neon-purple-bright flex items-center justify-center neon-glow-purple">
              <span className="text-primary text-xs font-bold text-neon-purple">V</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground/90 tracking-tight hidden sm:block text-neon-purple">
              VRM Assistant
            </h1>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <AudioStatusIndicator isSpeaking={isSpeaking} />
            <UserMenu />

            {/* Chat toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleToggleChat}
              className="relative h-8 w-8 border-neon-purple-bright cyber-glass hover-neon-glow transition-all"
              title={`${chatOpen ? 'Tutup' : 'Buka'} chat (Ctrl+K) · ? untuk shortcuts`}
            >
              {chatOpen
                ? <X className="w-4 h-4" />
                : <MessageSquare className="w-4 h-4" />
              }
              {/* Unread badge */}
              {!chatOpen && hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background animate-pulse neon-glow-purple-strong" />
              )}
            </Button>
          </div>
        </div>

        {/* Bottom gradient fade for mobile input bar */}
        {isMobile && !chatOpen && (
          <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none bg-gradient-to-t from-background/60 to-transparent" />
        )}
      </div>

      {/* Chat panel */}
      {isMobile ? (
        <ChatPanel
          onSpeakStart={handleSpeakStart}
          onSpeakEnd={handleSpeakEnd}
          onUserMessage={handleUserMessage}
          voiceId={voiceId}
          ttsProvider={activeProvider}
          onTTSRateLimit={handleRateLimit}
          isMobile
          isOpen={chatOpen}
          onToggle={handleToggleChat}
          onUnreadChange={setHasUnread}
          personality={personality}
          isSpeaking={isSpeaking}
        />
      ) : (
        chatOpen && (
          <div className="w-[320px] lg:w-[360px] h-full shrink-0 border-l border-neon-purple-bright">
            <ChatPanel
              onSpeakStart={handleSpeakStart}
              onSpeakEnd={handleSpeakEnd}
              onUserMessage={handleUserMessage}
              voiceId={voiceId}
              ttsProvider={activeProvider}
              onTTSRateLimit={handleRateLimit}
              onUnreadChange={setHasUnread}
              personality={personality}
              isSpeaking={isSpeaking}
            />
          </div>
        )
      )}
    </div>
  );
}
