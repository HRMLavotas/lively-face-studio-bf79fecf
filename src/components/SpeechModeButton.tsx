import { Radio, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpeechRecognitionStatus } from '@/hooks/useSpeechRecognition';

interface SpeechModeButtonProps {
  speechMode: boolean;
  sttStatus: SpeechRecognitionStatus;
  sttSupported: boolean;
  onToggle: () => void;
}

export function SpeechModeButton({
  speechMode,
  sttStatus,
  sttSupported,
  onToggle,
}: SpeechModeButtonProps) {
  if (!sttSupported) return null;

  const isListening = sttStatus === 'listening';

  return (
    <Button
      type="button"
      variant={speechMode ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      className={`h-8 gap-1.5 text-xs ${
        speechMode
          ? isListening
            ? 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive/30 animate-pulse'
            : 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30'
          : 'border-border/60 text-muted-foreground hover:text-foreground'
      }`}
      title="Speech Mode — bicara langsung ke asisten"
    >
      {speechMode ? <Radio className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      {speechMode ? (isListening ? 'Mendengarkan…' : 'Speech Mode') : 'Voice'}
    </Button>
  );
}
