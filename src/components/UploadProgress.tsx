import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface UploadProgressProps {
  progress: number; // 0–100, -1 = error
  fileName: string;
  onDone?: () => void;
}

export function UploadProgress({ progress, fileName, onDone }: UploadProgressProps) {
  const [visible, setVisible] = useState(true);
  const done = progress === 100;
  const error = progress === -1;

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => { setVisible(false); onDone?.(); }, 1800);
      return () => clearTimeout(t);
    }
  }, [done, onDone]);

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-secondary/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        ) : error ? (
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        )}
        <p className="text-xs text-foreground/80 truncate flex-1">{fileName}</p>
        <span className={`text-xs font-mono shrink-0 ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error ? 'Gagal' : done ? 'Selesai' : `${progress}%`}
        </span>
      </div>
      {!done && !error && (
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}
