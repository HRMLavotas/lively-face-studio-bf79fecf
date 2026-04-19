import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ModelManager from '@/components/ModelManager';
import VoiceSelector from '@/components/VoiceSelector';

export default function Settings() {
  const navigate = useNavigate();
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
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
            className="h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Pengaturan</h1>
        </div>

        <div className="space-y-8">
          <ModelManager models={models} onRefresh={fetchModels} />
          <div className="border-t border-border" />
          <VoiceSelector voices={voices} onRefresh={fetchVoices} />
        </div>
      </div>
    </div>
  );
}
