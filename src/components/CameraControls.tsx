import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Camera, Move3d } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);

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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="absolute top-16 right-4 h-10 w-10 border-border bg-secondary/80 backdrop-blur-md hover:bg-secondary/90 z-20 shadow-lg"
          title="Camera Controls"
        >
          <Camera className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-80 p-4 bg-secondary/95 backdrop-blur-md border-border shadow-lg"
      >
        <div className="space-y-4">
          {/* Header */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Camera Controls</h3>
            <p className="text-xs text-foreground/60 mt-1">Choose a shot size or enable free camera mode</p>
          </div>

          {/* Shot Size Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              Shot Sizes
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SHOT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetChange(preset.value)}
                  disabled={isFreeMode}
                  className={`
                    px-2 py-2 rounded text-xs font-medium transition-all
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
          <div className="space-y-2 pt-2 border-t border-border/30">
            <Button
              variant={isFreeMode ? 'default' : 'outline'}
              size="sm"
              onClick={handleFreeModeToggle}
              className="w-full gap-2"
            >
              <Move3d className="w-4 h-4" />
              {isFreeMode ? 'Free Camera Active' : 'Enable Free Camera'}
            </Button>
            {isFreeMode && (
              <div className="text-xs text-foreground/60 text-center bg-secondary/50 rounded p-2">
                🖱️ Drag to rotate • Scroll to zoom
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
