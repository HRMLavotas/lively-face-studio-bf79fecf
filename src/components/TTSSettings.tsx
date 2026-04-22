import { Volume2, Mic, AlertTriangle, CheckCircle } from 'lucide-react';
import type { TTSProvider } from '@/hooks/useTTSProvider';

interface TTSSettingsProps {
  isPro: boolean;
  provider: TTSProvider;
  rateLimited: boolean;
  onProviderChange: (p: TTSProvider) => void;
}

export default function TTSSettings({ isPro, provider, rateLimited, onProviderChange }: TTSSettingsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Text-to-Speech</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pilih mesin suara yang digunakan untuk respons asisten
        </p>
      </div>

      <div className="space-y-2">
        {/* ElevenLabs option */}
        <button
          type="button"
          disabled={!isPro}
          onClick={() => isPro && onProviderChange('elevenlabs')}
          className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left ${
            provider === 'elevenlabs' && !rateLimited
              ? 'border-primary/50 bg-primary/5'
              : 'border-border/50 bg-secondary/30'
          } ${!isPro ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/30 cursor-pointer'}`}
        >
          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            provider === 'elevenlabs' && !rateLimited ? 'bg-primary/15' : 'bg-secondary'
          }`}>
            <Volume2 className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">ElevenLabs</span>
              {!isPro && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">PRO</span>
              )}
              {rateLimited && provider === 'elevenlabs' && (
                <span className="flex items-center gap-1 text-[10px] text-amber-500">
                  <AlertTriangle className="w-3 h-3" /> Rate limit
                </span>
              )}
              {provider === 'elevenlabs' && !rateLimited && (
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suara AI berkualitas tinggi — lebih natural dan ekspresif
            </p>
          </div>
        </button>

        {/* Web Speech option */}
        <button
          type="button"
          onClick={() => onProviderChange('webspeech')}
          className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left ${
            provider === 'webspeech' || rateLimited
              ? 'border-primary/50 bg-primary/5'
              : 'border-border/50 bg-secondary/30 hover:border-primary/30'
          } cursor-pointer`}
        >
          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            provider === 'webspeech' || rateLimited ? 'bg-primary/15' : 'bg-secondary'
          }`}>
            <Mic className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Web Speech</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">Default</span>
              {(provider === 'webspeech' || rateLimited) && (
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suara bawaan browser — gratis, tanpa batas
            </p>
          </div>
        </button>
      </div>

      {rateLimited && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>ElevenLabs mencapai batas penggunaan. Otomatis beralih ke Web Speech. Pilih ElevenLabs lagi untuk mencoba ulang.</span>
        </div>
      )}
    </div>
  );
}
