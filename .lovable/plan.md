

## Plan: Fix admin role + Animation Studio reliability

### Masalah 1: Profile & role tidak ter-create untuk Google sign-up
Database menunjukkan user `ali.coolz30@gmail.com` (id `3a6d3679...`) ada di `auth.users` tapi `profiles` dan `user_roles` kosong. Function `handle_new_user()` sudah ada dan benar (sudah handle email admin), tapi **trigger `on_auth_user_created` tidak terpasang** (lihat `<db-triggers>`: "There are no triggers in the database").

**Fix:**
1. Migration: buat trigger `on_auth_user_created AFTER INSERT ON auth.users` yang memanggil `public.handle_new_user()`.
2. Backfill data untuk user existing — INSERT ke `profiles` (display_name dari Google metadata) dan `user_roles` dengan role `admin` untuk `ali.coolz30@gmail.com`.

### Masalah 2: Animation Studio terasa "reload" saat upload VRMA
Root cause yang ditemukan:
- `<Button>` shadcn tidak set `type` default → default ke `"submit"`. Walau tidak ada `<form>` parent saat ini, ini risky. Tambah `type="button"` di `VrmaUploader` untuk safety.
- Saat file dipilih, `handleFileSelected` dipanggil tapi jika model VRM belum siap (`isVrmLoaded()` false) hanya muncul toast warning — file blob URL tidak disimpan untuk retry. User harus pilih ulang.
- VRMA player saat ini sudah benar secara dokumentasi Pixiv (`VRMAnimationLoaderPlugin` + `createVRMAnimationClip` + `VRMLookAtQuaternionProxy`), tapi ada beberapa issue minor:
  - `loadVRMA` tidak revoke blob URL setelah parsing (memory leak kecil)
  - Mixer di-recreate kalau null tapi tidak di-uncache action lama dengan benar saat ganti file → kadang frame pertama nge-snap ke pose lama
  - Tidak ada feedback visual saat clip sedang di-load (UI terlihat "freeze")

**Fix di Animation Studio:**
1. **`src/components/VrmaUploader.tsx`**: tambah `type="button"` ke `<Button>`.
2. **`src/pages/AdminAnimations.tsx`**:
   - Polling/retry: jika `isVrmLoaded()` false saat file dipilih, tunggu sampai model siap (poll tiap 200ms, max 10 detik) lalu auto-play.
   - Tampilkan loading state saat clip sedang di-parse.
3. **`src/lib/vrma-player.ts`**:
   - Sebelum `mixer.clipAction(clip)`, panggil `mixer.stopAllAction()` + iterasi `mixer._actions` untuk uncache semua clip lama (bukan hanya clip baru). Ini mencegah pose residual.
   - Reset pose VRM ke rest pose (`vrm.humanoid.resetNormalizedPose()`) sebelum mainkan clip baru, agar transition dari clip ke clip bersih.
4. **`src/components/VrmViewer.tsx`**:
   - Saat `playVrmaUrl` dipanggil, panggil `vrm.humanoid?.resetNormalizedPose()` sebelum mulai mixer agar tidak ada residual pose dari clip sebelumnya.
   - Pastikan `useImperativeHandle` deps berisi `[]` tetap valid (refs mutable, OK).

### Perubahan database (migration)
```sql
-- Trigger untuk auto-create profile + role on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Perubahan data (insert tool)
```sql
-- Backfill profile untuk user existing
INSERT INTO public.profiles (user_id, display_name)
VALUES ('3a6d3679-059b-4188-9ff0-d4fa467effbb', 'LittleDunk STAR')
ON CONFLICT DO NOTHING;

-- Beri role admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('3a6d3679-059b-4188-9ff0-d4fa467effbb', 'admin')
ON CONFLICT DO NOTHING;
```

### File yang akan diubah
- `supabase/migrations/<new>.sql` — trigger
- `src/components/VrmaUploader.tsx` — `type="button"`
- `src/pages/AdminAnimations.tsx` — retry logic + loading state
- `src/lib/vrma-player.ts` — uncache + pose reset
- `src/components/VrmViewer.tsx` — reset pose sebelum play VRMA

### Hasil yang diharapkan
- User `ali.coolz30@gmail.com` punya role `admin` → menu Animation Studio terbuka.
- Future Google signup otomatis dapat profile + role `free` (atau `admin` kalau email match).
- Upload VRMA langsung tampil tanpa "reload" feeling, transition antar clip bersih.

