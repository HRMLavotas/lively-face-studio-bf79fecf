import { useState, useRef, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Volume2, ChevronUp, X } from 'lucide-react';
import { streamChat, generateTTS, parseAnimTag, type ChatMessage } from '@/lib/chat-api';
import { toast } from 'sonner';

interface ChatPanelProps {
  onSpeakStart: (audioUrl: string, messageText?: string) => void;
  onSpeakEnd: () => void;
  /** Fired immediately when the user sends a message — lets the avatar react
   *  to the user's mood before the AI reply arrives. */
  onUserMessage?: (text: string) => void;
  voiceId?: string;
  personality?: string;
  isMobile?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onUnreadChange?: (hasUnread: boolean) => void;
}

export default function ChatPanel({
  onSpeakStart,
  onSpeakEnd,
  onUserMessage,
  voiceId,
  personality,
  isMobile = false,
  isOpen = true,
  onToggle,
  onUnreadChange,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clear unread when chat opens
  useEffect(() => {
    if (isOpen && onUnreadChange) onUnreadChange(false);
  }, [isOpen, onUnreadChange]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Notify parent so the avatar can react to the user's emotional cue
    // immediately, before AI/TTS round-trip completes.
    onUserMessage?.(text);

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: (chunk) => upsertAssistant(chunk),
        systemPrompt: personality,
        onDone: async () => {
          setIsLoading(false);
          // Notify parent of unread reply when chat is hidden on mobile
          if (isMobile && !isOpen && onUnreadChange) {
            onUnreadChange(true);
          }
          if (assistantSoFar) {
            setIsTTSLoading(true);
            const audioUrl = await generateTTS(assistantSoFar, voiceId);
            setIsTTSLoading(false);
            if (audioUrl) {
              onSpeakStart(audioUrl, assistantSoFar);
            }
          }
        },
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Chat gagal');
      setIsLoading(false);
    }
  };

  const inputBar = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
      className="flex gap-2"
    >
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ketik pesan…"
        disabled={isLoading}
        className="bg-secondary/60 border-border text-sm"
      />
      <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shrink-0">
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );

  // Mobile: floating input bar when closed, full overlay when open
  if (isMobile) {
    if (!isOpen) {
      const hasUnread =
        messages.length > 0 && messages[messages.length - 1]?.role === 'assistant';
      return (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="flex items-center gap-2">
            <div className="flex-1">{inputBar}</div>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={onToggle}
                className="relative h-10 w-10 shrink-0 border-border bg-secondary/60 backdrop-blur-md"
              >
                <ChevronUp className="w-4 h-4" />
                {hasUnread && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    // Full overlay
    return (
      <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Chat</h2>
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                Mulai percakapan dengan mengetik pesan…
              </p>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <LoadingIndicators isLoading={isLoading} isTTSLoading={isTTSLoading} messages={messages} />
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border">{inputBar}</div>
      </div>
    );
  }

  // Desktop: sidebar
  return (
    <div className="flex flex-col h-full bg-card/80 backdrop-blur-md border-l border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Chat</h2>
        <p className="text-xs text-muted-foreground">Tanya apa saja ke asisten virtual</p>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-8">
              Mulai percakapan dengan mengetik pesan…
            </p>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          <LoadingIndicators isLoading={isLoading} isTTSLoading={isTTSLoading} messages={messages} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">{inputBar}</div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          msg.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        }`}
      >
        {msg.role === 'assistant' ? (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          msg.content
        )}
      </div>
    </div>
  );
});

function LoadingIndicators({
  isLoading,
  isTTSLoading,
  messages,
}: {
  isLoading: boolean;
  isTTSLoading: boolean;
  messages: ChatMessage[];
}) {
  return (
    <>
      {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="flex justify-start">
          <div className="bg-secondary rounded-xl px-3 py-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      {isTTSLoading && (
        <div className="flex justify-start">
          <div className="bg-secondary/60 rounded-xl px-3 py-1.5 flex items-center gap-2">
            <Volume2 className="w-3 h-3 text-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Generating speech…</span>
          </div>
        </div>
      )}
    </>
  );
}
