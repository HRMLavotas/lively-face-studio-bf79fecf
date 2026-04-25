import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Trash2, Pencil, Check, X, Library, Loader2 } from 'lucide-react';
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

const CATEGORY_STYLE: Record<string, { dot: string; badge: string }> = {
  talking:  { dot: 'bg-cyan-400',    badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  greeting: { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  idle:     { dot: 'bg-sky-400',     badge: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  emote:    { dot: 'bg-violet-400',  badge: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  gesture:  { dot: 'bg-amber-400',   badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  reaction: { dot: 'bg-rose-400',    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
};

interface VrmaLibraryProps {
  refreshKey?: number;
  onPlay: (url: string, item: VrmaItem) => void;
}

interface EditState {
  name: string;
  category: string;
  keywordsByLang: Record<LangCode, string>;
}

const emptyKeywordsByLang = (): Record<LangCode, string> =>
  ({ id: '', en: '', ja: '', ko: '', zh: '', th: '', vi: '' });

export default function VrmaLibrary({ refreshKey, onPlay }: VrmaLibraryProps) {
  const [items, setItems] = useState<VrmaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', category: '', keywordsByLang: emptyKeywordsByLang() });
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vrma_animations')
      .select('id, name, file_path, file_name, category, trigger_keywords, trigger_keywords_i18n, is_active')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) toast.error('Gagal memuat library');
    else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems((data ?? []).map((d: any) => ({
        id: d.id, name: d.name, file_path: d.file_path, file_name: d.file_name,
        category: d.category, trigger_keywords: d.trigger_keywords ?? [],
        trigger_keywords_i18n: (d.trigger_keywords_i18n ?? {}) as Partial<Record<LangCode, string[]>>,
        is_active: d.is_active,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);  

  const handlePlay = (item: VrmaItem) => {
    const { data } = supabase.storage.from('vrma-animations').getPublicUrl(item.file_path);
    if (data?.publicUrl) {
      setPlayingId(item.id);
      onPlay(data.publicUrl, item);
      // Reset playing indicator after a short delay
      setTimeout(() => setPlayingId(null), 2000);
    } else {
      toast.error('Gagal mendapatkan URL animasi');
    }
  };

  const handleToggle = async (item: VrmaItem) => {
    const { error } = await supabase.from('vrma_animations').update({ is_active: !item.is_active }).eq('id', item.id);
    if (error) toast.error('Gagal update');
    else load();
  };

  const handleDelete = async (item: VrmaItem) => {
    if (!confirm(`Hapus "${item.name}"?`)) return;
    await supabase.storage.from('vrma-animations').remove([item.file_path]);
    const { error } = await supabase.from('vrma_animations').delete().eq('id', item.id);
    if (error) toast.error('Gagal hapus');
    else { toast.success('Animasi dihapus'); load(); }
  };

  const startEdit = (item: VrmaItem) => {
    setEditingId(item.id);
    const kbl = emptyKeywordsByLang();
    for (const lang of LANGS) kbl[lang] = (item.trigger_keywords_i18n[lang] ?? []).join(', ');
    setEditState({ name: item.name, category: item.category, keywordsByLang: kbl });
  };

  const saveEdit = async (item: VrmaItem) => {
    if (!editState.name.trim()) { toast.error('Nama tidak boleh kosong'); return; }
    setSaving(true);
    const i18n: Partial<Record<LangCode, string[]>> = {};
    const flat: string[] = [];
    const seen = new Set<string>();
    for (const lang of LANGS) {
      const arr = (editState.keywordsByLang[lang] ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      i18n[lang] = arr;
      for (const k of arr) { const key = k.toLowerCase(); if (!seen.has(key)) { seen.add(key); flat.push(k); } }
    }
    const { error } = await supabase.from('vrma_animations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ name: editState.name.trim(), category: editState.category, trigger_keywords: flat, trigger_keywords_i18n: i18n as any })
      .eq('id', item.id);
    setSaving(false);
    if (error) toast.error('Gagal menyimpan');
    else { toast.success(`"${editState.name.trim()}" diperbarui`); setEditingId(null); load(); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs">Memuat library…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-6 text-center">
        <Library className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Belum ada animasi tersimpan</p>
      </div>
    );
  }

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, VrmaItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unknownCat = items.filter((i) => !CATEGORIES.includes(i.category as any));
  if (unknownCat.length > 0) grouped['other'] = unknownCat;

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([cat, catItems]) => {
        const style = CATEGORY_STYLE[cat] ?? { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground border-border' };
        return (
          <div key={cat}>
            {/* Category header */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
                {cat}
              </span>
              <span className="text-[10px] text-muted-foreground/60">{catItems.length}</span>
            </div>

            <div className="space-y-1.5">
              {catItems.map((item) =>
                editingId === item.id ? (
                  /* Edit mode */
                  <div key={item.id} className="rounded-xl border border-primary/30 bg-secondary/40 p-3 space-y-2.5">
                    <Input
                      className="h-8 text-xs bg-background/50 border-border/50"
                      placeholder="Nama animasi"
                      value={editState.name}
                      onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                    />
                    <Select value={editState.category} onValueChange={(v) => setEditState((s) => ({ ...s, category: v }))}>
                      <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Language keyword tabs */}
                    <Tabs defaultValue="id" className="w-full">
                      <TabsList className="h-7 flex w-full overflow-x-auto bg-background/50 gap-0.5 p-0.5">
                        {LANGS.map((l) => (
                          <TabsTrigger key={l} value={l} className="text-[10px] px-2 h-6 shrink-0 relative data-[state=active]:bg-primary/20">
                            {LANG_LABEL[l]}
                            {(editState.keywordsByLang[l] ?? '').trim() && (
                              <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-primary" />
                            )}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {LANGS.map((l) => (
                        <TabsContent key={l} value={l} className="mt-1.5">
                          <Input
                            className="h-8 text-xs bg-background/50 border-border/50"
                            placeholder={`Keyword ${LANG_LABEL[l]} (pisahkan koma)`}
                            value={editState.keywordsByLang[l]}
                            onChange={(e) => setEditState((s) => ({ ...s, keywordsByLang: { ...s.keywordsByLang, [l]: e.target.value } }))}
                          />
                        </TabsContent>
                      ))}
                    </Tabs>

                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => saveEdit(item)} disabled={saving}>
                        <Check className="w-3 h-3" /> {saving ? 'Menyimpan…' : 'Simpan'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3" /> Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* View mode — name only + action buttons */
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      item.is_active
                        ? 'border-border/40 bg-secondary/30'
                        : 'border-border/20 bg-secondary/10 opacity-50'
                    }`}
                  >
                    {/* Name — truncates, never pushes buttons out */}
                    <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
                      {item.name}
                    </span>

                    {/* Buttons — fixed, never shrink */}
                    <button
                      onClick={() => handlePlay(item)}
                      title="Play"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      {playingId === item.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        : <Play className="w-3.5 h-3.5" />
                      }
                    </button>

                    <Switch
                      checked={item.is_active}
                      onCheckedChange={() => handleToggle(item)}
                      className="shrink-0 scale-[0.6]"
                    />

                    <button
                      onClick={() => startEdit(item)}
                      title="Edit"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDelete(item)}
                      title="Hapus"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
