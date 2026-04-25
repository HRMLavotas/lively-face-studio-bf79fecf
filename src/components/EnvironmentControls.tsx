import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, EyeOff } from 'lucide-react';
import { ENVIRONMENT_PRESETS } from '@/lib/vrm-environment';

interface EnvironmentControlsProps {
  onEnvironmentChange: (preset: string) => void;
  onImageBackgroundChange: (imageUrl: string) => void;
  currentEnvironment?: string;
  className?: string;
}

const ENVIRONMENT_LABELS: Record<string, string> = {
  'cyberpunk-void': 'Cyberpunk Void',
  'neon-city': 'Neon City',
  'studio-dark': 'Studio Dark',
  'studio-light': 'Studio Light', 
  'sunset-gradient': 'Sunset Gradient',
  'space-void': 'Space Void',
  'transparent': 'Transparent',
};

export default function EnvironmentControls({
  onEnvironmentChange,
  onImageBackgroundChange,
  currentEnvironment = 'cyberpunk-void',
  className = '',
}: EnvironmentControlsProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      {/* Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsVisible(!isVisible)}
        className={`h-9 w-9 btn-overlay shadow-md ${isVisible ? 'active' : ''}`}
        title="Environment Controls"
      >
        <Palette className="w-4 h-4" />
      </Button>

      {/* Controls Panel */}
      {isVisible && (
        <Card className="absolute top-0 right-12 w-64 p-4 panel-overlay">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neon-purple">Environment</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsVisible(false)}
                className="h-6 w-6 hover-neon-glow"
              >
                <EyeOff className="w-3 h-3" />
              </Button>
            </div>

            <Select value={currentEnvironment} onValueChange={onEnvironmentChange}>
              <SelectTrigger className="cyber-glass border-neon-purple focus:border-neon-purple-bright">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="cyber-glass-strong border-neon-purple">
                {Object.keys(ENVIRONMENT_PRESETS).map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {ENVIRONMENT_LABELS[preset] || preset}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Preview */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Preview:</div>
              <div className="h-16 rounded border border-neon-purple overflow-hidden">
                <EnvironmentPreview preset={currentEnvironment} />
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function EnvironmentPreview({ preset }: { preset: string }) {
  const config = ENVIRONMENT_PRESETS[preset];
  if (!config) return null;

  if (config.type === 'color') {
    const color = config.background![0];
    return (
      <div 
        className="w-full h-full"
        style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
      />
    );
  }

  if (config.type === 'gradient') {
    const colors = config.background as string[];
    return (
      <div 
        className="w-full h-full"
        style={{
          background: `linear-gradient(180deg, ${colors.join(', ')})`
        }}
      />
    );
  }

  return <div className="w-full h-full bg-gray-500" />;
}