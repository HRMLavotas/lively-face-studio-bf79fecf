import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shows a dismissible banner when a logged-in user has no VRM model yet.
 */
export default function NewUserModelBanner() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;

    let cancelled = false;

    const check = async () => {
      const { data } = await supabase
        .from('vrm_models')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setChecked(true);
      if (!data) setShow(true);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [user, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
  };

  if (!checked || !show) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-card/90 backdrop-blur-md shadow-lg p-3.5">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center mt-0.5">
          <Upload className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            Tambahkan model VRM terlebih dahulu
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Kamu belum memiliki model karakter. Pergi ke Pengaturan untuk upload model VRM-mu.
          </p>
          <Link to="/settings" onClick={handleDismiss}>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs gap-1.5 bg-primary/10 border-primary/30 hover:bg-primary/20"
            >
              Buka Pengaturan <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
