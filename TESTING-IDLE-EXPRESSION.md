# Testing Idle Expression System

## Perubahan yang Dibuat

### 1. File yang Dimodifikasi
- ✅ `src/lib/idle-expression.ts` - Sistem rotasi ekspresi otomatis dengan logging
- ✅ `src/components/VrmViewer.tsx` - Integrasi di render loop
- ✅ `src/pages/Settings.tsx` - Hapus IdlePresetSelector (tidak diperlukan)
- ✅ `src/lib/blendshape-defaults.ts` - Tambah preset "Relaxed"

### 2. Fitur yang Ditambahkan
- **Auto-rotation**: 7 ekspresi berganti otomatis setiap 5-20 detik
- **Smooth transitions**: Lerp dengan easing function
- **Debug logging**: Console log untuk monitoring
- **Anti-repetisi**: Mencegah ekspresi yang sama berulang
- **Pause otomatis**: Berhenti saat TTS aktif

## Cara Testing

### Step 1: Refresh Browser
1. Buka http://localhost:8080/
2. Hard refresh: `Ctrl + Shift + R` (Windows) atau `Cmd + Shift + R` (Mac)
3. Buka Developer Console: `F12` atau `Ctrl + Shift + I`

### Step 2: Cek Console Logs
Anda harus melihat log seperti ini:

```
[Idle Expression] Initialized! First expression in 5.3 seconds
[Idle Expression] Switching to: Happy for 12.4 seconds
[Idle Expression] Transition complete to: Happy
[Idle Expression] Switching to: Curious for 8.7 seconds
[Idle Expression] Transition complete to: Curious
```

### Step 3: Observasi Visual
- **Idle state**: Model harus berganti ekspresi setiap 5-20 detik
- **Saat berbicara**: Ekspresi pause, tidak berubah
- **Setelah berbicara**: Resume rotasi ekspresi

### Step 4: Cek Status
Setiap ~3 detik akan ada log status:
```javascript
{
  active: "Happy",
  holdTimer: "8.5",
  holdTarget: "12.4",
  transitioning: false,
  paused: false,
  inMoodOverride: false,
  currentWeights: 5
}
```

## Troubleshooting

### Jika Tidak Ada Log
1. **Cek localStorage**: Buka Console, ketik:
   ```javascript
   JSON.parse(localStorage.getItem('blendshape-presets') || '[]')
   ```
   Harus ada preset: Happy, Curious, Thinking, Bored, Embarrassed, Sympathetic, Relaxed

2. **Reset presets**: Jika preset tidak ada, ketik di Console:
   ```javascript
   localStorage.removeItem('blendshape-presets')
   ```
   Lalu refresh halaman

### Jika Ekspresi Tidak Berubah
1. **Cek model VRM**: Pastikan model support blendshapes/expressions
2. **Cek Console errors**: Lihat apakah ada error di Console
3. **Cek paused state**: Pastikan `paused: false` di log status

### Jika Transisi Terlalu Cepat/Lambat
Edit `src/lib/idle-expression.ts`:
- `LERP_IN_SPEED`: Ubah dari 1.2 ke nilai lain (lebih besar = lebih cepat)
- `minDuration` / `maxDuration`: Ubah durasi per ekspresi

## Expected Behavior

### Timeline Normal
```
0s   - Neutral (model default)
5s   - Mulai transisi ke Happy (1-2 detik transisi)
7s   - Happy penuh
19s  - Mulai transisi ke Neutral
21s  - Neutral penuh
27s  - Mulai transisi ke Curious
29s  - Curious penuh
...  - Dan seterusnya
```

### Ekspresi Pool
1. **Happy** (sering) - Senyum natural
2. **Curious** (sedang) - Alis asimetris
3. **Thinking** (sedang) - Fokus/melamun
4. **Bored** (jarang) - Datar
5. **Embarrassed** (jarang) - Senyum malu
6. **Sympathetic** (paling jarang) - Empati
7. **Relaxed** (sedang) - Santai
8. **Neutral** (sering) - Reset ke default

## Debug Commands

Buka Console dan coba:

```javascript
// Lihat semua preset
JSON.parse(localStorage.getItem('blendshape-presets') || '[]')
  .filter(p => p.is_active)
  .map(p => p.name)

// Force trigger ekspresi (jika ada akses ke window.vrm)
// Note: Ini hanya contoh, perlu implementasi tambahan
```

## Jika Masih Tidak Bekerja

Kirim screenshot dari:
1. Console logs (semua log yang muncul)
2. Network tab (pastikan tidak ada error loading)
3. Application > Local Storage > blendshape-presets

Dan jelaskan:
- Apakah ada log "[Idle Expression] Initialized"?
- Apakah ada log "Switching to"?
- Apakah model VRM support expressions?
