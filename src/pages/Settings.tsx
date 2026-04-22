import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import ModelManager from '@/components/ModelManager';
import VoiceSelector from '@/components/VoiceSelector';
import LanguagePreference from '@/components/LanguagePreference';
import TTSSettings from '@/components/TTSSettings';
import { useTTSProvider } from '@/hooks/useTTSProvider';
import { useUserRole } from '@/hooks/useUserRole';

export default function Settings() {
  const navigate = useNavigate();
  const { isPro } = useUserRole();
  const { provider, rateLimited, setProvider } = useTTSProvider(isPro);
  const [models, setModels] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);

  const fetchModels = useCallback(async () => {
    const { data } = await supabase
      .from('vrm_models')
      .select('*')
      .order('created_at', { ascending: false });
    setModels(data ?? []);
  }, []);

  const fetchVoices = useCallback(async () => {
    const { data } = await supabase
      .from('voice_settings')
      .select('*')
      .order('voice_name');
    setVoices(data ?? []);
  }, []);

  useEffect(() => {
    fetchModels();
    fetchVoices();
  }, [fetchModels, fetchVoices]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary border border-border/60 flex items-center justify-center">
              <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">Pengaturan</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <ModelManager models={models} onRefresh={fetchModels} />
        <div className="border-t border-border/40" />
        <VoiceSelector voices={voices} onRefresh={fetchVoices} />
        <div className="border-t border-border/40" />
        <TTSSettings
          isPro={isPro}
          provider={provider}
          rateLimited={rateLimited}
          onProviderChange={setProvider}
        />
        <div className="border-t border-border/40" />
        <LanguagePreference />
      </div>
    </div>
  );
}
