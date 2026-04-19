

## Rencana: Perbaikan Error Upload VRMA di Animation Studio

### Diagnosa Error

Error `Cannot read properties of null (reading 'stopAllAction')` terjadi di `vrma-player.ts` baris `mixer.stopAllAction()`. Mixer = null karena race condition:

**Alur bug:**
1. User pilih `.vrma` → `playVrmaUrl(blobUrl)` di `VrmViewer.tsx`
2. Dalam fungsi: capture `vrm`, set mixer, lalu `await loadVRMA(url, vrm)` — proses fetch + parse GLB butuh waktu
3. **Selama await**, `useImperativeHandle` re-create dengan deps `[]` → stale closure tetap pegang `mixerRef`, TAPI bila `modelUrl` effect cleanup berjalan (re-render karena `loading` state, dll), `mixerRef.current = null` (line 296 atau 179)
4. Setelah await selesai → `playVRMA(null, clip)` → crash

**Masalah tambahan yang terdeteksi:**
- `playVRMA` selalu `mixer.stopAllAction()` — tidak aman bila mixer baru
- `loadVRMA` tidak validate apakah `vrm.humanoid` ada (VRMA butuh humanoid mapping)
- Tidak ada error handling untuk `.vrma` yang corrupt / format lama / tanpa ekstensi `VRMC_vrm_animation`
- `createVRMAnimationClip` bisa throw kalau bone mapping tidak match — error mentah ke user
- GLTFLoader load via blob URL — mostly OK, tapi tidak ada CORS/MIME validation

---

### Perubahan File

**`src/lib/vrma-player.ts`** — defensive + better errors
- `loadVRMA`: tambah try/catch eksplisit, validate `vrm.humanoid` ada, beri pesan error jelas (kurang `VRMC_vrm_animation` extension, format VRMA lama, dst)
- `playVRMA`: cek `mixer` non-null sebelum `stopAllAction`, jangan throw kalau mixer baru
- `stopVRMA`: guard null mixer

**`src/components/VrmViewer.tsx`** — fix race condition
- Refactor `playVrmaUrl` di `useImperativeHandle`:
  - Re-check `vrmRef.current` & `mixerRef.current` SETELAH `await loadVRMA` selesai
  - Kalau model di-reload selama await → throw error jelas "Model di-reload, coba lagi"
  - Kalau mixer hilang setelah await → recreate dari vrm yang masih valid
- `useImperativeHandle` deps tetap `[]` (refs stable), tapi tambah safety checks
- Saat cleanup `modelUrl` effect, JANGAN nullify `mixerRef` di awal effect (baris 179) — biarkan cleanup return function yang handle. Ini menghindari nullify saat strict-mode double-invoke
- Tambah console.log untuk debug VRMA load (akan dilepas nanti)

**`src/pages/AdminAnimations.tsx`** — UX yang lebih baik
- `handleFileSelected`: tampilkan toast loading sebelum await `playVrmaUrl`
- Cat