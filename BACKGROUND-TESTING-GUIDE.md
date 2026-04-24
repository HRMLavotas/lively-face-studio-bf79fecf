# Background System Testing Guide 🧪

## 🎯 Testing Checklist

Sekarang bucket `backgrounds` sudah dibuat, mari test semua functionality:

### 1. **Test Default Backgrounds (Free Users)**

#### Expected Behavior:
- ✅ Background selector button muncul (image icon, bottom-left)
- ✅ Gallery modal terbuka dengan 4 free backgrounds
- ✅ Thumbnails ter-generate otomatis (placeholder gradients)
- ✅ Background berubah saat diklik
- ✅ Toast notification muncul

#### Test Steps:
1. **Open Background Selector** - Click image icon di bottom-left
2. **Verify Free Backgrounds** - Should see 4 options:
   - Cyberpunk City (purple-blue gradient)
   - Neon Grid (blue gradient with grid)
   - Space Station (dark gradient with stars)
   - Digital Void (purple gradient with particles)
3. **Select Background** - Click any background
4. **Verify Application** - Background should change in 3D scene
5. **Check Console** - Should see loading logs

### 2. **Test Pro User Features**

#### Expected Behavior:
- ✅ All 6 backgrounds visible (4 free + 2 pro)
- ✅ Upload section visible
- ✅ Pro badges on premium backgrounds
- ✅ Upload functionality works

#### Test Steps:
1. **Upgrade to Pro** (or simulate pro status)
2. **Open Background Selector**
3. **Verify Pro Backgrounds** - Should see 2 additional:
   - Hologram Lab (blue-gray gradient)
   - Matrix Code (green-black gradient)
4. **Test Upload** - Try uploading an image file
5. **Verify Upload** - Should appear in gallery

### 3. **Test Upload Functionality**

#### Expected Behavior:
- ✅ File validation works (image files only)
- ✅ Size validation works (10MB limit)
- ✅ Upload to Supabase bucket succeeds
- ✅ Fallback to localStorage if needed
- ✅ Custom background appears in gallery

#### Test Steps:
1. **Prepare Test Image** - Any JPG/PNG under 10MB
2. **Click Upload Button** - In background selector
3. **Select File** - Choose your test image
4. **Verify Upload Progress** - Should see loading state
5. **Check Result** - Image should appear in gallery
6. **Test Selection** - Click uploaded background
7. **Verify Application** - Should apply to 3D scene

### 4. **Test Error Handling**

#### Test Cases:
- **Invalid File Type** - Try uploading .txt file
- **Large File** - Try uploading >10MB image
- **Network Error** - Disconnect internet during upload
- **Missing Bucket** - Simulate bucket not found

#### Expected Results:
- ✅ Clear error messages
- ✅ Graceful fallbacks
- ✅ No app crashes
- ✅ localStorage backup works

## 🔍 **Debugging Console Logs**

### Successful Background Selection:
```
[BackgroundSelector] Selecting background: {id: "cyberpunk-city", name: "Cyberpunk City", ...}
[Environment] Loading custom image background: data:image/jpeg;base64,...
[Environment] Image loaded successfully
[Environment] Custom image background applied
```

### Successful Upload:
```
[BackgroundManager] Uploading to Supabase...
[BackgroundManager] Upload successful: custom-1777030760425.jpg
[BackgroundSelector] Background added to gallery
```

### Fallback to localStorage:
```
[BackgroundManager] Supabase upload failed, using localStorage: StorageApiError
[BackgroundManager] Saved to localStorage successfully
```

## 🐛 **Common Issues & Solutions**

### Issue: "Background tidak tampil"
**Cause**: Image loading error atau texture tidak ter-apply
**Solution**: 
- Check console untuk error logs
- Verify image URL accessible
- Check if placeholder generation works

### Issue: "Upload gagal"
**Cause**: Bucket permissions atau RLS policy
**Solution**:
- Verify bucket `backgrounds` exists
- Check RLS policies applied correctly
- Test with different file types/sizes

### Issue: "Pro features tidak muncul"
**Cause**: User role tidak ter-detect
**Solution**:
- Check `useUserRole` hook
- Verify user_roles table
- Test with manual pro status

## 📊 **Performance Testing**

### Load Time Targets:
- **Gallery Open**: <1s
- **Thumbnail Load**: <2s for all 6 thumbnails
- **Background Switch**: <1s
- **Upload Process**: <5s for 2MB image

### Memory Usage:
- **Texture Memory**: Should dispose old textures
- **Canvas Memory**: Generated placeholders should be efficient
- **Storage Usage**: localStorage should not exceed 50MB

## ✅ **Success Criteria**

### Core Functionality:
- [ ] Background selector opens without errors
- [ ] All default backgrounds load and display
- [ ] Background switching works in real-time
- [ ] Pro users can upload custom backgrounds
- [ ] Uploaded backgrounds persist and load correctly

### User Experience:
- [ ] Loading states provide clear feedback
- [ ] Error messages are helpful and actionable
- [ ] Interface is responsive on mobile
- [ ] Pro upgrade prompts are clear

### Technical:
- [ ] No console errors during normal operation
- [ ] Memory usage remains stable
- [ ] Fallbacks work when Supabase unavailable
- [ ] Build process completes without warnings

## 🚀 **Next Steps After Testing**

### If All Tests Pass:
1. **Add Real Background Images** to `/public/backgrounds/`
2. **Create Professional Thumbnails** 
3. **Optimize Image Sizes** for web delivery
4. **Document User Guide** for background features

### If Issues Found:
1. **Check Console Logs** for specific errors
2. **Verify Supabase Setup** (bucket, policies, permissions)
3. **Test Individual Components** (BackgroundManager, EnvironmentManager)
4. **Report Issues** with detailed error logs

---

**Ready to Test!** 🎊

Bucket `backgrounds` sudah siap, kode sudah dioptimasi, dan sistem fallback sudah robust. Silakan test semua functionality dan laporkan hasil atau issues yang ditemukan!