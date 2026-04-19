interface AudioStatusIndicatorProps {
  isSpeaking: boolean;
}

export default function AudioStatusIndicator({ isSpeaking }: AudioStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border">
      <div className={`h-2 w-2 rounded-full transition-colors duration-300 ${isSpeaking ? 'bg-primary glow-primary' : 'bg-muted-foreground'}`} />
      <span className="text-xs font-mono text-secondary-foreground">
        {isSpeaking ? 'Speaking…' : 'Idle'}
      </span>
    </div>
  );
}
