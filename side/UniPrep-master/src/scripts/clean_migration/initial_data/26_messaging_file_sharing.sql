-- ============================================================================
-- Phase 4: Messaging Enhancements — File Sharing Support
-- Adds file_url, file_name, file_type, file_size_bytes columns to messages
-- Creates chat-files storage bucket with RLS policies
-- ============================================================================

-- 1. Add file columns to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type TEXT CHECK (file_type IN ('image', 'pdf', 'document'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

-- Make content nullable so file-only messages are valid
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

-- 2. Storage bucket for chat files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files',
  'chat-files',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies
CREATE POLICY "Authenticated users can upload chat files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-files'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can view chat files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-files'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete own chat files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-files'
    AND owner = auth.uid()
  );

-- 4. Update consolidated base schema comment (informational)
-- messages table now has: file_url, file_name, file_type, file_size_bytes
-- content is now nullable (file-only messages allowed)

-- 5. Verification
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_url') AS file_url_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_name') AS file_name_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_type') AS file_type_exists,
  EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'chat-files') AS bucket_exists;
-- Expected: true, true, true, true
