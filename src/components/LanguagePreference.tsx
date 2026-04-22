import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import type { LangCode } from '@/lib/lang-detect';

const LANGS: Array<{ code: LangCode | 'auto'; label: string; flag: string }> = [
  { code: 'auto', label: 'Auto-detect', flag: '🌐' },
  { code: 'id',   label: 'Indonesia',   flag: '🇮🇩' },
  { code: 'en',   label: 'English',     flag: '🇺🇸' },
  { code: 'ja',   label: '日本語',       flag: '🇯🇵' },
  { code: 'ko',   label: '한국어',       flag: '🇰🇷' },
  { code: 'zh',   label: '中文',         flag: '🇨🇳' },
  { code: 'th',   label: 'ภาษาไทย',     flag: '🇹🇭' },
  { code: 'vi',   label: 'Tiếng Việt',  flag: '🇻🇳' },
];

const LS_KEY = 'vrm.lang';

export default function LanguagePreference() {
  const [selected, setSelected] = useState<string>('auto');

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    setSelected(saved ?? 'auto');
  }, []);

  const handleSelect = (code: string) => {
    setSelected(code);
    if (code === 'auto') localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, code);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-secondary border border-border/60 flex items-center justify-center">
          <Globe className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Bahasa Keyword</h2>
          <p className="text-[11px] text-muted-foreground">Bahasa untuk pencocokan trigger animasi</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LANGS.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
              selected === lang.code
                ? 'border-primary/40 bg-primary/8 text-primary'
                : 'border-border/50 bg-card/50 text-foreground/70 hover:border-border/80 hover:bg-card/70'
            }`}
          >
            <span className="text-base leading-none">{lang.flag}</span>
            <span className="text-xs font-medium truncate">{lang.label}</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Auto-detect akan mendeteksi bahasa dari teks pesan secara otomatis. Pilih bahasa spesifik jika deteksi otomatis kurang akurat.
      </p>
    </div>
  );
}
