

## Plan: Multilingual VRMA library + auto-trigger (Asia + International)

### Tujuan
Perluas sistem keyword & trigger animasi agar mendukung pasar Asia (ID, EN, JP, KR, ZH, TH, VI) dengan deteksi otomatis dari teks chat, baik input user maupun balasan AI.

### Bagian 1 — Public access VRMA library (prasyarat)
Tambah RLS policy SELECT publik di `vrma_animations` agar semua user (login/guest) bisa membaca animasi `is_active=true`. Tanpa ini, fitur multilingual tidak akan jalan untuk non-admin.

```sql
CREATE POLICY "Public can view active animations"
  ON public.vrma_animations FOR SELECT USING (is_active = true);
```

### Bagian 2 — Skema keyword multilingual

Daripada mencampur semua bahasa di satu array `trigger_keywords` (sulit di-maintain), tambah kolom JSONB baru `trigger_keywords_i18n`:

```sql
ALTER TABLE public.vrma_animations
  ADD COLUMN trigger_keywords_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Struktur per baris:
```json
{
  "id": ["halo", "hai", "selamat pagi"],
  "en": ["hello", "hi", "good morning"],
  "ja": ["こんにちは", "やあ", "おはよう"],
  "ko": ["안녕", "안녕하세요"],
  "zh": ["你好", "嗨", "早上好"],
  "th": ["สวัสดี", "หวัดดี"],
  "vi": ["xin chào", "chào"]
}
```

Kolom `trigger_keywords` (text[]) lama tetap dipertahankan sebagai **fallback agregat** (semua bahasa di-flatten) untuk backward compatibility dengan kode existing.

### Bagian 3 — Data: keyword multilingual untuk 119 VRMA

Generate UPDATE batch untuk semua VRMA berdasar nama (English source). Untuk setiap clip, set 7 bahasa: ID, EN, JA, KO, ZH, TH, VI. Contoh:

| VRMA | Kategori | Bahasa → Keywords |
|---|---|---|
| Waving / Standing Greeting | greeting | id: halo,hai,dadah · en: hello,hi,bye · ja: こんにちは,やあ,さようなら · ko: 안녕,안녕히가세요 · zh: 你好,嗨,再见 · th: สวัสดี,ลาก่อน · vi: xin chào,tạm biệt |
| Thankful | emote | id: terima kasih,makasih · en: thanks,thank you · ja: ありがとう,どうも · ko: 고마워,감사합니다 · zh: 谢谢 · th: ขอบคุณ · vi: cảm ơn |
| Thinking | gesture | id: hmm,mikir,sebentar · en: hmm,thinking,let me think · ja: えっと,うーん,ちょっと待って · ko: 음,잠깐만 · zh: 嗯,想想,等等 · th: อืม,คิดดู · vi: hmm,để tôi nghĩ |
| Shaking Head No | gesture | id: tidak,jangan · en: no,don't · ja: いいえ,だめ · ko: 아니,안돼 · zh: 不,不要 · th: ไม่ · vi: không |
| Surprise | reaction | id: wah,kaget,astaga · en: wow,omg,surprised · ja: わあ,びっくり,えっ · ko: 와,깜짝이야 · zh: 哇,天啊 · th: ว้าว,ตกใจ · vi: ồ,ngạc nhiên |
| Angry | reaction | id: marah,kesal · en: angry,mad · ja: 怒る,むかつく · ko: 화나,짜증 · zh: 生气,气死了 · th: โกรธ · vi: tức giận |
| Cheering / Victory | emote | id: hore,mantap,menang · en: yay,awesome,victory · ja: やった,すごい,勝った · ko: 야호,대박,이겼다 · zh: 太棒了,赢了 · th: เย่,เจ๋ง · vi: tuyệt,thắng rồi |
| Pointing | gesture | id: itu,lihat,sana · en: there,look,that · ja: あれ,見て,そこ · ko: 저기,봐 · zh: 那个,看 · th: นั่น,ดู · vi: kia,nhìn |
| Salute | gesture | id: hormat,siap · en: salute,sir · ja: 敬礼 · ko: 경례 · zh: 敬礼 · th: เคารพ · vi: chào |

Total ~119 UPDATE statements, dijalankan via insert tool. Setiap update juga refresh `trigger_keywords` (flatten array) untuk fallback.

### Bagian 4 — Hook `useVrmaTriggers.ts` (multilingual matcher)

```ts
// Pseudocode
const animations = await loadActiveAnimations(); // includes trigger_keywords_i18n

function findMatch(text: string, lang?: string): MatchedClip | null {
  const lower = text.toLowerCase().normalize('NFC');
  
  for (const anim of orderedByPriority(animations)) {
    const i18n = anim.trigger_keywords_i18n;
    // Strategy: cek bahasa yang terdeteksi dulu, lalu fallback ke semua bahasa
    const langsToCheck = lang ? [lang, ...OTHER_LANGS] : ALL_LANGS;
    
    for (const l of langsToCheck) {
      const keywords = i18n[l] ?? [];
      for (const kw of keywords) {
        if (matchKeyword(lower, kw, l)) return { anim, matchedLang: l };
      }
    }
  }
  return null;
}
```

**Matching strategy per bahasa:**
- **Latin scripts (id, en, vi)**: word-boundary regex `\b{kw}\b` (case-insensitive).
- **CJK (ja, ko, zh)**: substring match (no word boundary — CJK tidak pakai spasi). Normalisasi NFC.
- **Thai**: substring match (Thai juga tanpa spasi antar kata).

**Language detection (optional, ringan):**
- Deteksi script via Unicode range:
  - `/[\u3040-\u30FF]/` → Japanese (hiragana/katakana)
  - `/[\uAC00-\uD7AF]/` → Korean
  - `/[\u4E00-\u9FFF]/` → Chinese (or Japanese kanji)
  - `/[\u0E00-\u0E7F]/` → Thai
  - default Latin → fallback ke ID + EN + VI
- Tidak perlu library berat; kalau ambigu (CJK kanji) → cek semua bahasa.

### Bagian 5 — UI Animation Studio (admin)

Update `VrmaLibrary.tsx` & `VrmaUploader.tsx`:
- Edit mode: ganti single textarea "keywords" jadi **tabs per bahasa** (ID, EN, JA, KO, ZH, TH, VI), masing-masing punya input keyword comma-separated.
- Saat save: build object `{ id: [...], en: [...], ... }` → simpan ke `trigger_keywords_i18n`. Auto-generate `trigger_keywords` flat sebagai union semua bahasa.
- View mode: tampilkan badge kecil per bahasa dengan jumlah keyword, contoh: `ID(3) EN(2) JA(2)`.

### Bagian 6 — Integrasi ke chat flow (`Index.tsx`)

- User kirim pesan → `findMatch(userText)` → kalau ada, play VRMA gesture (override talking loop sementara).
- AI reply → `findMatch(aiText)` sebelum TTS mulai. Match → prioritaskan gesture clip. Tidak match → fallback ke talking loop.
- Prioritas kategori: `greeting > reaction > emote > gesture > talking > idle`.

### Bagian 7 — UI bahasa user (opsional, lightweight)

Tambah selector di Settings: "Bahasa interaksi" (auto-detect / ID / EN / JA / KO / ZH / TH / VI). Disimpan di localStorage. `findMatch` pakai bahasa ini sebagai prioritas. Default: auto-detect dari teks.

### File yang diubah

**Migration (schema)**:
- Add column `trigger_keywords_i18n jsonb` ke `vrma_animations`.
- Add public SELECT RLS policy.

**Data (insert tool, batch)**:
- ~119 UPDATE statements untuk isi `trigger_keywords_i18n` + refresh `trigger_keywords`.

**Code**:
- `src/hooks/useVrmaTriggers.ts` (baru) — multilingual matcher + script detection.
- `src/lib/lang-detect.ts` (baru) — Unicode-range based language hint.
- `src/components/VrmaLibrary.tsx` — UI tabs per bahasa untuk edit keyword.
- `src/components/VrmaUploader.tsx` — input multilingual saat upload baru.
- `src/pages/Index.tsx` — wire trigger ke chat flow.
- `src/components/VrmViewer.tsx` — expose `playVrmaUrl()` untuk gesture override + balik ke talking/idle setelah selesai.
- `src/integrations/supabase/types.ts` — auto-regenerate (tidak perlu manual edit).

### Hasil yang diharapkan

1. ✅ Library VRMA bisa diakses semua user (admin + free + guest).
2. ✅ Setiap animasi punya keyword di 7 bahasa Asia + English.
3. ✅ Avatar otomatis trigger gesture sesuai konteks chat dalam bahasa apapun:
   - "Hello!" / "こんにちは" / "안녕" / "你好" / "สวัสดี" → wave.
   - "Thank you" / "ありがとう" / "감사합니다" / "谢谢" → thankful.
   - "Hmm let me think" / "えっと" / "嗯..." → thinking.
4. ✅ Admin bisa edit keyword per bahasa lewat UI tabs di Animation Studio.
5. ✅ Backward compatible: kolom `trigger_keywords` lama tetap terisi sebagai fallback flatten.

