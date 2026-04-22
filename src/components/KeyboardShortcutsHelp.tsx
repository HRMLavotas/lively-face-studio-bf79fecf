import { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], desc: 'Buka / tutup chat' },
  { keys: ['Enter'], desc: 'Kirim pesan' },
  { keys: ['Shift', 'Enter'], desc: 'Baris baru' },
  { keys: ['Esc'], desc: 'Tutup panel / batalkan' },
  { keys: ['?'], desc: 'Tampilkan shortcut ini' },
];

export default function KeyboardShortcutsHelp() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '?') setShow(v => !v);
      if (e.key === 'Escape') setShow(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={() => setShow(false)}
    >
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl p-5 w-72 animate-msg-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Keyboard Shortcuts</span>
          </div>
          <button onClick={() => setShow(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k, i) => (
                  <span key={i} className="text-[10px] font-mono bg-secondary border border-border/60 rounded px-1.5 py-0.5 text-foreground/80">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-4">Tekan ? untuk menutup</p>
      </div>
    </div>
  );
}
