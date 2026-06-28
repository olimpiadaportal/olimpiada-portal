-- ============================================================================
-- Phase 2: Storage Buckets Hotfix
-- File: 19_storage_buckets_hotfix.sql
-- Purpose: Add missing avatars and certificates buckets, fix MIME type security
-- Created: February 15, 2026
-- ============================================================================
-- NOTE: These buckets have ALSO been added to the main consolidated file:
--   06_storage_buckets.sql
-- This hotfix file is for EXISTING databases that were set up before this fix.
-- For NEW database setups, you do NOT need to run this file.
-- ============================================================================

-- ============================================================================
-- SECTION 1: AVATARS BUCKET (User Profile Pictures)
-- ============================================================================

-- Create the avatars bucket (public read, 5MB limit, image types only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Policy: Public read access to avatars
DROP POLICY IF EXISTS "Public Access - Avatars" ON storage.objects;
CREATE POLICY "Public Access - Avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Policy: Users can upload their own avatar
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own avatar
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own avatar
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- SECTION 2: CERTIFICATES BUCKET (Teacher Certificates)
-- ============================================================================

-- Create the certificates bucket (public read, 5MB limit, image/pdf types)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Policy: Public read access to certificates
DROP POLICY IF EXISTS "Public Access - Certificates" ON storage.objects;
CREATE POLICY "Public Access - Certificates"
ON storage.objects FOR SELECT
USING ( bucket_id = 'certificates' );

-- Policy: Teachers can upload their own certificates
DROP POLICY IF EXISTS "Teachers can upload own certificates" ON storage.objects;
CREATE POLICY "Teachers can upload own certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'teacher')
);

-- Policy: Teachers can update their own certificates
DROP POLICY IF EXISTS "Teachers can update own certificates" ON storage.objects;
CREATE POLICY "Teachers can update own certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certificates' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'teacher')
)
WITH CHECK (
  bucket_id = 'certificates' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'teacher')
);

-- Policy: Teachers can delete their own certificates
DROP POLICY IF EXISTS "Teachers can delete own certificates" ON storage.objects;
CREATE POLICY "Teachers can delete own certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'certificates' AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'teacher')
);

-- ============================================================================
-- SECTION 3: SECURITY FIX - ADD MIME TYPE RESTRICTIONS TO EXISTING BUCKETS
-- ============================================================================
-- This fixes the security concern of having "any" MIME type allowed

-- Fix question-images bucket
UPDATE storage.buckets
SET 
  file_size_limit = COALESCE(file_size_limit, 52428800), -- 50MB if not set
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
WHERE id = 'question-images';

-- Fix exam-answers bucket (should already have restrictions, but ensure)
UPDATE storage.buckets
SET 
  file_size_limit = COALESCE(file_size_limit, 10485760), -- 10MB if not set
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'exam-answers';

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify the fix worked)
-- ============================================================================
-- SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;
-- Expected: 4 buckets (question-images, exam-answers, avatars, certificates)
-- All should have allowed_mime_types set (not NULL or empty)

-- ============================================================================
-- DONE
-- ============================================================================
