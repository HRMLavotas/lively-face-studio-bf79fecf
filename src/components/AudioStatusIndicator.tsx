interface AudioStatusIndicatorProps {
  isSpeaking: boolean;
}

export default function AudioStatusIndicator({ isSpeaking }: AudioStatusIndicatorProps) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full transition-all duration-300 ${
        isSpeaking
          ? 'bg-primary/15 border border-primary/40'
          : 'bg-secondary/70 border border-border/50'
      }`}
    >
      {isSpeaking ? (
        /* Waveform bars when speaking */
        <div className="flex items-end gap-[2px] h-3.5">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="wave-bar inline-block w-[3px] rounded-full bg-primary"
              style={{ height: '100%', animationDelay: `${(i - 1) * 0.12}s` }}
            />
          ))}
        </div>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      )}
      <span
        className={`text-[11px] font-medium tracking-wide ${
          isSpeaking ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {isSpeaking ? 'Speaking' : 'Idle'}
      </span>
    </div>
  );
}
