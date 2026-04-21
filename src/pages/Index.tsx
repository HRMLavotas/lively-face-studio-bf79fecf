import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AudioStatusIndicator from '@/components/AudioStatusIndicator';
import ChatPanel from '@/components/ChatPanel';
import UserMenu from '@/components/UserMenu';
import NewUserModelBanner from '@/components/NewUserModelBanner';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { detectMood } from '@/lib/sentiment';
import { setTargetMood } from '@/lib/vrm-animations';
import { useVrmaTriggers } from '@/hooks/useVrmaTriggers';
import type { VrmViewerHandle } from '@/components/VrmViewer';
import type { LangCode } from '@/lib/lang-detect';

const VrmViewer = lazy(() => import('@/components/VrmViewer'));

export default function Index() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [modelUrl, setModelUrl] = useState('');
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [personality, setPersonality] = useState<string | undefined>(undefined);
  const [spokenMessage, setSpokenMessage] = useState<string>('');
  // Initialize from window width to avoid flash on first render
  const [chatOpen, setChatOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  // Persistent audio element — created once, src swapped per playback.
  // This is required because each <audio> element can only be attached to
  // a MediaElementAudioSourceNode ONCE per AudioContext lifetime, so reusing
  // the same element keeps lip sync working across every message.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerRef = useRef<VrmViewerHandle>(null);

  // Multilingual VRMA trigger matcher (loads keywords for all active clips)
  const { findMatch } = useVrmaTriggers();
  // User language preference (auto = null → detect from text). localStorage key.
  const userLangPref =
    (typeof window !== 'undefined'
      ? (localStorage.getItem('vrm.lang') as LangCode | null)
      : null) || null;
  if (audioRef.current === null && typeof window !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = 'anonymous';
  }

  // Wire ended/error handlers once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsSpeaking(false);
    const onError = () => setIsSpeaking(false);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    // Make the element available to VrmViewer immediately so the analyser
    // attaches once, before any TTS plays.
    setAudioEl(audio);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Auto-load active model & voice. Re-runs when user logs in/out so RLS-scoped queries refresh.
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
        const { data: urlData } = supabase.storage
          .from('vrm-models')
          .getPublicUrl(activeModel.file_path);
        if (urlData?.publicUrl) {
          setModelUrl(urlData.publicUrl);
        }
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
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSpeakStart = useCallback(
    (audioUrl: string, messageText?: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = audioUrl;
      if (messageText) {
        setSpokenMessage(messageText);
        // Multilingual gesture trigger from AI reply (runs alongside talking loop).
        const match = findMatch(messageText, userLangPref);
        if (match && viewerRef.current?.isVrmLoaded()) {
          console.log(
            `[Trigger] AI → "${match.matchedKeyword}" (${match.matchedLang}) → ${match.clip.name}`,
          );
          viewerRef.current
            .playVrmaUrl(match.url, { loop: false, fadeIn: 0.3 })
            .catch((e) => console.warn('[Trigger] play failed:', e));
        }
      }
      setIsSpeaking(true);
      audio.play().catch(() => setIsSpeaking(false));
    },
    [findMatch, userLangPref],
  );

  const handleSpeakEnd = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsSpeaking(false);
  }, []);

  // When user sends a message, immediately set a sympathetic / matching mood
  // AND check for multilingual VRMA keyword trigger.
  const handleUserMessage = useCallback(
    (text: string) => {
      const mood = detectMood(text);
      if (mood !== 'neutral') setTargetMood(mood);

      const match = findMatch(text, userLangPref);
      if (match && viewerRef.current?.isVrmLoaded()) {
        console.log(
          `[Trigger] User → "${match.matchedKeyword}" (${match.matchedLang}) → ${match.clip.name}`,
        );
        viewerRef.current
          .playVrmaUrl(match.url, { loop: false, fadeIn: 0.3 })
          .catch((e) => console.warn('[Trigger] play failed:', e));
      }
    },
    [findMatch, userLangPref],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background flex">
      {/* New user model banner */}
      <NewUserModelBanner />

      {/* VRM Viewer — main area */}
      <div className="flex-1 relative">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          }
        >
          <VrmViewer
            ref={viewerRef}
            modelUrl={modelUrl}
            isSpeaking={isSpeaking}
            audioElement={audioEl}
            currentMessage={spokenMessage}
          />
        </Suspense>

        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <h1 className="text-lg font-semibold text-foreground text-glow tracking-tight">
            VRM Assistant
          </h1>
          <div className="flex items-center gap-2">
            <AudioStatusIndicator isSpeaking={isSpeaking} />
            <UserMenu />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setChatOpen(!chatOpen)}
              className="h-8 w-8 border-border bg-secondary/60 backdrop-blur-md hover:bg-secondary"
            >
              {chatOpen ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Chat — desktop sidebar or mobile overlay */}
      {isMobile ? (
        <ChatPanel
          onSpeakStart={handleSpeakStart}
          onSpeakEnd={handleSpeakEnd}
          onUserMessage={handleUserMessage}
          voiceId={voiceId}
          isMobile
          isOpen={chatOpen}
          onToggle={() => setChatOpen(!chatOpen)}
          personality={personality}
        />
      ) : (
        chatOpen && (
          <div className="w-[360px] h-full shrink-0">
            <ChatPanel
              onSpeakStart={handleSpeakStart}
              onSpeakEnd={handleSpeakEnd}
              onUserMessage={handleUserMessage}
              voiceId={voiceId}
              personality={personality}
            />
          </div>
        )
      )}
    </div>
  );
}
