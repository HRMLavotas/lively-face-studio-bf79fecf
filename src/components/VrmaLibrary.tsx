import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export interface VrmaItem {
  id: string;
  name: string;
  file_path: string;
  file_name: string;
  category: string;
  trigger_keywords: string[];
  is_active: boolean;
}

interface VrmaLibraryProps {
  refreshKey?: number;
  onPlay: (url: string, item: VrmaItem) => void;
}

export default function VrmaLibrary({ refreshKey, onPlay }: VrmaLibraryProps) {
  const [items, setItems] = useState<VrmaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vrma_animations')
      .select('id, name, file_path, file_name, category, trigger_keywords, is_active')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Gagal memuat library');
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handlePlay = (item: VrmaItem) => {
    const { data } = supabase.storage.from('vrma-animations').getPublicUrl(item.file_path);
    if (data?.publicUrl) onPlay(data.publicUrl, item);
  };

  const handleToggle = async (item: VrmaItem) => {
    const { error } = await supabase
      .from('vrma_animations')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) toast.error('Gagal update');
    else load();
  };

  const handleDelete = async (item: VrmaItem) => {
    if (!confirm(`Hapus "${item.name}"?`)) return;
    await supabase.storage.from('vrma-animations').remove([item.file_path]);
    const { error } = await supabase.from('vrma_animations').delete().eq('id', item.id);
    if (error) toast.error('Gagal hapus');
    else {
      toast.success('Animasi dihapus');
      load();
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground font-mono">Loading library…</p>;
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground font-mono">Belum ada animasi tersimpan.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/40"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{item.name}</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                {item.category}
              </Badge>
            </div>
            {item.trigger_keywords.length > 0 && (
              <p className="text-[10px] text-muted-foreground truncate font-mono">
                {item.trigger_keywords.join(', ')}
              </p>
            )}
          </div>
          <Switch
            checked={item.is_active}
            onCheckedChange={() => handleToggle(item)}
            aria-label="Toggle active"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePlay(item)}>
            <Play className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => handleDelete(item)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
