import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Crown, Volume2 } from 'lucide-react';
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
    const { error } = await supabase
      .from('voice_settings')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      toast.error('Gagal memilih suara');
    } else {
      toast.success('Suara diperbarui');
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">Suara TTS</h2>
        <Badge variant="outline" className="text-xs border-primary/40 text-primary">
          <Crown className="w-3 h-3 mr-1" /> Pro
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {voices.map((voice) => (
          <button
            key={voice.id}
            onClick={() => handleSelect(voice.id)}
            className={`rounded-lg border p-3 text-left transition-all hover:border-primary/40 ${
              voice.is_active
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <Volume2 className={`w-3.5 h-3.5 shrink-0 ${voice.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium text-foreground truncate">{voice.voice_name}</span>
            </div>
            {voice.is_active && (
              <Badge className="mt-2 text-xs bg-primary/20 text-primary border-primary/30">
                Aktif
              </Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
