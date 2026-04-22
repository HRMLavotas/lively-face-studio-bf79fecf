import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Volume2, Check, Mic, Play, Loader2 } from 'lucide-react';
import { generateTTS } from '@/lib/chat-api';
import { toast } from 'sonner';

interface VoiceSetting {
  id: string;
  voice_id: string;
  voice_name: string;
  is_active: boolean;
}

interface VoiceSelectorProps {
  voices: VoiceSetting[];
  onRefresh: () => void;
}

const PREVIEW_TEXT = 'Halo! Saya siap membantu kamu hari ini.';

export default function VoiceSelector({ voices, onRefresh }: VoiceSelectorProps) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handleSelect = async (voice: VoiceSetting) => {
    // Deactivate all, then activate selected
    await supabase.from('voice_settings').update({ is_active: false }).neq('id', voice.id);
    const { error } = await supabase.from('voice_settings').update({ is_active: true }).eq('id', voice.id);
    if (error) toast.error('Gagal memilih suara');
    else { toast.success(`Suara "${voice.voice_name}" diaktifkan`); onRefresh(); }
  };

  const handlePreview = async (e: React.MouseEvent, voice: VoiceSetting) => {
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

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Mic className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Suara TTS</h2>
          <p className="text-[11px] text-muted-foreground">Pilih suara ElevenLabs untuk asisten</p>
        </div>
      </div>

      {voices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-6 text-center space-y-2">
          <Volume2 className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Belum ada suara tersedia</p>
          <p className="text-xs text-muted-foreground/60">Suara akan muncul setelah admin menambahkan voice settings</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {voices.map((voice) => (
            <button
              key={voice.id}
              onClick={() => handleSelect(voice)}
              className={`relative rounded-xl border p-3.5 text-left transition-all group ${
                voice.is_active
                  ? 'border-primary/40 bg-primary/8 shadow-sm shadow-primary/10'
                  : 'border-border/50 bg-card/50 hover:border-border/80 hover:bg-card/70'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  voice.is_active ? 'bg-primary/15 border border-primary/25' : 'bg-secondary border border-border/60'
                }`}>
                  <Volume2 className={`w-3.5 h-3.5 ${voice.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                {voice.is_active && (
                  <span className="ml-auto w-4 h-4 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-primary" />
                  </span>
                )}
              </div>

              <p className={`text-xs font-semibold truncate ${voice.is_active ? 'text-primary' : 'text-foreground'}`}>
                {voice.voice_name}
              </p>

              {/* Preview button */}
              <button
                onClick={(e) => handlePreview(e, voice)}
                disabled={!!previewingId}
                className={`mt-2 flex items-center gap-1 text-[10px] font-medium transition-colors ${
                  previewingId === voice.id
                    ? 'text-primary'
                    : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
                title="Preview suara"
              >
                {previewingId === voice.id ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Memutar…</>
                ) : (
                  <><Play className="w-3 h-3" /> Preview</>
                )}
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
