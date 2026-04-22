

## Plan: Hilangkan T-pose saat TTS dengan memperbaiki cross-fade source

### Akar masalah (dari log + code review)

Saat user kirim "aku cape bgt banyak kerjaan", flow sebenarnya:

1. `isSpeaking=true` → talking effect mulai cross-fade dari idle ke talking clip 1 (20.75s, loop=false). `prev actions faded: 1` ✓
2. AI-tag trigger `Sad Idle 1` via `playVrmaUrl` → cross-fade ke Sad Idle (2.75s). `prev actions faded: 1` ✓ — tapi **`isTalkingPlayingRef` di-set false** (line 644)
3. Sad Idle selesai → masuk handler `onFinished` (line 646). Karena `isTalkingPlayingRef=false`, masuk branch idle → cross-fade ke idle clip (9.92s loop). **Log: `prev actions faded: 0`** ❌

Kenapa `prev=0`? Dua sebab bertumpuk:

**A. Cleanup `setTimeout` di `playVRMA` (vrma-player.ts:225-232)** memanggil `prev.stop()` setelah `fadeIn*1000+30ms`. Action yang sudah di-stop punya `isRunning()=false` dan `getEffectiveWeight()=0` → tidak masuk snapshot saat cross-fade berikutnya → tidak ada pose source → bones snap ke bind pose (T-pose) selama fadeIn.

**B. `isTalkingPlayingRef=false` di line 644** membuat sistem lupa bahwa TTS masih berjalan. Akibatnya setelah Sad Idle selesai sambil TTS masih `isSpeaking=true`, talking loop tidak resume — malah loncat ke idle → terlihat T-pose lama lalu idle.

Bonus issue: `playVRMA` saat dipanggil oleh `playVrmaUrl` di line 635 menerima `opts` tanpa `fadeIn` default → pakai 0.4 ✓, tapi karena prev action masih ada saat itu, fadeIn jalan. Tapi onFinished branch (line 659) hardcoded 0.5 fadeIn — masalahnya bukan durasi, tapi tidak ada source action.

### Perbaikan

**1. `src/lib/vrma-player.ts` — cleanup yang aman untuk cross-fade berikutnya**

Ganti strategi cleanup. Daripada `prev.stop()` setelah fadeIn selesai (yang membuat action invisible untuk cross-fade berikutnya), gunakan pendekatan: biarkan THREE.js auto-handle weight=0 actions, dan lakukan cleanup hanya saat action benar-benar tidak akan dipakai lagi (uncache clip lama hanya jika clip berbeda dari clip baru).

Konkret:
- Hapus `setTimeout(...)` cleanup yang memanggil `prev.stop()` di line 225-232.
- Sebagai gantinya: action lama yang weight-nya sudah 0 setelah fadeOut akan tetap di `_actions` array dengan `isRunning()=true` tapi `getEffectiveWeight()=0`. Itu **OK** — tidak mengganggu pose dan masih bisa jadi reference untuk cross-fade berikutnya kalau weight belum benar-benar 0.
- Ubah snapshot di playVRMA: ambil action yang `getEffectiveWeight() > 0.001` **OR** masih dalam fade transition (cek `_weightInterpolant` ada). Lebih aman: ambil semua action di `_actions` yang `enabled=true` dan `time > 0` — biarkan THREE blend mereka turun.

Lebih sederhana: **jangan pernah stop action otomatis**. Cukup biarkan `mixer.clipAction(clip)` mengembalikan action yang sama (cached) jika dipanggil lagi dengan clip yang sama. Memory leak minimal karena clip count terbatas (~120 clips). Hapus `setTimeout` cleanup sepenuhnya.

**2. `src/components/VrmViewer.tsx` — jangan reset `isTalkingPlayingRef` saat AI-gesture**

Di `playVrmaUrl` (line 644), JANGAN set `isTalkingPlayingRef.current = false` jika TTS masih berjalan (`isSpeakingRef.current === true`). Cukup set `vrmaActionRef.current` ke action gesture; `playNext()` di talking effect sudah punya guard `if (vrmaActionRef.current) return` — jadi talking tidak akan double-trigger.

Di `onFinished` handler (line 646-672), ubah branch:
- Kalau `isSpeakingRef.current === true` → langsung resume talking dengan `playNext()` style call. Caranya: panggil ulang `playVRMA(mixer, talkingClips[idx], { loop: false, fadeIn: 0.4 })` di sini, attach finished listener untuk lanjut talking-loop. Atau lebih bersih: extract `playNextTalking()` jadi callback yang bisa dipanggil dari mana saja.
- Kalau tidak speaking → cross-fade ke idle (existing).

**3. `VrmViewer.tsx` — saat TTS berakhir, pastikan source pose ada**

Di line 477-504 (TTS ended branch), saat memanggil `playVRMA(mixer, idleClip, { loop: true, fadeIn: 0.5 })`, **pastikan talking action terakhir masih punya weight > 0**. Karena fix #1 menghapus auto-stop, talking action terakhir akan masih running dengan weight=1 → cross-fade jalan benar.

**4. Refactor minor: extract `playNextTalking` jadi useCallback**

Pindahkan inline `playNext` (line 436-472) jadi `playNextTalking` useCallback supaya bisa dipanggil dari `onFinished` gesture handler. Ini menghilangkan duplikasi & memastikan talking resume mulus pasca-gesture.

### File yang diubah

- **`src/lib/vrma-player.ts`** — hapus `setTimeout` auto-stop di `playVRMA` (line 222-232). Tambah comment menjelaskan kenapa kita biarkan action tetap ada (THREE menangani weight=0).
- **`src/components/VrmViewer.tsx`** — 
  - Extract `playNextTalking` jadi `useCallback`.
  - Di `playVrmaUrl`: ganti `isTalkingPlayingRef.current = false` jadi `if (!isSpeakingRef.current) isTalkingPlayingRef.current = false`.
  - Di `onFinished` handler gesture: jika `isSpeakingRef.current && talkingClips.length > 0` → panggil `playNextTalking()` (resume talking), bukan jatuh ke idle.

### Hasil yang diharapkan

1. ✅ Tidak ada flash T-pose lagi saat TTS mulai (idle → talking) — fix sudah ada, akan stabil setelah cleanup di-hapus.
2. ✅ Tidak ada T-pose saat AI-tag gesture muncul di tengah TTS — talking action lama tetap jadi source pose untuk cross-fade gesture.
3. ✅ Setelah gesture (Sad Idle) selesai DAN TTS masih ngomong → otomatis lanjut ke talking clip berikutnya, BUKAN loncat ke idle yang kosong source-nya.
4. ✅ Setelah TTS selesai → cross-fade halus dari talking terakhir ke idle clip (source pose tersedia).
5. ✅ Memory tetap terkendali karena `clipAction(clip)` cached dan jumlah clip aktif terbatas (~120).

