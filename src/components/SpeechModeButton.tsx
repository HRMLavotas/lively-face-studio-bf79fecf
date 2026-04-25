import { Radio, Mic, Loader2 } from 'lucide-react';
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
  const isStarting = sttStatus === 'requesting' || sttStatus === 'starting';

  return (
    <Button
      type="button"
      size="icon"
      onClick={onToggle}
      disabled={isStarting}
      className={`h-10 w-10 shrink-0 shadow-sm transition-all ${
        speechMode
          ? isListening
            ? 'bg-destructive hover:bg-destructive/90 text-white animate-pulse neon-glow-magenta border-0'
            : isStarting
            ? 'bg-primary/60 text-primary-foreground cursor-wait neon-glow-purple border-0'
            : 'bg-primary hover:bg-primary/90 text-primary-foreground neon-glow-purple hover-neon-lift border-0'
          : 'btn-overlay'
      }`}
      title={
        isStarting
          ? 'Menyiapkan mikrofon… tunggu sebentar'
          : speechMode
          ? isListening
            ? 'Mendengarkan - klik untuk berhenti'
            : 'Speech Mode aktif - klik untuk matikan'
          : 'Aktifkan Speech Mode - bicara langsung ke asisten'
      }
    >
      {isStarting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : speechMode ? (
        <Radio className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  );
}
