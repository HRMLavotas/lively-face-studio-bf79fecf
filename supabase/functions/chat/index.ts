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

    const defaultSystem = "You are a friendly virtual assistant displayed as a 3D VRM avatar. Keep responses concise (1-3 sentences). Be warm and helpful. Your responses will be spoken aloud via TTS, so write naturally as if speaking.";

    const catalog = await buildAnimationCatalog();
    const animationInstruction = catalog
      ? `

You can express emotion through ONE animation per reply, chosen from the catalog below. The animation name MUST match EXACTLY one entry, or be "none" if no animation fits.

Available animations:
${catalog}

At the END of your reply, append on its own new line exactly:
[ANIM:<exact name>]    (or [ANIM:none])

Pick the animation based on the EMOTIONAL TONE OF YOUR OWN REPLY, not the user's mood. Examples:
- User cerita sial / sedih → kamu prihatin → pick a "reaction" or "emote" that fits sadness/sympathy
- User cerita lucu / kabar baik → pick a happy "emote" from the catalog
- User bertanya / kamu sedang berpikir → pick a "gesture" that fits thinking/explaining
- User memberi salam → pick a "greeting" animation from the catalog
- User berterima kasih → pick a thankful "emote" from the catalog
- User menolak / kamu menolak → pick a "gesture" that fits disagreement
- User minta penjelasan / kamu setuju → pick a "gesture" that fits agreement/pointing

IMPORTANT: Only use animation names that appear EXACTLY in the catalog above. Do not invent names.
The [ANIM:...] tag is metadata — it will be stripped from the spoken output. Always include it on its own line at the very end.`
      : "";

    const systemContent = systemPrompt
      ? `${defaultSystem}\n\nKepribadian karakter ini: ${systemPrompt}${animationInstruction}`
      : `${defaultSystem}${animationInstruction}`;

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
