const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function streamChat({
  messages,
  onDelta,
  onDone,
  systemPrompt,
}: {
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  onDone: () => void;
  systemPrompt?: string;
}) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) throw new Error("Rate limited. Coba lagi nanti.");
    if (resp.status === 402) throw new Error("Kredit habis. Tambahkan dana.");
    throw new Error("Gagal memulai chat");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }

      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  onDone();
}

export async function generateTTS(text: string, voiceId?: string): Promise<string | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (data.audioContent) {
      return `data:audio/mpeg;base64,${data.audioContent}`;
    }
    return null;
  } catch {
    return null;
  }
}
