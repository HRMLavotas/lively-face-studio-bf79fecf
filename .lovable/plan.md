

## Plan: Fix T-pose flash + smart AI-driven animation selection

### Akar masalah saat ini

**1. Flash T-pose saat TTS / transisi**
Di `src/lib/vrma-player.ts` fungsi `playVRMA()` memanggil `mixer.stopAllAction()` + `mixer.uncacheRoot(root)` **sebelum** action baru di-`fadeIn`. Karena uncache menghapus semua action dalam 1 frame, ada window singkat di mana tidak ada action ber-weight → bones snap ke bind pose (T-pose). Ini terjadi setiap transisi: idle→talking, antar talking-clip, gesture→talking.

**2. Pemilihan animasi acak / tidak nyambung**
`useVrmaTriggers.findMatch()` cuma cocokkan keyword string. Untuk pesan AI seperti "...semoga harimu jauh lebih lancar dan ada hal seru...", kata "seru" / "asik" / "keren" / "wah" gampang trigger Cheering/Surprise walau konteks emosi user sedih. AI tidak tahu daftar animasi yang tersedia — keyword matcher buta konteks.

**3. Build error**
`src/components/VrmaLibrary.tsx` line 247-248 masih pakai `editState.keywords` (field lama) padahal `EditState` sekarang `keywordsByLang`.

---

### Bagian 1 — Fix T-pose flash (cross-fade, tidak uncache)

Ubah `playVRMA()` di `src/lib/vrma-player.ts`:
- **Hapus** `mixer.stopAllAction()` + `mixer.uncacheRoot(root)` di awal.
- Sebagai gantinya: ambil daftar action yang sedang aktif → `fadeOut(crossfadeDuration)` semuanya, lalu `fadeIn` action baru di durasi yang sama. Three.js akan blend bones secara mulus dari pose lama ke pose baru tanpa pernah ke bind pose.
- Setelah `fadeIn` selesai (via `setTimeout(duration*1000)`), baru cleanup action lama (`stop()` + `uncacheClip()` per action lama) untuk hindari memory leak.
- Default `fadeIn` naikkan jadi `0.4s` untuk semua transisi (talking, gesture, idle switch). Antar-talking-clip pakai `0.5s`.

Update `VrmViewer.tsx`:
- Saat `isSpeaking` jadi `true`: idle action **tidak di-stop** dulu — biarkan `playVRMA` cross-fade dari idle ke talking. Tandai `idlePausedForActivityRef = true` setelah cross-fade selesai supaya loop tidak dilanjutkan.
- Saat `isSpeaking` jadi `false`: gunakan `playVRMA` lagi untuk cross-fade dari talking kembali ke idle clip (bukan `returnToRestPose` lalu start dari nol). Hapus pemanggilan `returnToRestPose` di flow normal — itu yang justru bikin avatar ke rest sejenak. Sisakan `returnToRestPose` hanya untuk skenario fallback (model unmount).
- Sama untuk transisi gesture→talking dan gesture→idle: pakai cross-fade.

### Bagian 2 — AI memilih animasi (semantic, bukan keyword)

Buat AI yang menulis balasan **sekaligus** memilih animasi yang paling cocok dari library yang tersedia. Ini menyelesaikan masalah random/tidak nyambung secara permanen.

**A. Edge function `chat/index.ts` — inject animation catalog ke system prompt**
- Sebelum panggil AI, query daftar animasi aktif (selain `talking` & `idle`):
  ```sql
  SELECT name, category FROM vrma_animations 
  WHERE is_active = true AND category NOT IN ('talking','idle')
  ORDER BY category, name;
  ```
- Bangun bagian system prompt:
  ```
  You can express emotion via ONE animation per reply.
  Available animations (pick at most one — name MUST match exactly, or "none"):
  greeting: Waving, Standing Greeting
  emote: Thankful, Cheering, Bashful, Pouting, Blow A Kiss, ...
  reaction: Sad Idle 1, Disappointed, Angry, Surprise, Bored, Wiping Sweat, ...
  gesture: Acknowledging, Agreeing, Thinking, Pointing, Salute, Shaking Head No, ...
  
  At the END of your reply, append on its own line exactly:
  [ANIM:<exact name>]    (or [ANIM:none] if no animation fits)
  
  Pick based on the EMOTIONAL TONE of YOUR reply, not the user's mood:
  - User sedih → kamu prihatin → reaction "Wiping Sweat" / emote "Bashful" (NOT Cheering/Surprise)
  - User cerita lucu → emote "Cheering" / "Happy Hand Gesture"
  - User tanya / kamu ragu → gesture "Thinking"
  - User salam → greeting "Waving"
  - User berterima kasih → emote "Thankful"
  ```
- Stream response apa adanya (frontend yang parse tag).

**B. Frontend parse `[ANIM:...]` tag**
- Di `src/lib/chat-api.ts` (atau di `Index.tsx` saat `onDone`): regex `/\[ANIM:([^\]]+)\]\s*$/` ambil nama, lalu **strip tag** dari teks sebelum kirim ke TTS.
- Tambah method baru `findClipByName(name)` di `useVrmaTriggers` yang return `{ url, clip }` dari list yang sudah dimuat. Match case-insensitive trim.
- Di `Index.tsx` handler `onDone` (sebelum TTS):
  1. Parse tag dari `assistantSoFar`.
  2. Strip tag dari teks → kirim teks bersih ke TTS.
  3. Kalau ada nama → `viewerRef.current.playVrmaUrl(url, { fadeIn: 0.4 })` **bersamaan** dengan TTS start.
  4. Kalau tidak ada / `none` → biarkan talking loop default.

**C. User message tetap pakai keyword matcher (sebagai instant feedback)**
- User kirim "halo" → langsung wave sebelum AI reply (low-latency hint). Tetap pakai `findMatch()` existing dengan threshold ketat: hanya kategori `greeting` + `emote` yang sangat eksplisit (Thankful, Bashful). Skip `reaction` & `gesture` ambiguous untuk user message — biar AI yang putuskan reaction yang tepat di reply.
- Tambah whitelist kategori di `findMatch(text, lang, allowedCategories?)`.

### Bagian 3 — Fix build error VrmaLibrary

Di `src/components/VrmaLibrary.tsx` line 226-269 (edit mode UI), ganti single `Input` keyword dengan **Tabs per bahasa** (sesuai rencana multilingual sebelumnya yang belum selesai):

```tsx
<Tabs defaultValue="id">
  <TabsList className="h-7">
    {LANGS.map(l => <TabsTrigger key={l} value={l} className="text-[10px] px-2">{LANG_LABEL[l]}</TabsTrigger>)}
  </TabsList>
  {LANGS.map(l => (
    <TabsContent key={l} value={l} className="mt-1">
      <Input
        className="h-7 text-xs"
        placeholder={`keyword ${LANG_LABEL[l]}, koma`}
        value={editState.keywordsByLang[l]}
        onChange={(e) => setEditState(s => ({
          ...s,
          keywordsByLang: { ...s.keywordsByLang, [l]: e.target.value }
        }))}
      />
    </TabsContent>
  ))}
</Tabs>
```

Pastikan `saveEdit()` (yang sudah ada) sudah build object `trigger_keywords_i18n` dari `keywordsByLang` + flatten ke `trigger_keywords`. Kalau belum, perbaiki juga.

### File yang diubah

- `src/lib/vrma-player.ts` — `playVRMA` cross-fade tanpa uncache; helper baru `crossFadeTo()`.
- `src/components/VrmViewer.tsx` — pakai cross-fade di transisi idle/talking/gesture; hapus `returnToRestPose` dari flow normal.
- `supabase/functions/chat/index.ts` — query animation catalog + inject ke system prompt + instruksi `[ANIM:name]`.
- `src/lib/chat-api.ts` — util `parseAnimTag(text): { clean, animName | null }`.
- `src/hooks/useVrmaTriggers.ts` — tambah `findClipByName(name)` + parameter opsional `allowedCategories` di `findMatch`.
- `src/pages/Index.tsx` — di alur reply: parse tag → strip → trigger animation by name; di `handleUserMessage` whitelist kategori greeting+emote saja.
- `src/components/VrmaLibrary.tsx` — fix `EditState` UI ke Tabs multilingual (juga selesaikan build error).

### Hasil yang diharapkan

1. ✅ Tidak ada lagi flash T-pose saat TTS mulai/berakhir atau saat ganti talking clip — semua transisi cross-fade halus 0.4s.
2. ✅ AI memilih animasi yang **kontekstual** dari library (tahu nama persisnya). Untuk kasus user cerita sial → AI prihatin → animasi `Wiping Sweat` / `Bashful` / `Sad Idle`, bukan Cheering/Surprise.
3. ✅ User keyword tetap memberi feedback instan untuk salam & ucapan eksplisit, tanpa kontaminasi reaction yang ambigu.
4. ✅ Build hijau, admin bisa edit keyword multilingual via tabs.

