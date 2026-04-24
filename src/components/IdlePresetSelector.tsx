import { useEffect, useState } from 'react';
import { loadPresets, type BlendshapePreset } from '@/lib/blendshape-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smile } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

const CATEGORY_ORDER = ['mood', 'emote', 'pose', 'custom'];

export default function IdlePresetSelector({ value, onChange }: Props) {
  const [presets, setPresets] = useState<BlendshapePreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets().filter(p => p.is_active));
  }, []);

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, BlendshapePreset[]>>((acc, cat) => {
    const items = presets.filter(p => p.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-secondary border border-border/60 flex items-center justify-center shrink-0">
          <Smile className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ekspresi Idle</h3>
          <p className="text-xs text-muted-foreground">Ekspresi default model saat tidak ada aktivitas</p>
        </div>
      </div>

      <Select
        value={value ?? 'none'}
        onValueChange={v => onChange(v === 'none' ? null : v)}
      >
        <SelectTrigger className="h-9 bg-secondary/40 border-border/50 text-sm">
          <SelectValue placeholder="Pilih ekspresi idle…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-sm text-muted-foreground">
            — Tidak ada (default model) —
          </SelectItem>

          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {cat}
              </div>
              {items.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.name}
                  {p.description && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">{p.description}</span>
                  )}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
