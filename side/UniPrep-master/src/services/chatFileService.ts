/**
 * Chat File Service
 * Phase 4 — Messaging Enhancements: File Sharing
 *
 * Handles uploading files (images, PDFs) to the chat-files Supabase Storage bucket
 * and generating signed URLs for secure access.
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

export type ChatFileType = 'image' | 'pdf' | 'document';

export interface ChatFile {
  /** Signed URL (7-day expiry) for immediate display */
  url: string;
  /** Storage path — stored in DB so URLs can be refreshed */
  storagePath: string;
  name: string;
  type: ChatFileType;
  sizeBytes: number;
}

const BUCKET = 'chat-files';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Strict MIME → extension whitelist.
 * Only these exact MIME types are accepted — no wildcards on upload.
 */
const ALLOWED_MIME: Record<string, { ext: string; type: ChatFileType }> = {
  'image/jpeg':      { ext: 'jpg',  type: 'image' },
  'image/png':       { ext: 'png',  type: 'image' },
  'image/gif':       { ext: 'gif',  type: 'image' },
  'image/webp':      { ext: 'webp', type: 'image' },
  'application/pdf': { ext: 'pdf',  type: 'pdf'   },
};

class ChatFileService {
  /**
   * Sanitize a user-supplied file name:
   * - Strip path separators (prevent path traversal)
   * - Keep only safe characters (alphanumeric, dash, underscore, dot)
   * - Limit to 100 chars
   * - Fall back to a safe default if empty
   */
  private sanitizeFileName(raw: string): string {
    const base = raw.replace(/[/\\]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const trimmed = base.slice(0, 100);
    return trimmed || 'file';
  }

  /**
   * Upload a file to the chat-files bucket.
   *
   * Security measures:
   * 1. Strict MIME whitelist — only jpeg/png/gif/webp/pdf accepted
   * 2. Extension derived from MIME, not from user-supplied filename
   * 3. Filename sanitized (no path traversal, safe chars only)
   * 4. Storage path scoped to conversationId/senderId (RLS enforced server-side)
   * 5. Size checked client-side (server bucket limit is the authoritative guard)
   * 6. Bucket is private — signed URLs only, never public
   * 7. upsert: false — prevents overwriting existing files
   */
  async uploadFile(
    conversationId: string,
    senderId: string,
    uri: string,
    fileName: string,
    mimeType: string
  ): Promise<{ file: ChatFile | null; error: string | null }> {
    try {
      // 1. Validate MIME type against strict whitelist
      const allowed = ALLOWED_MIME[mimeType];
      if (!allowed) {
        return { file: null, error: 'Unsupported file type. Only JPEG, PNG, GIF, WebP images and PDFs are allowed.' };
      }

      // 2. Read file as base64 using FileSystem (works in React Native — no Blob API)
      let base64Data: string;
      try {
        base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      } catch {
        return { file: null, error: 'Failed to read the selected file.' };
      }

      // Decode base64 → Uint8Array → ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const fileBuffer = bytes.buffer;
      const fileSize = bytes.byteLength;

      // 3. Client-side size guard (bucket policy is the authoritative limit)
      if (fileSize > MAX_SIZE_BYTES) {
        return { file: null, error: 'File exceeds the 10 MB limit.' };
      }
      if (fileSize === 0) {
        return { file: null, error: 'Selected file is empty.' };
      }

      // 4. Build a safe storage path — extension from MIME, not user input
      const safeName = this.sanitizeFileName(fileName);
      const storagePath = `${conversationId}/${senderId}_${Date.now()}_${safeName}.${allowed.ext}`;

      // 5. Upload (private bucket, no upsert)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

      if (uploadError) {
        console.error('❌ [chatFileService] Upload error:', uploadError.message);
        return { file: null, error: uploadError.message };
      }

      // 6. Generate a short-lived signed URL (7 days)
      const { data: signedData, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL);

      if (signError || !signedData?.signedUrl) {
        console.error('❌ [chatFileService] Signed URL error:', signError?.message);
        return { file: null, error: 'Failed to generate file URL.' };
      }

      console.log('✅ [chatFileService] File uploaded:', storagePath);
      return {
        file: {
          url: signedData.signedUrl,
          storagePath,
          name: safeName,
          type: allowed.type,
          sizeBytes: fileSize,
        },
        error: null,
      };
    } catch (err: any) {
      console.error('❌ [chatFileService] Exception:', err);
      return { file: null, error: err?.message || 'Upload failed.' };
    }
  }

  /**
   * Refresh a signed URL for a stored file path.
   * Call this when rendering a message whose signed URL may have expired.
   */
  async getSignedUrl(storagePath: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  /**
   * Resolve a MIME type to our ChatFileType (for display logic only).
   */
  resolveFileType(mimeType: string): ChatFileType | null {
    return ALLOWED_MIME[mimeType]?.type ?? null;
  }

  /**
   * Format file size for display (e.g. "2.4 MB", "340 KB").
   */
  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }
}

export const chatFileService = new ChatFileService();
