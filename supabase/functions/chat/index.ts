import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache the animation catalog block in-memory for ~5 min so we don't query
// the DB on every chat call. Edge function instances are short-lived but
// this still saves repeated calls within the same warm instance.
let catalogCache: { text: string; expiresAt: number } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function buildAnimationCatalog(): Promise<string> {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.text;
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_KEY) return "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase
      .from("vrma_animations")
      .select("name, category, file_path")
      .eq("is_active", true)
      .not("category", "in", "(talking,idle)")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error || !data || data.length === 0) {
      catalogCache = { text: "", expiresAt: now + CATALOG_TTL_MS };
      return "";
    }

    // Group by category
    const byCat = new Map<string, string[]>();
    for (const row of data) {
      const cat = (row as { category: string }).category;
      const name = (row as { name: string }).name;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(name);
    }

    const lines: string[] = [];
    for (const [cat, names] of byCat) {
      lines.push(`${cat}: ${names.join(", ")}`);
    }
    const text = lines.join("\n");
    catalogCache = { text, expiresAt: now + CATALOG_TTL_MS };
    return text;
  } catch (e) {
    console.error("buildAnimationCatalog error:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, systemPrompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const defaultBehavior = "Kamu adalah asisten virtual yang ditampilkan sebagai avatar VRM 3D. Jawab ringkas (1-3 kalimat). Hangat dan membantu. Jawabanmu akan diucapkan via TTS, jadi tulis seperti berbicara natural.";

    const catalog = await buildAnimationCatalog();
    const animationBlock = catalog
      ? `

# Animation catalog
Kamu bisa mengekspresikan emosi melalui SATU animasi per balasan, dipilih dari katalog berikut. Nama animasi WAJIB persis sama dengan entri katalog, atau "none" jika tidak ada yang cocok.

${catalog}

Di AKHIR balasan, tambahkan pada baris baru tersendiri persis:
[ANIM:<nama persis>]    (atau [ANIM:none])

Pilih animasi berdasarkan NADA EMOSI BALASANMU SENDIRI, bukan mood user:
- User cerita sial/sedih → kamu prihatin → pilih reaction/emote untuk sympathy/sad
- User kabar baik/lucu → pilih emote senang
- User bertanya / kamu menjelaskan → pilih gesture thinking/explaining
- User memberi salam → pilih greeting animation
- User berterima kasih → pilih emote thankful
- Tidak yakin → [ANIM:none]

PENTING: Hanya pakai nama yang persis ada di katalog. Jangan mengarang nama.
Tag [ANIM:...] akan dihapus dari teks yang diucapkan — selalu sisipkan di baris terakhir.`
      : "";

    const personaBlock = systemPrompt
      ? `\n\n# Persona\n${systemPrompt}\n\n# Behavior rules\nSelalu jawab dalam karakter persona di atas. Ikuti gaya bicara, kepribadian, dan bahasa default persona. Jangan menyebut bahwa kamu adalah AI atau model bahasa kecuali persona memintanya.`
      : "";

    const systemContent = `${defaultBehavior}${personaBlock}${animationBlock}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: systemContent,
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
