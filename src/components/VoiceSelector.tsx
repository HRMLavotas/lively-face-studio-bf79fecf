import { supabase } from '@/integrations/supabase/client';
import { Volume2, Check, Mic } from 'lucide-react';
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

export default function VoiceSelector({ voices, onRefresh }: VoiceSelectorProps) {
  const handleSelect = async (id: string) => {
    // Deactivate all, then activate selected
    await supabase.from('voice_settings').update({ is_active: false }).neq('id', id);
    const { error } = await supabase.from('voice_settings').update({ is_active: true }).eq('id', id);
    if (error) toast.error('Gagal memilih suara');
    else { toast.success('Suara diperbarui'); onRefresh(); }
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
        <div className="rounded-xl border border-dashed border-border/50 p-6 text-center">
          <Volume2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada suara tersedia</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {voices.map((voice) => (
            <button
              key={voice.id}
              onClick={() => handleSelect(voice.id)}
              className={`relative rounded-xl border p-3.5 text-left transition-all group ${
                voice.is_active
                  ? 'border-primary/40 bg-primary/8 shadow-sm shadow-primary/10'
                  : 'border-border/50 bg-card/50 hover:border-border/80 hover:bg-card/70'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
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
              {voice.is_active && (
                <p className="text-[10px] text-primary/70 mt-0.5">Aktif</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
