const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Parse the optional `[ANIM:<name>]` tag the AI may append to its reply.
 * Returns the text with the tag stripped + the animation name (or null).
 * Tag may be on its own line or appended at the end. Match is greedy on
 * the last occurrence so retries don't confuse the parser.
 */
export function parseAnimTag(text: string): { clean: string; animName: string | null } {
  if (!text) return { clean: text, animName: null };
  // Match the LAST [ANIM:...] occurrence, optionally surrounded by whitespace/newlines.
  const re = /\s*\[ANIM:\s*([^\]\n]+?)\s*\]\s*$/i;
  const m = text.match(re);
  if (!m) return { clean: text, animName: null };
  const name = m[1].trim();
  const clean = text.slice(0, m.index).replace(/\s+$/, "");
  if (!name || name.toLowerCase() === "none") {
    return { clean, animName: null };
  }
  return { clean, animName: name };
}

export async function streamChat({
  messages,
  onDelta,
  onDone,
  systemPrompt,
  signal,
}: {
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  onDone: () => void;
  systemPrompt?: string;
  signal?: AbortSignal;
}) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) throw new Error("Rate limited. Coba lagi nanti.");
    if (resp.status === 402) throw new Error("Kredit habis. Tambahkan dana.");
    if (resp.status === 401 || resp.status === 403) throw new Error("Sesi habis. Silakan login ulang.");
    if (resp.status >= 500) throw new Error("Server sedang bermasalah. Coba lagi.");
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

export async function generateTTS(
  text: string,
  voiceId?: string,
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return { url: null, error: "Rate limited TTS" };
      return { url: null, error: `TTS error ${resp.status}` };
    }

    const data = await resp.json();
    if (data.audioContent) {
      return { url: `data:audio/mpeg;base64,${data.audioContent}`, error: null };
    }
    return { url: null, error: "No audio content" };
  } catch (e) {
    return { url: null, error: (e as Error).message };
  }
}
