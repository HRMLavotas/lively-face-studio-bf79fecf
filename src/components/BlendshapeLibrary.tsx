import { useEffect, useState } from 'react';
import { loadPresets, updatePreset, deletePreset, type BlendshapePreset } from '@/lib/blendshape-store';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Pencil, Trash2, Play, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export type { BlendshapePreset };
export const BLENDSHAPE_CATEGORIES = ['mood', 'emote', 'pose', 'custom'] as const;

const CATEGORY_STYLE: Record<string, { dot: string; badge: string }> = {
  mood:   { dot: 'bg-violet-400',  badge: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  emote:  { dot: 'bg-rose-400',    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  pose:   { dot: 'bg-amber-400',   badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  custom: { dot: 'bg-sky-400',     badge: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
};

const MODE_LABEL: Record<string, string> = {
  perfectsync: 'Perfect Sync',
  standard: 'Standard',
  both: 'Both',
};

interface Props {
  refreshKey?: number;
  onPreview?: (preset: BlendshapePreset) => void;
}

interface EditState {
  name: string;
  description: string;
  category: string;
  target_mode: string;
}

export default function BlendshapeLibrary({ refreshKey, onPreview }: Props) {
  const [items, setItems] = useState<BlendshapePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', description: '', category: 'custom', target_mode: 'both' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setItems(loadPresets());
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);  

  const handleToggle = (item: BlendshapePreset) => {
    updatePreset(item.id, { is_active: !item.is_active });
    load();
  };

  const handleDelete = (item: BlendshapePreset) => {
    if (!confirm(`Hapus preset "${item.name}"?`)) return;
    deletePreset(item.id);
    toast.success('Preset dihapus');
    load();
  };

  const startEdit = (item: BlendshapePreset) => {
    setEditingId(item.id);
    setEditState({ name: item.name, description: item.description, category: item.category, target_mode: item.target_mode });
  };

  const saveEdit = (item: BlendshapePreset) => {
    if (!editState.name.trim()) { toast.error('Nama tidak boleh kosong'); return; }
    setSaving(true);
    updatePreset(item.id, {
      name: editState.name.trim(),
      description: editState.description.trim(),
      category: editState.category,
      target_mode: editState.target_mode as any,
    });
    setSaving(false);
    toast.success('Preset diperbarui');
    setEditingId(null);
    load();
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
        <Layers className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Belum ada preset tersimpan</p>
      </div>
    );
  }

  const grouped = BLENDSHAPE_CATEGORIES.reduce<Record<string, BlendshapePreset[]>>((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});
  const other = items.filter(i => !BLENDSHAPE_CATEGORIES.includes(i.category as any));
  if (other.length > 0) grouped['other'] = other;

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([cat, catItems]) => {
        const style = CATEGORY_STYLE[cat] ?? { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground border-border' };
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
                {cat}
              </span>
              <span className="text-[10px] text-muted-foreground/60">{catItems.length}</span>
            </div>

            <div className="space-y-1.5">
              {catItems.map(item =>
                editingId === item.id ? (
                  <div key={item.id} className="rounded-xl border border-primary/30 bg-secondary/40 p-3 space-y-2.5">
                    <Input
                      className="h-8 text-xs bg-background/50 border-border/50"
                      placeholder="Nama preset"
                      value={editState.name}
                      onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                    />
                    <Input
                      className="h-8 text-xs bg-background/50 border-border/50"
                      placeholder="Deskripsi (opsional)"
                      value={editState.description}
                      onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Select value={editState.category} onValueChange={v => setEditState(s => ({ ...s, category: v }))}>
                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BLENDSHAPE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={editState.target_mode} onValueChange={v => setEditState(s => ({ ...s, target_mode: v }))}>
                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MODE_LABEL).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
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
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      item.is_active
                        ? 'border-border/40 bg-secondary/30'
                        : 'border-border/20 bg-secondary/10 opacity-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {MODE_LABEL[item.target_mode]} · {Object.keys(item.weights).length} keys
                      </p>
                    </div>

                    {onPreview && (
                      <button
                        onClick={() => onPreview(item)}
                        title="Preview"
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}

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
