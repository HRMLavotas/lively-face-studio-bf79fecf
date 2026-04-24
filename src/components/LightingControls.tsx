import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lightbulb, Sun, Moon, Zap } from 'lucide-react';
import type { LightingConfig } from '@/lib/vrm-lighting';
import { LIGHTING_PRESETS } from '@/lib/vrm-lighting';

interface LightingControlsProps {
  onLightingChange: (config: LightingConfig) => void;
  className?: string;
}

export default function LightingControls({
  onLightingChange,
  className = '',
}: LightingControlsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<LightingConfig>(LIGHTING_PRESETS.cyberpunk);

  const handlePresetChange = (preset: string) => {
    const config = LIGHTING_PRESETS[preset];
    if (config) {
      setCurrentConfig(config);
      onLightingChange(config);
    }
  };

  const handleSliderChange = (key: keyof LightingConfig, value: number[]) => {
    const newConfig = { ...currentConfig, [key]: value[0] };
    setCurrentConfig(newConfig);
    onLightingChange(newConfig);
  };

  return (
    <div className={`absolute bottom-4 right-4 z-20 ${className}`}>
      {/* Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsVisible(!isVisible)}
        className="h-10 w-10 cyber-glass border-neon-purple-bright hover-neon-glow"
        title="Lighting Controls"
      >
        <Lightbulb className="w-4 h-4" />
      </Button>

      {/* Controls Panel */}
      {isVisible && (
        <Card className="absolute bottom-12 right-0 w-80 p-4 cyber-glass-strong border-neon-purple">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neon-purple">Lighting</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsVisible(false)}
                className="h-6 w-6 hover-neon-glow"
              >
                ×
              </Button>
            </div>

            {/* Preset Selection */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Preset</label>
              <Select value={currentConfig.preset} onValueChange={handlePresetChange}>
                <SelectTrigger className="cyber-glass border-neon-purple">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="cyber-glass-strong border-neon-purple">
                  <SelectItem value="cyberpunk">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3 h-3 text-purple-400" />
                      Cyberpunk
                    </div>
                  </SelectItem>
                  <SelectItem value="studio">
                    <div className="flex items-center gap-2">
                      <Sun className="w-3 h-3 text-yellow-400" />
                      Studio
                    </div>
                  </SelectItem>
                  <SelectItem value="dramatic">
                    <div className="flex items-center gap-2">
                      <Moon className="w-3 h-3 text-blue-400" />
                      Dramatic
                    </div>
                  </SelectItem>
                  <SelectItem value="soft">
                    <div className="flex items-center gap-2">
                      <Sun className="w-3 h-3 text-orange-300" />
                      Soft
                    </div>
                  </SelectItem>
                  <SelectItem value="neon">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3 h-3 text-cyan-400" />
                      Neon
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Intensity Controls */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Ambient</span>
                  <span className="text-neon-purple">{currentConfig.ambientIntensity.toFixed(1)}</span>
                </div>
                <Slider
                  value={[currentConfig.ambientIntensity]}
                  onValueChange={(value) => handleSliderChange('ambientIntensity', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Key Light</span>
                  <span className="text-neon-purple">{currentConfig.keyLightIntensity.toFixed(1)}</span>
                </div>
                <Slider
                  value={[currentConfig.keyLightIntensity]}
                  onValueChange={(value) => handleSliderChange('keyLightIntensity', value)}
                  min={0}
                  max={3}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Fill Light</span>
                  <span className="text-neon-purple">{currentConfig.fillLightIntensity.toFixed(1)}</span>
                </div>
                <Slider
                  value={[currentConfig.fillLightIntensity]}
                  onValueChange={(value) => handleSliderChange('fillLightIntensity', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Rim Light</span>
                  <span className="text-neon-purple">{currentConfig.rimLightIntensity.toFixed(1)}</span>
                </div>
                <Slider
                  value={[currentConfig.rimLightIntensity]}
                  onValueChange={(value) => handleSliderChange('rimLightIntensity', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2 border-t border-neon-purple/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePresetChange('cyberpunk')}
                className="flex-1 cyber-glass hover-neon-glow text-xs"
              >
                Reset
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}