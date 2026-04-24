import { useRef, useState } from 'react';
import { Upload, FileJson } from 'lucide-react';
import { toast } from 'sonner';

export interface ParsedPreset {
  name: string;
  weights: Record<string, number>;
}

interface Props {
  onParsed: (preset: ParsedPreset) => void;
}

/**
 * Accepts a .json file with blendshape weights.
 *
 * Supported formats:
 *   1. Flat object:  { "MouthSmileLeft": 0.8, "EyeWideLeft": 0.5 }
 *   2. Named preset: { "name": "Happy", "weights": { "MouthSmileLeft": 0.8 } }
 *   3. Array:        [{ "name": "...", "weights": {...} }, ...]  → imports first item
 */
export default function BlendshapeUploader({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast.error('Hanya file .json yang didukung');
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast.error('File terlalu besar (max 1MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const parsed = parsePreset(raw, file.name);
        if (!parsed) { toast.error('Format JSON tidak dikenali'); return; }
        onParsed(parsed);
        toast.success(`Preset "${parsed.name}" dimuat — ${Object.keys(parsed.weights).length} blendshape`);
      } catch {
        toast.error('File JSON tidak valid');
      }
    };
    reader.readAsText(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".json" onChange={handleChange} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-xl border-2 border-dashed transition-all p-5 flex flex-col items-center gap-2.5 text-center group ${
          isDragging
            ? 'border-primary/60 bg-primary/8'
            : 'border-border/50 hover:border-primary/40 hover:bg-primary/4'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isDragging ? 'bg-primary/20 border border-primary/30' : 'bg-secondary border border-border/60 group-hover:border-primary/30 group-hover:bg-primary/10'
        }`}>
          <FileJson className={`w-5 h-5 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/80">
            {isDragging ? 'Lepaskan file di sini' : 'Pilih atau drag file .json'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Format: blendshape weights map</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-primary/70 border border-primary/25 bg-primary/8 rounded-full px-3 py-1">
          <Upload className="w-3 h-3" /> Browse file
        </div>
      </button>
    </>
  );
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parsePreset(raw: unknown, fileName: string): ParsedPreset | null {
  if (!raw || typeof raw !== 'object') return null;

  // Array → take first item
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return parsePreset(raw[0], fileName);
  }

  const obj = raw as Record<string, unknown>;

  // Named preset format: { name, weights }
  if (typeof obj.weights === 'object' && obj.weights !== null && !Array.isArray(obj.weights)) {
    const weights = extractWeights(obj.weights as Record<string, unknown>);
    if (Object.keys(weights).length === 0) return null;
    return {
      name: typeof obj.name === 'string' ? obj.name : fileName.replace(/\.json$/i, ''),
      weights,
    };
  }

  // Flat format: { "MouthSmileLeft": 0.8, ... }
  const weights = extractWeights(obj);
  if (Object.keys(weights).length === 0) return null;
  return {
    name: fileName.replace(/\.json$/i, ''),
    weights,
  };
}

function extractWeights(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && isFinite(v)) {
      out[k] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}
