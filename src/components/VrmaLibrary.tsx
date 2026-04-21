import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { LangCode } from '@/lib/lang-detect';

export interface VrmaItem {
  id: string;
  name: string;
  file_path: string;
  file_name: string;
  category: string;
  trigger_keywords: string[];
  trigger_keywords_i18n: Partial<Record<LangCode, string[]>>;
  is_active: boolean;
}

const LANGS: LangCode[] = ['id', 'en', 'ja', 'ko', 'zh', 'th', 'vi'];
const LANG_LABEL: Record<LangCode, string> = {
  id: 'ID', en: 'EN', ja: 'JA', ko: 'KO', zh: 'ZH', th: 'TH', vi: 'VI',
};

const CATEGORIES = ['talking', 'greeting', 'idle', 'emote', 'gesture', 'reaction'] as const;

// Category badge color map
const CATEGORY_COLOR: Record<string, string> = {
  talking:  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  greeting: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  idle:     'bg-sky-500/20 text-sky-400 border-sky-500/30',
  emote:    'bg-violet-500/20 text-violet-400 border-violet-500/30',
  gesture:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  reaction: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

interface VrmaLibraryProps {
  refreshKey?: number;
  onPlay: (url: string, item: VrmaItem) => void;
}

interface EditState {
  name: string;
  category: string;
  keywords: string;
}

export default function VrmaLibrary({ refreshKey, onPlay }: VrmaLibraryProps) {
  const [items, setItems] = useState<VrmaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', category: '', keywords: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vrma_animations')
      .select('id, name, file_path, file_name, category, trigger_keywords, is_active')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
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

  const startEdit = (item: VrmaItem) => {
    setEditingId(item.id);
    setEditState({
      name: item.name,
      category: item.category,
      keywords: item.trigger_keywords.join(', '),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (item: VrmaItem) => {
    if (!editState.name.trim()) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    setSaving(true);
    const trigger_keywords = editState.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const { error } = await supabase
      .from('vrma_animations')
      .update({
        name: editState.name.trim(),
        category: editState.category,
        trigger_keywords,
      })
      .eq('id', item.id);

    setSaving(false);
    if (error) {
      toast.error('Gagal menyimpan');
    } else {
      toast.success(`"${editState.name.trim()}" diperbarui`);
      setEditingId(null);
      load();
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground font-mono">Loading library…</p>;
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground font-mono">Belum ada animasi tersimpan.</p>;
  }

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, VrmaItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});
  // Items with unknown categories
  const unknownCat = items.filter(
    (i) => !CATEGORIES.includes(i.category as (typeof CATEGORIES)[number])
  );
  if (unknownCat.length > 0) grouped['other'] = unknownCat;

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                CATEGORY_COLOR[cat] ?? 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {cat.toUpperCase()}
            </span>
            <span className="text-[10px] text-muted-foreground">{catItems.length} animasi</span>
          </div>
          <div className="space-y-1.5">
            {catItems.map((item) =>
              editingId === item.id ? (
                /* ── EDIT MODE ── */
                <div
                  key={item.id}
                  className="p-2.5 rounded-md border border-primary/40 bg-secondary/60 space-y-2"
                >
                  <Input
                    className="h-7 text-xs"
                    placeholder="Nama animasi"
                    value={editState.name}
                    onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                  />
                  <Select
                    value={editState.category}
                    onValueChange={(v) => setEditState((s) => ({ ...s, category: v }))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 text-xs"
                    placeholder="keyword1, keyword2, ..."
                    value={editState.keywords}
                    onChange={(e) => setEditState((s) => ({ ...s, keywords: e.target.value }))}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 text-xs gap-1 flex-1"
                      onClick={() => saveEdit(item)}
                      disabled={saving}
                    >
                      <Check className="w-3 h-3" />
                      {saving ? 'Menyimpan…' : 'Simpan'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1"
                      onClick={cancelEdit}
                    >
                      <X className="w-3 h-3" />
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ── */
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/40"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{item.name}</span>
                    {item.trigger_keywords.length > 0 ? (
                      <p className="text-[10px] text-muted-foreground truncate font-mono">
                        {item.trigger_keywords.join(', ')}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40 font-mono italic">
                        belum ada keyword
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={item.is_active}
                    onCheckedChange={() => handleToggle(item)}
                    aria-label="Toggle active"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handlePlay(item)}
                    title="Preview"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => startEdit(item)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(item)}
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
