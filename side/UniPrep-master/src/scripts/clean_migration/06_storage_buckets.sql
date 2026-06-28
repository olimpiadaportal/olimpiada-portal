-- ============================================================================
-- 06_storage_buckets.sql
-- Elmly Database - Supabase Storage Buckets
-- ============================================================================
-- Purpose: Create ALL storage buckets and their RLS policies
-- Depends on: 01_base_schema.sql
-- ============================================================================
-- Created: February 6, 2026
-- Source: Consolidated from Admin S5, Admin S10
-- ============================================================================

-- ============================================================================
-- SECTION 1: QUESTION IMAGES BUCKET (Admin S5)
-- ============================================================================

-- Create the question-images bucket (public read for mobile app)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public read access to question images
DROP POLICY IF EXISTS "Public Access - Question Images" ON storage.objects;
CREATE POLICY "Public Access - Question Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'question-images' );

-- Policy: Admins can upload images
DROP POLICY IF EXISTS "Authenticated Upload - Question Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload - Question Images" ON storage.objects;
CREATE POLICY "Admin Upload - Question Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

-- Policy: Admins can update images
DROP POLICY IF EXISTS "Authenticated Update - Question Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update - Question Images" ON storage.objects;
CREATE POLICY "Admin Update - Question Images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

-- Policy: Admins can delete images
DROP POLICY IF EXISTS "Authenticated Delete - Question Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete - Question Images" ON storage.objects;
CREATE POLICY "Admin Delete - Question Images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
);

-- ============================================================================
-- SECTION 2: EXAM ANSWERS BUCKET (Admin S10)
-- ============================================================================

-- Create the exam-answers bucket (private, 10MB limit, image types only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-answers',
  'exam-answers',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload images to their own exam attempts
DROP POLICY IF EXISTS "Users can upload exam answer images" ON storage.objects;
CREATE POLICY "Users can upload exam answer images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-answers' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM mock_exam_attempts WHERE user_id = auth.uid()
  )
);

-- Policy: Users can view their own exam answer images
DROP POLICY IF EXISTS "Users can view their own exam answer images" ON storage.objects;
CREATE POLICY "Users can view their own exam answer images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-answers' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM mock_exam_attempts WHERE user_id = auth.uid()
  )
);

-- Policy: Users can update their own exam answer images
DROP POLICY IF EXISTS "Users can update their own exam answer images" ON storage.objects;
CREATE POLICY "Users can update their own exam answer images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'exam-answers' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM mock_exam_attempts WHERE user_id = auth.uid()
  )
);

-- Policy: Users can delete their own exam answer images
DROP POLICY IF EXISTS "Users can delete their own exam answer images" ON storage.objects;
CREATE POLICY "Users can delete their own exam answer images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-answers' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM mock_exam_attempts WHERE user_id = auth.uid()
  )
);

-- Policy: Admins can view all exam answer images (for grading)
DROP POLICY IF EXISTS "Admins can view all exam answer images" ON storage.objects;
CREATE POLICY "Admins can view all exam answer images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-answers' AND
  EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Policy: Admins can delete any exam answer images (for cleanup)
DROP POLICY IF EXISTS "Admins can delete any exam answer images" ON storage.objects;
CREATE POLICY "Admins can delete any exam answer images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-answers' AND
  EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true
  )
);

-- ============================================================================
-- SECTION 3: AVATARS BUCKET (User Profile Pictures)
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
ON CONFLICT (id) DO NOTHING;

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
-- SECTION 4: CERTIFICATES BUCKET (Teacher Certificates)
-- ============================================================================

-- Create the certificates bucket (private, 5MB limit, image/pdf types)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy: Only the owning teacher and active admins can read certificates.
DROP POLICY IF EXISTS "Public Access - Certificates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated certificate access" ON storage.objects;
CREATE POLICY "Authenticated certificate access"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'certificates' AND (
    (
      (storage.foldername(name))[1] = auth.uid()::text AND
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'teacher')
    )
    OR EXISTS (
      SELECT 1 FROM admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
);

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
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
);

-- ============================================================================
-- SECTION 5: UPDATE QUESTION-IMAGES BUCKET WITH MIME TYPE RESTRICTIONS
-- ============================================================================
-- Security fix: Add MIME type restrictions to question-images bucket

UPDATE storage.buckets
SET 
  file_size_limit = 52428800, -- 50MB limit for question images
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'question-images';

-- ============================================================================
-- DONE - All storage buckets and policies created
-- ============================================================================
-- Buckets: 
--   - question-images (public read, admin write, 50MB, images only — no SVG)
--   - exam-answers (private, 10MB, images only, user-scoped + admin access)
--   - avatars (public, 5MB, images only, user-scoped)
--   - certificates (private, 5MB, images+pdf, teacher-scoped)
-- ============================================================================
