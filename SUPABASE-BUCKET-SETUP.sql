-- Supabase Bucket Setup for Backgrounds
-- Run these commands in Supabase SQL Editor

-- 1. Create the backgrounds bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'backgrounds', 
  'backgrounds', 
  true, 
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
);

-- 2. Set up RLS policies for the backgrounds bucket

-- Policy: Users can upload backgrounds to their own folder
CREATE POLICY "Users can upload backgrounds" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'backgrounds' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Everyone can view all backgrounds (public read)
CREATE POLICY "Users can view all backgrounds" ON storage.objects
FOR SELECT USING (bucket_id = 'backgrounds');

-- Policy: Users can delete their own backgrounds
CREATE POLICY "Users can delete own backgrounds" ON storage.objects
FOR DELETE USING (
  bucket_id = 'backgrounds' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own backgrounds
CREATE POLICY "Users can update own backgrounds" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'backgrounds' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Verify bucket creation
SELECT * FROM storage.buckets WHERE name = 'backgrounds';

-- 4. Test bucket permissions (optional)
-- This should return the bucket info if everything is set up correctly