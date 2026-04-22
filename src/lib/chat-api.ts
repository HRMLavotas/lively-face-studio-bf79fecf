const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Check if the browser has network connectivity */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Parse the optional `[ANIM:<name>]` tag the AI may append to its reply.
 */
export function parseAnimTag(text: string): { clean: string; animName: string | null } {
  if (!text) return { clean: text, animName: null };
  const re = /\s*\[ANIM:\s*([^\]\n]+?)\s*\]\s*$/i;
  const m = text.match(re);
  if (!m) return { clean: text, animName: null };
  const name = m[1].trim();
  const clean = text.slice(0, m.index).replace(/\s+$/, "");
  if (!name || name.toLowerCase() === "none") return { clean, animName: null };
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
  if (!isOnline()) throw new Error("Tidak ada koneksi internet.");

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

/** Generate TTS with automatic retry on transient failures.
 * isPro=true  → try ElevenLabs, fall back to Web Speech on 429/error
 * isPro=false → Web Speech directly, never calls ElevenLabs
 */
export async function generateTTS(
  text: string,
  voiceId?: string,
  retries = 2,
  isPro = false,
): Promise<{ url: string; error: null; source: 'elevenlabs' | 'webspeech' } |
           { url: null;   error: string; source: 'none' }> {
  if (!isOnline()) return { url: null, error: "Tidak ada koneksi internet", source: 'none' };

  // Web Speech only — never touch ElevenLabs
  if (!isPro) {
    return { url: 'webspeech://' + encodeURIComponent(text), error: null, source: 'webspeech' };
  }

  // ElevenLabs with fallback
  for (let attempt = 0; attempt <= retries; attempt++) {
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
        if (resp.status === 429) {
          // Rate limited — caller should handle provider switch
          return { url: 'webspeech://' + encodeURIComponent(text), error: null, source: 'webspeech' };
        }
        if (resp.status === 401 || resp.status === 403) return { url: null, error: "Auth error", source: 'none' };
        if (resp.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        return { url: 'webspeech://' + encodeURIComponent(text), error: null, source: 'webspeech' };
      }

      const data = await resp.json();
      if (data.audioContent) {
        return { url: `data:audio/mpeg;base64,${data.audioContent}`, error: null, source: 'elevenlabs' };
      }
      return { url: null, error: "No audio content", source: 'none' };
    } catch (e) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      return { url: 'webspeech://' + encodeURIComponent(text), error: null, source: 'webspeech' };
    }
  }
  return { url: null, error: "Max retries exceeded", source: 'none' };
}

/** Check if a TTS URL is a Web Speech fallback */
export function isWebSpeechUrl(url: string): boolean {
  return url.startsWith('webspeech://');
}

/** Extract text from a Web Speech URL */
export function getWebSpeechText(url: string): string {
  return decodeURIComponent(url.replace('webspeech://', ''));
}
