import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Lightbulb, Sun, Moon, Zap, Check, RotateCcw } from 'lucide-react';
import type { LightingConfig } from '@/lib/vrm-lighting';
import { LIGHTING_PRESETS } from '@/lib/vrm-lighting';
import { useIsMobile } from '@/hooks/use-mobile';

interface LightingControlsProps {
  onLightingChange: (config: LightingConfig) => void;
  initialConfig?: LightingConfig;
  className?: string;
}

const PRESET_OPTIONS = [
  { value: 'cyberpunk', icon: Zap,  color: 'text-purple-400', label: 'Cyberpunk' },
  { value: 'studio',    icon: Sun,  color: 'text-yellow-400', label: 'Studio' },
  { value: 'dramatic',  icon: Moon, color: 'text-blue-400',   label: 'Dramatic' },
  { value: 'soft',      icon: Sun,  color: 'text-orange-300', label: 'Soft' },
  { value: 'neon',      icon: Zap,  color: 'text-cyan-400',   label: 'Neon' },
];

export default function LightingControls({
  onLightingChange,
  initialConfig,
  className = '',
}: LightingControlsProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<LightingConfig>(
    initialConfig || LIGHTING_PRESETS.cyberpunk
  );

  // Sync with initialConfig if it changes externally
  useEffect(() => {
    if (initialConfig) {
      setCurrentConfig(initialConfig);
    }
  }, [initialConfig]);

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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`h-10 w-10 btn-overlay shadow-md transition-colors ${
                isOpen ? 'active' : ''
              }`}
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" className="panel-overlay border-0 text-xs text-foreground/90">
          Pencahayaan
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side={isMobile ? 'bottom' : 'left'}
        align={isMobile ? 'end' : 'start'}
        sideOffset={8}
        className="p-0 overflow-hidden panel-overlay shadow-xl"
        style={{ width: isMobile ? 'min(calc(100vw - 1.5rem), 22rem)' : '18rem' }}
      >
        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Lighting</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePresetChange('cyberpunk')}
            className="h-6 w-6 hover-neon-glow"
            title="Reset"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        {/* Preset grid */}
        <div className="p-3 grid grid-cols-5 gap-1.5 border-b border-border/40">
          {PRESET_OPTIONS.map((preset) => {
            const isActive = currentConfig.preset === preset.value;
            const Icon = preset.icon;
            return (
              <button
                key={preset.value}
                onClick={() => handlePresetChange(preset.value)}
                title={preset.label}
                className={`
                  relative flex flex-col items-center justify-center gap-1
                  min-h-[48px] py-2 rounded-lg text-[10px] font-medium
                  transition-all duration-150 touch-manipulation
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 border border-border/40 text-foreground/60 hover:bg-secondary hover:text-foreground hover:border-border/70'
                  }
                  active:scale-95
                `}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : preset.color}`} />
                <span className="truncate w-full text-center px-1">{preset.label}</span>
                {isActive && (
                  <Check className="absolute top-1 right-1 w-2 h-2 opacity-70" />
                )}
              </button>
            );
          })}
        </div>

        {/* Intensity Sliders */}
        <div className="p-4 space-y-4">
          <div className="space-y-3">
             {[
               { label: 'Ambient', key: 'ambientIntensity', max: 2 },
               { label: 'Key Light', key: 'keyLightIntensity', max: 3 },
               { label: 'Fill Light', key: 'fillLightIntensity', max: 2 },
               { label: 'Rim Light', key: 'rimLightIntensity', max: 2 },
             ].map((slider) => (
               <div key={slider.key} className="space-y-1.5">
                 <div className="flex justify-between text-[11px]">
                   <span className="text-muted-foreground">{slider.label}</span>
                   <span className="text-neon-purple font-mono">
                     {(currentConfig[slider.key as keyof LightingConfig] as number).toFixed(1)}
                   </span>
                 </div>
                 <Slider
                   value={[currentConfig[slider.key as keyof LightingConfig] as number]}
                   onValueChange={(value) => handleSliderChange(slider.key as keyof LightingConfig, value)}
                   min={0}
                   max={slider.max}
                   step={0.1}
                   className="w-full"
                 />
               </div>
             ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
