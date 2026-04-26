import { useState, useEffect } from 'react';
import { Sparkles, Volume2, MousePointer2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function InteractionSettings() {
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('vrm.interactionVolume');
    return saved !== null ? parseFloat(saved) : 0.6;
  });

  const [showParticles, setShowParticles] = useState(() => {
    const saved = localStorage.getItem('vrm.showParticles');
    return saved !== 'false';
  });

  const [sensitivity, setSensitivity] = useState(() => {
    const saved = localStorage.getItem('vrm.interactionSensitivity');
    return saved !== null ? parseInt(saved) : 20;
  });

  useEffect(() => {
    localStorage.setItem('vrm.interactionVolume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('vrm.showParticles', showParticles.toString());
  }, [showParticles]);

  useEffect(() => {
    localStorage.setItem('vrm.interactionSensitivity', sensitivity.toString());
  }, [sensitivity]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-2">
        <MousePointer2 className="w-5 h-5 text-neon-purple" />
        <h2 className="text-lg font-semibold text-foreground">Interaksi Model</h2>
      </div>

      <div className="space-y-6 p-4 rounded-xl border border-neon-purple/20 cyber-glass-light">
        {/* Interaction Volume */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Volume Suara Interaksi</Label>
            </div>
            <span className="text-xs font-mono text-neon-purple">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(vals) => setVolume(vals[0] / 100)}
            max={100}
            step={1}
            className="py-4"
          />
          <p className="text-[10px] text-muted-foreground italic">
            * Mengatur volume suara saat karakter dielus atau ditepuk.
          </p>
        </div>

        {/* Particles Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-neon-purple/10">
              <Sparkles className="w-4 h-4 text-neon-purple" />
            </div>
            <div>
              <Label className="text-sm font-medium">Efek Partikel Visual</Label>
              <p className="text-[10px] text-muted-foreground">Tampilkan bintang & hati saat interaksi</p>
            </div>
          </div>
          <Switch 
            checked={showParticles} 
            onCheckedChange={setShowParticles}
            className="data-[state=checked]:bg-neon-purple"
          />
        </div>

        {/* Sensitivity Adjustment */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Sensitivitas Elusan</Label>
            <span className="text-xs font-mono text-neon-purple">{sensitivity} px/f</span>
          </div>
          <Slider
            value={[sensitivity]}
            onValueChange={(vals) => setSensitivity(vals[0])}
            min={5}
            max={50}
            step={1}
            className="py-4"
          />
          <p className="text-[10px] text-muted-foreground italic">
            * Makin rendah nilainya, makin mudah memicu efek elusan kepala.
          </p>
        </div>
      </div>
    </div>
  );
}
