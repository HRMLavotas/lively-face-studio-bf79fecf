import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Camera, Move3d, Check } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CameraPreset } from '@/components/VrmViewer';

interface CameraControlsProps {
  onPresetChange: (preset: CameraPreset) => void;
  onFreeModeChange: (enabled: boolean) => void;
  isFreeMode: boolean;
  currentPreset?: CameraPreset;
}

const SHOT_PRESETS: Array<{ value: CameraPreset; label: string; short: string }> = [
  { value: 'extreme-closeup',   label: 'Extreme Close-Up',  short: 'ECU' },
  { value: 'closeup',           label: 'Close-Up',          short: 'CU'  },
  { value: 'medium-closeup',    label: 'Medium Close-Up',   short: 'MCU' },
  { value: 'medium-shot',       label: 'Medium Shot',       short: 'MS'  },
  { value: 'medium-wide-shot',  label: 'Medium Wide',       short: 'MWS' },
  { value: 'wide-shot',         label: 'Wide Shot',         short: 'WS'  },
  { value: 'extreme-wide-shot', label: 'Extreme Wide',      short: 'EWS' },
];

export default function CameraControls({
  onPresetChange,
  onFreeModeChange,
  isFreeMode,
  currentPreset,
}: CameraControlsProps) {
  const isMobile = useIsMobile();
  const [selectedPreset, setSelectedPreset] = useState<CameraPreset>(currentPreset || 'medium-shot');
  const [isOpen, setIsOpen] = useState(false);

  const handlePresetChange = (value: CameraPreset) => {
    if (isFreeMode) onFreeModeChange(false);
    setSelectedPreset(value);
    onPresetChange(value);
    if (isMobile) setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`absolute top-[3.75rem] right-3 md:right-4 h-9 w-9 border-border/60 backdrop-blur-md shadow-md transition-colors z-20 ${
            isOpen || isFreeMode
              ? 'bg-primary/20 border-primary/40 text-primary'
              : 'bg-secondary/70 hover:bg-secondary/90 text-foreground/70 hover:text-foreground'
          }`}
          title="Camera Controls"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={isMobile ? 'bottom' : 'left'}
        align={isMobile ? 'end' : 'start'}
        sideOffset={8}
        className="p-0 overflow-hidden bg-card/95 backdrop-blur-xl border-border/60 shadow-xl"
        style={{ width: isMobile ? 'min(calc(100vw - 1.5rem), 22rem)' : '17rem' }}
      >
        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-border/50 flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Shot Size</span>
        </div>

        {/* Preset grid */}
        <div className="p-3 grid grid-cols-4 gap-1.5">
          {SHOT_PRESETS.map((preset) => {
            const isActive = selectedPreset === preset.value && !isFreeMode;
            return (
              <button
                key={preset.value}
                onClick={() => handlePresetChange(preset.value)}
                disabled={isFreeMode}
                title={preset.label}
                className={`
                  relative flex flex-col items-center justify-center gap-0.5
                  min-h-[44px] px-1 py-2 rounded-lg text-xs font-medium
                  transition-all duration-150 touch-manipulation
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 border border-border/40 text-foreground/60 hover:bg-secondary hover:text-foreground hover:border-border/70'
                  }
                  ${isFreeMode ? 'opacity-35 cursor-not-allowed' : 'active:scale-95'}
                `}
              >
                <span className="font-mono font-semibold">{preset.short}</span>
                {isActive && (
                  <Check className="absolute top-1 right-1 w-2.5 h-2.5 opacity-70" />
                )}
              </button>
            );
          })}
        </div>

        {/* Free Camera */}
        <div className="px-3 pb-3 pt-1 border-t border-border/40">
          <Button
            variant={isFreeMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFreeModeChange(!isFreeMode)}
            className={`w-full gap-2 h-9 text-xs ${
              isFreeMode
                ? 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30'
                : 'border-border/50 text-foreground/70 hover:text-foreground'
            }`}
          >
            <Move3d className="w-3.5 h-3.5" />
            {isFreeMode ? 'Free Camera — aktif' : 'Free Camera'}
          </Button>
          {isFreeMode && (
            <p className="text-[10px] text-muted-foreground/60 text-center mt-2 leading-relaxed">
              {isMobile ? '👆 Drag putar · Pinch zoom' : '🖱 Drag putar · Scroll zoom'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
