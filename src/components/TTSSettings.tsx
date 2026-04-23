import { useState, useEffect, useMemo } from 'react';
import { Volume2, Mic, AlertTriangle, CheckCircle, Play, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateTTS } from '@/lib/chat-api';
import {
  listWebSpeechVoices,
  setWebSpeechVoice,
  getWebSpeechVoice,
  speakWithWebSpeech,
  stopWebSpeech,
  type WebSpeechVoiceInfo,
} from '@/lib/web-speech-tts';
import { toast } from 'sonner';
import type { TTSProvider } from '@/hooks/useTTSProvider';

interface VoiceRow {
  id: string;
  voice_id: string;
  voice_name: string;
  is_active: boolean;
  gender: string;
}

interface TTSSettingsProps {
  isPro: boolean;
  provider: TTSProvider;
  rateLimited: boolean;
  onProviderChange: (p: TTSProvider) => void;
  activeModelGender: 'male' | 'female';
  voices: VoiceRow[];
  onVoicesRefresh: () => void;
}

const PREVIEW_TEXT = 'Halo! Saya siap membantu kamu hari ini.';

export default function TTSSettings({
  isPro,
  provider,
  rateLimited,
  onProviderChange,
  activeModelGender,
  voices,
  onVoicesRefresh,
}: TTSSettingsProps) {
  const [expanded, setExpanded] = useState<TTSProvider | null>(provider);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [webVoices, setWebVoices] = useState<WebSpeechVoiceInfo[]>([]);
  const [selectedWebURI, setSelectedWebURI] = useState<string | null>(getWebSpeechVoice());

  // Load web speech voices (async — voices populate after voiceschanged)
  useEffect(() => {
    const refresh = () => setWebVoices(listWebSpeechVoices());
    refresh();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', refresh);
      const t = setTimeout(refresh, 500);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', refresh);
        clearTimeout(t);
      };
    }
  }, []);

  // Filter ElevenLabs voices by gender
  const filteredEleven = useMemo(
    () => voices.filter((v) => v.gender === activeModelGender),
    [voices, activeModelGender]
  );

  // Filter Web Speech voices by gender + bucket unknown separately
  const matchedWeb = useMemo(
    () => webVoices.filter((v) => v.gender === activeModelGender),
    [webVoices, activeModelGender]
  );
  const unknownWeb = useMemo(
    () => webVoices.filter((v) => v.gender === 'unknown'),
    [webVoices]
  );

  const handleToggleCard = (p: TTSProvider) => {
    if (p === 'elevenlabs' && !isPro) return;
    onProviderChange(p);
    setExpanded((cur) => (cur === p ? null : p));
  };

  const handleSelectEleven = async (voice: VoiceRow) => {
    await supabase.from('voice_settings').update({ is_active: false }).neq('id', voice.id);
    const { error } = await supabase.from('voice_settings').update({ is_active: true }).eq('id', voice.id);
    if (error) toast.error('Gagal memilih suara');
    else { toast.success(`Suara "${voice.voice_name}" diaktifkan`); onVoicesRefresh(); }
  };

  const handlePreviewEleven = async (e: React.MouseEvent, voice: VoiceRow) => {
    e.stopPropagation();
    if (previewingId) return;
    setPreviewingId(voice.id);
    try {
      const ttsResult = await generateTTS(PREVIEW_TEXT, voice.voice_id);
      if (ttsResult.url) {
        const audio = new Audio(ttsResult.url);
        audio.onended = () => setPreviewingId(null);
        audio.onerror = () => { setPreviewingId(null); toast.error('Gagal memutar preview'); };
        await audio.play();
      } else {
        toast.error('Gagal generate preview: ' + ttsResult.error);
        setPreviewingId(null);
      }
    } catch {
      toast.error('Gagal memutar preview');
      setPreviewingId(null);
    }
  };

  const handleSelectWeb = (voice: WebSpeechVoiceInfo) => {
    setWebSpeechVoice(voice.voiceURI);
    setSelectedWebURI(voice.voiceURI);
    toast.success(`Suara "${voice.name}" disimpan`);
  };

  const handlePreviewWeb = (e: React.MouseEvent, voice: WebSpeechVoiceInfo) => {
    e.stopPropagation();
    if (previewingId) return;
    setPreviewingId(voice.voiceURI);
    speakWithWebSpeech(PREVIEW_TEXT, {
      voiceURI: voice.voiceURI,
      lang: voice.lang,
      onEnd: () => setPreviewingId(null),
      onError: () => { setPreviewingId(null); toast.error('Gagal memutar preview'); },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Text-to-Speech</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pilih mesin & suara — otomatis difilter sesuai gender model aktif
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary border border-border/50 text-muted-foreground font-medium uppercase">
            {activeModelGender}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        {/* ElevenLabs card */}
        <div
          className={`rounded-xl border transition-all ${
            provider === 'elevenlabs' && !rateLimited
              ? 'border-primary/50 bg-primary/5'
              : 'border-border/50 bg-secondary/30'
          } ${!isPro ? 'opacity-50' : ''}`}
        >
          <button
            type="button"
            disabled={!isPro}
            onClick={() => handleToggleCard('elevenlabs')}
            className={`w-full flex items-start gap-3 p-3.5 text-left ${!isPro ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              provider === 'elevenlabs' && !rateLimited ? 'bg-primary/15' : 'bg-secondary'
            }`}>
              <Volume2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">ElevenLabs</span>
                {!isPro && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">PRO</span>
                )}
                {rateLimited && provider === 'elevenlabs' && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-500">
                    <AlertTriangle className="w-3 h-3" /> Rate limit
                  </span>
                )}
                {provider === 'elevenlabs' && !rateLimited && (
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                )}
                {isPro && (
                  <ChevronDown
                    className={`ml-auto w-4 h-4 text-muted-foreground transition-transform ${
                      expanded === 'elevenlabs' ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suara AI berkualitas tinggi — lebih natural dan ekspresif
              </p>
            </div>
          </button>

          {isPro && expanded === 'elevenlabs' && (
            <div className="border-t border-border/40 p-3 space-y-2">
              {filteredEleven.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Tidak ada suara {activeModelGender} di library. Tambah voice baru via admin.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredEleven.map((voice) => (
                    <div
                      key={voice.id}
                      onClick={() => handleSelectEleven(voice)}
                      className={`relative rounded-lg border p-2.5 cursor-pointer transition-all ${
                        voice.is_active
                          ? 'border-primary/40 bg-primary/8'
                          : 'border-border/50 bg-card/50 hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className={`text-xs font-semibold truncate flex-1 ${voice.is_active ? 'text-primary' : 'text-foreground'}`}>
                          {voice.voice_name}
                        </p>
                        {voice.is_active && <CheckCircle className="w-3 h-3 text-primary shrink-0" />}
                      </div>
                      <button
                        onClick={(e) => handlePreviewEleven(e, voice)}
                        disabled={!!previewingId}
                        className={`flex items-center gap-1 text-[10px] font-medium ${
                          previewingId === voice.id ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground'
                        }`}
                      >
                        {previewingId === voice.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Memutar…</>
                        ) : (
                          <><Play className="w-3 h-3" /> Preview</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Web Speech card */}
        <div
          className={`rounded-xl border transition-all ${
            provider === 'webspeech' || rateLimited
              ? 'border-primary/50 bg-primary/5'
              : 'border-border/50 bg-secondary/30'
          }`}
        >
          <button
            type="button"
            onClick={() => handleToggleCard('webspeech')}
            className="w-full flex items-start gap-3 p-3.5 text-left cursor-pointer"
          >
            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              provider === 'webspeech' || rateLimited ? 'bg-primary/15' : 'bg-secondary'
            }`}>
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Web Speech</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">Default</span>
                {(provider === 'webspeech' || rateLimited) && (
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                )}
                <ChevronDown
                  className={`ml-auto w-4 h-4 text-muted-foreground transition-transform ${
                    expanded === 'webspeech' ? 'rotate-180' : ''
                  }`}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suara bawaan browser — gratis, tanpa batas. Tergantung OS.
              </p>
            </div>
          </button>

          {expanded === 'webspeech' && (
            <div className="border-t border-border/40 p-3 space-y-3">
              {webVoices.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Memuat daftar suara browser…
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-2">
                      Cocok ({activeModelGender}) — {matchedWeb.length}
                    </p>
                    {matchedWeb.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/70 italic">
                        Tidak ada voice {activeModelGender} terdeteksi di OS ini. Lihat daftar "Tidak diketahui" di bawah.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {matchedWeb.map((v) => (
                          <WebVoiceRow
                            key={v.voiceURI}
                            voice={v}
                            isSelected={selectedWebURI === v.voiceURI}
                            isPreviewing={previewingId === v.voiceURI}
                            onSelect={() => handleSelectWeb(v)}
                            onPreview={(e) => handlePreviewWeb(e, v)}
                            disabled={!!previewingId}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {unknownWeb.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-2">
                        Tidak diketahui — {unknownWeb.length}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                        {unknownWeb.map((v) => (
                          <WebVoiceRow
                            key={v.voiceURI}
                            voice={v}
                            isSelected={selectedWebURI === v.voiceURI}
                            isPreviewing={previewingId === v.voiceURI}
                            onSelect={() => handleSelectWeb(v)}
                            onPreview={(e) => handlePreviewWeb(e, v)}
                            disabled={!!previewingId}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedWebURI && (
                    <button
                      onClick={() => { setWebSpeechVoice(null); setSelectedWebURI(null); stopWebSpeech(); }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Reset ke pilihan otomatis
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {rateLimited && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>ElevenLabs mencapai batas penggunaan. Otomatis beralih ke Web Speech. Pilih ElevenLabs lagi untuk mencoba ulang.</span>
        </div>
      )}
    </div>
  );
}

function WebVoiceRow({
  voice, isSelected, isPreviewing, onSelect, onPreview, disabled,
}: {
  voice: WebSpeechVoiceInfo;
  isSelected: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: (e: React.MouseEvent) => void;
  disabled: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-primary/40 bg-primary/8'
          : 'border-border/50 bg-card/50 hover:border-border/80'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
          {voice.name}
        </p>
        <p className="text-[10px] text-muted-foreground/70 truncate">{voice.lang}</p>
      </div>
      <button
        onClick={onPreview}
        disabled={disabled}
        className={`shrink-0 w-6 h-6 rounded flex items-center justify-center ${
          isPreviewing ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground hover:bg-secondary'
        }`}
        title="Preview"
      >
        {isPreviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      </button>
      {isSelected && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
    </div>
  );
}
