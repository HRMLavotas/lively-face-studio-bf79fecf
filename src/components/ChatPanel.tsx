import { useState, useRef, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Volume2, ChevronDown, X, Bot, User } from 'lucide-react';
import { streamChat, generateTTS, parseAnimTag, type ChatMessage } from '@/lib/chat-api';
import { toast } from 'sonner';

interface ChatPanelProps {
  onSpeakStart: (audioUrl: string, messageText?: string) => void;
  onSpeakEnd: () => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (isOpen && onUnreadChange) onUnreadChange(false);
  }, [isOpen, onUnreadChange]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    onUserMessage?.(text);
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

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
          if (isMobile && !isOpen && onUnreadChange) onUnreadChange(true);
          if (assistantSoFar) {
            const { clean } = parseAnimTag(assistantSoFar);
            const ttsText = clean || assistantSoFar;
            if (clean !== assistantSoFar) {
              setMessages((prev) =>
                prev.map((m, i) =>
                  i === prev.length - 1 && m.role === 'assistant' ? { ...m, content: clean } : m,
                ),
              );
            }
            setIsTTSLoading(true);
            const audioUrl = await generateTTS(ttsText, voiceId);
            setIsTTSLoading(false);
            if (audioUrl) onSpeakStart(audioUrl, assistantSoFar);
          }
        },
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Chat gagal');
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const inputBar = (
    <div className="flex items-end gap-2">
      <div className="flex-1 relative">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Ketik pesan… (Enter kirim, Shift+Enter baris baru)"
          disabled={isLoading}
          rows={1}
          className="resize-none min-h-[40px] max-h-[120px] bg-secondary/50 border-border/60 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 transition-colors pr-2 scrollbar-thin"
          style={{ height: 'auto' }}
        />
      </div>
      <Button
        type="button"
        size="icon"
        onClick={handleSend}
        disabled={isLoading || !input.trim()}
        className="h-10 w-10 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm disabled:opacity-40"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );

  const messageList = (
    <div className="space-y-3 px-1">
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary/70" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/70">Mulai percakapan</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tanya apa saja ke asisten virtual</p>
          </div>
        </div>
      )}
      {messages.map((msg, i) => (
        <MessageBubble key={i} msg={msg} />
      ))}
      <LoadingIndicators isLoading={isLoading} isTTSLoading={isTTSLoading} messages={messages} />
    </div>
  );

  // Mobile: floating input bar when closed, full overlay when open
  if (isMobile) {
    if (!isOpen) {
      const hasUnread = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant';
      return (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background/98 via-background/90 to-transparent">
          <div className="flex items-end gap-2">
            <div className="flex-1">{inputBar}</div>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={onToggle}
                className="relative h-10 w-10 shrink-0 border-border/60 bg-secondary/70 backdrop-blur-md touch-manipulation"
              >
                <ChevronDown className="w-4 h-4 rotate-180" />
                {hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background animate-pulse" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="absolute inset-0 z-20 flex flex-col bg-background/97 backdrop-blur-xl animate-slide-up">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 border-b border-border/50"
          style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-none">Chat</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{messages.length} pesan</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-muted-foreground hover:text-foreground touch-manipulation"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 py-4 px-3" ref={scrollRef}>
          {messageList}
        </ScrollArea>

        <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border/50 bg-background/80">
          {inputBar}
        </div>
      </div>
    );
  }

  // Desktop: sidebar
  return (
    <div className="flex flex-col h-full bg-card/70 backdrop-blur-xl border-l border-border/50">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border/50 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-none">Chat</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Tanya apa saja ke asisten virtual</p>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4 px-3 scrollbar-thin" ref={scrollRef}>
        {messageList}
      </ScrollArea>

      <div className="px-3 py-3 border-t border-border/50 bg-background/40">
        {inputBar}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
          Enter kirim · Shift+Enter baris baru
        </p>
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2 animate-msg-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar dot */}
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mb-0.5 ${
          isUser
            ? 'bg-primary/20 border border-primary/30'
            : 'bg-secondary border border-border/60'
        }`}
      >
        {isUser
          ? <User className="w-3 h-3 text-primary" />
          : <Bot className="w-3 h-3 text-muted-foreground" />
        }
      </div>

      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-secondary/80 text-secondary-foreground border border-border/40 rounded-bl-sm'
        }`}
      >
        {msg.role === 'assistant' ? (
          <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ol]:mt-1">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          <span>{msg.content}</span>
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
        <div className="flex items-end gap-2 animate-msg-in">
          <div className="w-6 h-6 rounded-full bg-secondary border border-border/60 flex items-center justify-center shrink-0">
            <Bot className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="bg-secondary/80 border border-border/40 rounded-2xl rounded-bl-sm px-4 py-3">
            <div className="flex gap-1.5 items-center">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {isTTSLoading && (
        <div className="flex items-end gap-2 animate-msg-in">
          <div className="w-6 h-6 rounded-full bg-secondary border border-border/60 flex items-center justify-center shrink-0">
            <Bot className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="bg-secondary/60 border border-border/40 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Generating speech…</span>
          </div>
        </div>
      )}
    </>
  );
}
