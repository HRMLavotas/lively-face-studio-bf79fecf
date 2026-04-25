import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ALL_LANGS,
  LATIN_LANGS,
  langPriority,
  type LangCode,
} from '@/lib/lang-detect';

export interface TriggerClip {
  id: string;
  name: string;
  category: string;
  file_path: string;
  keywords: Partial<Record<LangCode, string[]>>;
}

export interface MatchResult {
  url: string;
  clip: TriggerClip;
  matchedLang: LangCode;
  matchedKeyword: string;
}

// Higher = checked first when multiple categories could match the same text.
const CATEGORY_PRIORITY: Record<string, number> = {
  greeting: 6,
  reaction: 5,
  emote: 4,
  gesture: 3,
  talking: 1,
  idle: 0,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchKeyword(haystack: string, kw: string, lang: LangCode): boolean {
  const k = kw.toLowerCase().normalize('NFC').trim();
  if (!k) return false;
  if ((LATIN_LANGS as string[]).includes(lang)) {
    // Word-boundary match for Latin scripts.
    try {
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(k)}([^\\p{L}\\p{N}]|$)`, 'iu').test(haystack);
    } catch {
      return haystack.includes(k);
    }
  }
  // CJK + Thai → substring.
  return haystack.includes(k);
}

export function useVrmaTriggers() {
  const [clips, setClips] = useState<TriggerClip[]>([]);
  const clipsRef = useRef<TriggerClip[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('vrma_animations')
        .select('id, name, category, file_path, trigger_keywords_i18n, trigger_keywords')
        .eq('is_active', true);
      if (error || !data || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: TriggerClip[] = data.map((d: any) => {
        const i18n = (d.trigger_keywords_i18n ?? {}) as Partial<Record<LangCode, string[]>>;
        // If i18n is empty but legacy flat array has values, fall back by treating them as 'en'.
        const hasAny = Object.values(i18n).some(v => Array.isArray(v) && v.length > 0);
        const keywords: Partial<Record<LangCode, string[]>> = hasAny
          ? i18n
          : { en: Array.isArray(d.trigger_keywords) ? d.trigger_keywords : [] };
        return {
          id: d.id,
          name: d.name,
          category: d.category,
          file_path: d.file_path,
          keywords,
        };
      });
      // Sort by category priority so findMatch returns highest-priority first.
      mapped.sort(
        (a, b) =>
          (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0),
      );
      clipsRef.current = mapped;
      setClips(mapped);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const findMatch = useCallback(
    (
      text: string,
      userPref?: LangCode | null,
      allowedCategories?: string[],
    ): MatchResult | null => {
      if (!text) return null;
      const haystack = text.toLowerCase().normalize('NFC');
      const langs = langPriority(text, userPref ?? null);
      for (const clip of clipsRef.current) {
        // Skip pools that should auto-loop, not single-trigger.
        if (clip.category === 'idle' || clip.category === 'talking') continue;
        // Optional whitelist (e.g. only greeting+emote for instant user feedback).
        if (allowedCategories && !allowedCategories.includes(clip.category)) continue;
        for (const lang of langs) {
          const kws = clip.keywords[lang] ?? [];
          for (const kw of kws) {
            if (matchKeyword(haystack, kw, lang)) {
              const { data } = supabase.storage
                .from('vrma-animations')
                .getPublicUrl(clip.file_path);
              if (data?.publicUrl) {
                return { url: data.publicUrl, clip, matchedLang: lang, matchedKeyword: kw };
              }
            }
          }
        }
      }
      return null;
    },
    [],
  );

  /**
   * Look up an animation clip by its exact name (case-insensitive). Used
   * when the AI reply contains an `[ANIM:<name>]` tag and we need to play
   * exactly that clip from the library — no keyword guessing.
   */
  const findClipByName = useCallback(
    (name: string): { url: string; clip: TriggerClip } | null => {
      if (!name) return null;
      const target = name.trim().toLowerCase();
      for (const clip of clipsRef.current) {
        if (clip.name.trim().toLowerCase() === target) {
          const { data } = supabase.storage
            .from('vrma-animations')
            .getPublicUrl(clip.file_path);
          if (data?.publicUrl) return { url: data.publicUrl, clip };
        }
      }
      return null;
    },
    [],
  );

  return { clips, findMatch, findClipByName };
}
