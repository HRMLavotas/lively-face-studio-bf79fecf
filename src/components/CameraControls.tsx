import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Move3d } from 'lucide-react';
import type { CameraPreset } from '@/components/VrmViewer';

interface CameraControlsProps {
  onPresetChange: (preset: CameraPreset) => void;
  onFreeModeChange: (enabled: boolean) => void;
  isFreeMode: boolean;
  currentPreset?: CameraPreset;
}

const SHOT_PRESETS: Array<{
  value: CameraPreset;
  label: string;
  short: string;
}> = [
  { value: 'extreme-closeup', label: 'Extreme Close-Up', short: 'ECU' },
  { value: 'closeup', label: 'Close-Up', short: 'CU' },
  { value: 'medium-closeup', label: 'Medium Close-Up', short: 'MCU' },
  { value: 'medium-shot', label: 'Medium Shot', short: 'MS' },
  { value: 'medium-wide-shot', label: 'Medium Wide Shot', short: 'MWS' },
  { value: 'wide-shot', label: 'Wide Shot', short: 'WS' },
  { value: 'extreme-wide-shot', label: 'Extreme Wide Shot', short: 'EWS' },
];

export default function CameraControls({
  onPresetChange,
  onFreeModeChange,
  isFreeMode,
  currentPreset,
}: CameraControlsProps) {
  const [selectedPreset, setSelectedPreset] = useState<CameraPreset>(currentPreset || 'medium-shot');

  const handlePresetChange = (value: CameraPreset) => {
    if (isFreeMode) {
      onFreeModeChange(false);
    }
    setSelectedPreset(value);
    onPresetChange(value);
  };

  const handleFreeModeToggle = () => {
    onFreeModeChange(!isFreeMode);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-3 p-4 rounded-lg bg-secondary/90 backdrop-blur-md border border-border shadow-lg z-20">
      {/* Shot Size Selection */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
          Shot Sizes
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {SHOT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              disabled={isFreeMode}
              className={`
                px-2 py-1.5 rounded text-xs font-medium transition-all
                ${selectedPreset === preset.value && !isFreeMode
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary border border-border/50 text-foreground/70 hover:bg-secondary/80'
                }
                ${isFreeMode && selectedPreset !== preset.value ? 'opacity-50 cursor-not-allowed' : ''}
                whitespace-nowrap
              `}
              title={preset.label}
            >
              {preset.short}
            </button>
          ))}
        </div>
      </div>

      {/* Free Camera Mode Toggle */}
      <div className="pt-2 border-t border-border/30">
        <Button
          variant={isFreeMode ? 'default' : 'outline'}
          size="sm"
          onClick={handleFreeModeToggle}
          className="w-full gap-2"
        >
          <Move3d className="w-4 h-4" />
          {isFreeMode ? 'Free Camera' : 'Enable Free Camera'}
        </Button>
        {isFreeMode && (
          <div className="mt-2 text-xs text-foreground/60 text-center">
            Drag to rotate • Scroll to zoom
          </div>
        )}
      </div>
    </div>
  );
}
