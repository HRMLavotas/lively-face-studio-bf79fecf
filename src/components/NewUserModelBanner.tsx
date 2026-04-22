import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NewUserModelBanner() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;
    let cancelled = false;
    supabase
      .from('vrm_models')
      .select('id')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setChecked(true);
        if (!data) setShow(true);
      });
    return () => { cancelled = true; };
  }, [user, dismissed]);

  if (!checked || !show) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-full max-w-sm px-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-card/95 backdrop-blur-xl shadow-xl shadow-black/30 p-3.5 animate-msg-in">
        <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center mt-0.5">
          <Upload className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">
            Tambahkan model VRM
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Belum ada karakter. Pergi ke Pengaturan untuk upload model VRM-mu.
          </p>
          <Link to="/settings" onClick={() => setShow(false)}>
            <Button
              size="sm"
              className="mt-2.5 h-7 text-xs gap-1.5 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25"
              variant="outline"
            >
              Buka Pengaturan <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <button
          onClick={() => { setDismissed(true); setShow(false); }}
          className="shrink-0 p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
