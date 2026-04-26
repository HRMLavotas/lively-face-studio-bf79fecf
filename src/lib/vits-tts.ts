/**
 * Utility for Hugging Face VITS (Gradio 4 API)
 * Specifically for Plachta/VITS-Umamusume-voice-synthesizer
 */

const HF_SPACE_URL = "https://plachta-vits-umamusume-voice-synthesizer.hf.space";
const HF_TOKEN = import.meta.env.VITE_HUGGINGFACE_TOKEN;

export interface VitsRequest {
  text: string;
  speaker: string;
  language: string;
  speed: number;
}

/**
 * Free translation using Google's public API (client-side)
 */
export async function translateToJapanese(text: string): Promise<string> {
  if (!text.trim()) return text;
  console.log("[Translation] Translating to JP:", text);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
       console.warn("[Translation] API Error:", resp.status);
       return text;
    }
    const data = await resp.json();
    if (data && data[0]) {
      const translated = data[0].map((item: any) => item[0]).join("");
      console.log("[Translation] Success:", translated);
      return translated;
    }
    return text;
  } catch (err) {
    console.warn("[Translation] Exception:", err);
    return text;
  }
}

export async function generateVitsAudio({
  text,
  speaker = "特别周 Special Week (Umamusume Pretty Derby)", 
  language = "日本語",
  speed = 1.0
}: VitsRequest): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (HF_TOKEN) {
    headers["Authorization"] = `Bearer ${HF_TOKEN}`;
  }

  // Gradio 4 flow for /tts_fn
  // data: [text, character, language, speed, symbol_input]
  const callRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/tts_fn`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: [
        text,
        speaker,
        language,
        speed,
        false // Symbol input (Checkbox)
      ]
    })
  });

  if (!callRes.ok) {
    const errText = await callRes.text();
    throw new Error(`HF API Call failed: ${callRes.status} ${errText}`);
  }

  const { event_id } = await callRes.json();

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${HF_SPACE_URL}/gradio_api/call/tts_fn/${event_id}`);
    
    eventSource.addEventListener("complete", (event: any) => {
      eventSource.close();
      try {
        const parsed = JSON.parse(event.data);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          const audioData = parsed[1];
          if (audioData && audioData.url) resolve(audioData.url);
          else if (audioData && audioData.name) resolve(`${HF_SPACE_URL}/file=${audioData.name}`);
          else reject(new Error("Audio URL not found in completion data"));
        } else {
          reject(new Error("Unexpected completion data format"));
        }
      } catch (e) {
        reject(new Error("Failed to parse completion data"));
      }
    });

    eventSource.addEventListener("error", (event: any) => {
      eventSource.close();
      let errorMsg = "Gradio process error (Check character name or language)";
      try {
        const parsed = JSON.parse(event.data);
        errorMsg = parsed.message || errorMsg;
      } catch (e) {}
      reject(new Error(errorMsg));
    });

    eventSource.onerror = (err) => {
      if (eventSource.readyState === 2) return;
      console.error("[VITS SSE Connection Error]", eventSource.readyState, err);
      eventSource.close();
      reject(new Error("VITS SSE Connection failed - Space might be busy or sleeping"));
    };

    setTimeout(() => {
      if (eventSource.readyState !== 2) {
        eventSource.close();
        reject(new Error("VITS Audio generation timeout (60s)"));
      }
    }, 60000);
  });
}

// EXACT MATCH NAMES required by the server (Chinese prefix is MANDATORY)
export const UMAMUSUME_SPEAKERS = [
  "特别周 Special Week (Umamusume Pretty Derby)",
  "无声铃鹿 Silence Suzuka (Umamusume Pretty Derby)",
  "东海帝王 Tokai Teio (Umamusume Pretty Derby)",
  "丸善斯基 Maruzensky (Umamusume Pretty Derby)",
  "富士奇迹 Fuji Kiseki (Umamusume Pretty Derby)",
  "小栗帽 Oguri Cap (Umamusume Pretty Derby)",
  "黄金船 Gold Ship (Umamusume Pretty Derby)",
  "伏特加 Vodka (Umamusume Pretty Derby)",
  "大和赤骥 Daiwa Scarlet (Umamusume Pretty Derby)",
  "目白麦昆 Mejiro McQueen (Umamusume Pretty Derby)",
  "曼哈顿咖啡 Manhattan Cafe (Umamusume Pretty Derby)",
  "爱丽速子 Agnes Tachyon (Umamusume Pretty Derby)",
  "米浴 Rice Shower (Umamusume Pretty Derby)",
  "胜利奖券 Winning Ticket (Umamusume Pretty Derby)",
  "樱花进王 Sakura Bakushin O (Umamusume Pretty Derby)",
  "春乌拉拉 Haru Urara (Umamusume Pretty Derby)",
  "待兼福来 Matikanefukuitaru (Umamusume Pretty Derby)",
  "优秀素质 Nice Nature (Umamusume Pretty Derby)",
  "帝王光辉 King Halo (Umamusume Pretty Derby)"
];
