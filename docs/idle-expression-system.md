# Sistem Idle Expression Otomatis

## Overview
Sistem ini secara otomatis merotasi ekspresi wajah model VRM saat idle untuk memberikan kesan hidup dan variatif tanpa perlu intervensi manual.

## Fitur Utama

### 1. Ekspresi Pool yang Natural
- **Happy** (3.5x weight): Senyum ringan, paling natural
- **Curious** (2.5x weight): Alis asimetris, terlihat "hidup"  
- **Thinking** (2.0x weight): Ekspresi fokus/melamun
- **Relaxed** (2.0x weight): Santai dan tenang
- **Bored** (1.5x weight): Datar, cocok saat idle lama
- **Embarrassed** (1.0x weight): Senyum malu, variasi menarik
- **Sympathetic** (0.8x weight): Empati, subtle
- **Neutral** (3.0x weight): Reset ke default model

### 2. Timing Variatif
- Setiap ekspresi memiliki durasi minimum dan maksimum yang berbeda
- Durasi dipilih secara random dalam range tersebut
- Neutral lebih sering muncul untuk kesan natural

### 3. Transisi Smooth
- Lerp halus antar ekspresi dengan easing function
- Tidak ada snap/jump yang tiba-tiba
- Intensity scaling untuk efek yang lebih subtle

### 4. Sistem Pause Otomatis
- **Saat TTS aktif**: Pause rotasi, tahan ekspresi saat ini
- **Mood override**: AI reply dapat override sementara, lalu kembali ke rotasi
- **Manual mode**: Untuk preview blendshape manual

### 5. Anti-Repetisi
- Mengurangi probabilitas ekspresi yang baru saja ditampilkan
- Memastikan variasi yang lebih baik

## Implementasi

### Inisialisasi
```typescript
initIdleExpression(); // Dipanggil saat VRM load
```

### Update Loop
```typescript
updateIdleExpression(delta, vrm); // Dipanggil setiap frame
```

### Kontrol
```typescript
setIdleExpressionPaused(true/false); // Pause saat speaking
setIdleExpressionManual(true/false);  // Manual blendshape mode
applyMoodOverride(mood, duration, vrm); // Override dari AI
```

## Konfigurasi

### Intensity Scaling
- Semua ekspresi di-scale dengan intensity 0.5-0.8 untuk efek subtle
- Mood override menggunakan intensity 0.8
- Dapat disesuaikan per ekspresi di `IDLE_POOL`

### Timing
- **Neutral**: 6-15 detik
- **Happy**: 8-18 detik  
- **Thinking**: 5-12 detik
- **Relaxed**: 10-20 detik (paling lama)

### Lerp Speed
- **LERP_IN_SPEED**: 1.2 (masuk)
- **LERP_OUT_SPEED**: 1.5 (keluar)
- Menggunakan ease-out quadratic untuk transisi natural

## Ekspresi yang Dihindari
Ekspresi berikut **TIDAK** digunakan untuk idle karena terlalu ekstrem:
- Laughing, Shocked, Crying, Angry, Disgusted

## Integrasi dengan Sistem Lain
- **TTS**: Auto-pause saat speaking
- **Mood Detection**: Override berdasarkan sentiment AI reply
- **Manual Blendshape**: Disable auto-rotation saat preview
- **VRMA Animations**: Tidak konflik dengan animasi gesture