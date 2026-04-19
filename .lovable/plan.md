
User wants to remove all procedural body/idle/gesture animations from the VRM model, keeping ONLY facial blendshape animations (blink, micro-expressions, lip-sync, mood). This way:
1. The default avatar only has facial animations
2. In Animation Studio, when uploading a VRMA file, the body animation will be clearly visible without procedural animations interfering

Let me check what's in vrm-animations.ts to confirm scope.
<lov-tool-use id="toolu_vrtx_01Qrx1oofFPTK94f1x8StXXm" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/vrm-animations.ts\", \"lines\": \"1-50\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_017XDj2BzVmx4D3a2KvhVV3a" name="code--search_files" integration-id="code" data="{\"query\": \"updateIdleAnimation|updateSpeakingGestures|updateIdleFidgets\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01HS6tKxpB8bid4MikRVQ8fe" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/vrm-animations.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_018mhb5bDvcQ5WeGDQcK9Pty" name="code--search_files" integration-id="code" data="{\"query\": \"updateIdleAnimation|updateSpeakingGestures|updateIdleFidgets\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01D4DZeqwgxb9eDbk7C6t4RD" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/AdminAnimations.tsx\"}">
</lov-tool-use>
I have enough context. The user wants to remove all procedural body/arm/idle animations from the model. Keep only facial blendshapes (blink, mood/micro expressions, lip sync). The animation studio should already work since procedural animations don't run when VRMA is active, but the issue may also be the existing build error. Let me also fix the `.name` property error.

<lov-plan>

## Plan: Reset semua animasi body, pertahankan hanya animasi wajah

### Tujuan
Hapus seluruh animasi prosedural pada body/arm/head/idle. Pertahankan hanya animasi blendshape wajah (blink, mood micro-expressions, lip sync, mouth shapes). Ini juga memastikan Animation Studio menampilkan VRMA murni tanpa interferensi.

### Perubahan

**1. `src/components/VrmViewer.tsx`**
- Hapus import: `updateIdleAnimation`, `updateSpeakingGestures`, `updateIdleFidgets`.
- Di `animate()` loop, hapus blok `else` yang memanggil ketiga fungsi tersebut. Pertahankan:
  - `updateBlink` (kedipan mata)
  - `updateMicroExpressions` (mood + brow + subtle expressions)
  - `updateLipSync` (sinkronisasi mulut saat speaking)
  - `resetMouthExpressions` (reset saat berhenti bicara)
  - `setTargetMood` (driver mood dari sentiment)
  - VRMA mixer update (untuk Animation Studio)

**2. `src/lib/vrm-animations.ts`**
- Hapus fungsi (tidak terpakai lagi):
  - `updateSpeakingGestures` + seluruh gesture catalogue (GESTURE_CATALOGUE, presets OPEN_HAND/RELAXED_HAND/dll, ArmSmooth, finger logic)
  - `updateIdleFidgets` + state fidget terkait
  - `updateIdleAnimation` (head sway, spine bob, breathing, arm sway prosedural)
  - `getMoodHeadBias` jika hanya dipakai oleh idle animation
- **Pertahankan**:
  - Blink system (`updateBlink`)
  - Mood system (`setTargetMood`, `getActiveMood`, `setIdleMoodEnabled`, `updateMicroExpressions`, MOOD_PRESETS, lerpMood)
  - Lip sync (`updateLipSync`, `resetMouthExpressions`, MOUTH_SHAPES)

**3. Fix build error existing — `src/lib/vrma-player.ts` line 29**
- `VRMLookAtQuaternionProxy` extends `THREE.Object3D`, tapi TS overloadnya tidak meng-expose `.name`. Solusi: assign via cast (`(proxy as THREE.Object3D).name = '...'`) atau hapus baris assignment nama proxy (tidak fungsional, hanya debug label).

### Hasil yang diharapkan
- Model berdiri statis pada T-pose/rest pose VRM aslinya.
- Wajah tetap "hidup": kedipan, mood, ekspresi mikro, lip sync saat TTS.
- Animation Studio: saat upload VRMA, satu-satunya gerakan body adalah dari file VRMA tersebut — tidak ada lagi gangguan dari gesture/idle prosedural.
- Build error TS2339 hilang.

### Catatan
- Procedural code sudah di-skip saat VRMA aktif (via `vrmaPlayingRef`), tapi sekarang dihapus total agar konsisten di semua tempat (chat utama juga tidak akan ada gerakan body prosedural).
- Tidak ada perubahan database / Supabase / UI lain.

