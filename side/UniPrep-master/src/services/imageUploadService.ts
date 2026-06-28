// Image Upload Service
// Stage 9: Profile & Settings
// Handles image uploads to Supabase Storage

import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
// Use legacy API for readAsStringAsync (deprecated in SDK 54+)
import * as FileSystem from 'expo-file-system/legacy';

const AVATAR_BUCKET = 'avatars';
const EXAM_ANSWERS_BUCKET = 'exam-answers';
const MAX_IMAGE_SIZE = 2048; // Max width/height in pixels
const JPEG_QUALITY = 0.8; // 80% quality
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB hard limit
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

class ImageUploadService {
  /**
   * Request camera permissions
   */
  async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  /**
   * Request media library permissions
   */
  async requestMediaLibraryPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting media library permissions:', error);
      return false;
    }
  }

  /**
   * Pick image from camera
   */
  async pickImageFromCamera(): Promise<string | null> {
    try {
      const hasPermission = await this.requestCameraPermissions();
      if (!hasPermission) {
        console.log('⚠️ Camera permission denied');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0].uri;
    } catch (error) {
      console.error('Error picking image from camera:', error);
      return null;
    }
  }

  /**
   * Pick image from gallery
   */
  async pickImageFromGallery(): Promise<string | null> {
    try {
      const hasPermission = await this.requestMediaLibraryPermissions();
      if (!hasPermission) {
        console.log('⚠️ Media library permission denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0].uri;
    } catch (error) {
      console.error('Error picking image from gallery:', error);
      return null;
    }
  }

  /**
   * Compress and resize image
   */
  async compressImage(uri: string): Promise<string> {
    try {
      console.log('🖼️ Compressing image...');

      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_IMAGE_SIZE } }],
        {
          compress: JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log('✅ Image compressed successfully');
      return manipResult.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      return uri; // Return original if compression fails
    }
  }

  /**
   * Upload image to Supabase Storage
   */
  async uploadImage(
    uri: string,
    userId: string,
    bucketName: string = AVATAR_BUCKET
  ): Promise<string | null> {
    try {
      console.log('📤 Uploading image to Supabase Storage...');
      console.log('🪣 Bucket:', bucketName);
      console.log('👤 User ID:', userId);

      // Compress image first
      const compressedUri = await this.compressImage(uri);

      // Validate file size after compression
      try {
        const fileInfo = await FileSystem.getInfoAsync(compressedUri);
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > MAX_FILE_SIZE_BYTES) {
          console.error('❌ File too large:', Math.round(fileInfo.size / 1024 / 1024), 'MB');
          return null;
        }
      } catch (sizeCheckError) {
        // Non-fatal — proceed with upload, server will reject if too large
        console.warn('⚠️ Could not check file size:', sizeCheckError);
      }

      // Generate unique filename with user folder
      const fileExt = 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`; // Upload to user's folder: avatars/userId/timestamp.jpg
      
      console.log('📁 Upload path:', filePath);

      // Create FormData for React Native
      const formData = new FormData();
      formData.append('file', {
        uri: compressedUri,
        type: 'image/jpeg',
        name: fileName,
      } as unknown as Blob);

      // Upload to Supabase Storage using FormData
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, formData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('❌ Upload error:', error);
        throw error;
      }

      console.log('✅ Upload successful:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      console.log('✅ Image uploaded successfully');
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }

  /**
   * Upload document (PDF or image) to Supabase Storage without compression
   * Used for certificates and other documents that shouldn't be modified
   */
  async uploadDocument(
    uri: string,
    userId: string,
    bucketName: string,
    mimeType: string = 'application/pdf'
  ): Promise<string | null> {
    try {
      console.log('📤 Uploading document to Supabase Storage...');
      console.log('🪣 Bucket:', bucketName);
      console.log('👤 User ID:', userId);
      console.log('📄 MIME type:', mimeType);

      // Determine file extension from MIME type
      let fileExt = 'pdf';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileExt = 'jpg';
      else if (mimeType.includes('png')) fileExt = 'png';
      else if (mimeType.includes('webp')) fileExt = 'webp';
      else if (mimeType.includes('pdf')) fileExt = 'pdf';

      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;
      
      console.log('📁 Upload path:', filePath);

      // Read file as base64 using FileSystem (works in React Native)
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Decode base64 to ArrayBuffer for upload
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, bytes.buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        console.error('❌ Upload error:', error);
        throw error;
      }

      console.log('✅ Document upload successful:', data);

      console.log('✅ Document uploaded successfully');
      // Private documents are persisted by canonical object path. Consumers
      // resolve a short-lived signed URL only when the file is opened.
      return filePath;
    } catch (error) {
      console.error('Error uploading document:', error);
      return null;
    }
  }

  /**
   * Delete image from Supabase Storage
   */
  async deleteImage(imageUrl: string, bucketName: string = AVATAR_BUCKET): Promise<boolean> {
    try {
      console.log('🗑️ Deleting image from Supabase Storage...');

      const filePath = this.getStorageObjectPath(imageUrl, bucketName);
      if (!filePath) {
        console.error('Invalid image URL format');
        return false;
      }

      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);

      if (error) throw error;

      console.log('✅ Image deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  getStorageObjectPath(value: string, bucketName: string): string | null {
    if (!value) return null;

    if (!/^https?:\/\//i.test(value)) {
      return decodeURIComponent(
        value.startsWith(`${bucketName}/`)
          ? value.slice(bucketName.length + 1)
          : value.replace(/^\/+/, '')
      );
    }

    try {
      const url = new URL(value);
      const markers = [
        `/storage/v1/object/public/${bucketName}/`,
        `/storage/v1/object/sign/${bucketName}/`,
        `/storage/v1/object/authenticated/${bucketName}/`,
        `/${bucketName}/`,
      ];
      for (const marker of markers) {
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex >= 0) {
          return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async createSignedDocumentUrl(
    storedValue: string,
    bucketName: string,
    expiresInSeconds = 300
  ): Promise<string | null> {
    const objectPath = this.getStorageObjectPath(storedValue, bucketName);
    if (!objectPath) return null;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(objectPath, expiresInSeconds);
    if (error) {
      console.error('Create signed document URL error:', error);
      return null;
    }
    return data.signedUrl;
  }

  /**
   * Upload profile picture (convenience method)
   */
  async uploadProfilePicture(uri: string, userId: string): Promise<string | null> {
    return this.uploadImage(uri, userId, AVATAR_BUCKET);
  }

  /**
   * Delete profile picture (convenience method)
   */
  async deleteProfilePicture(imageUrl: string): Promise<boolean> {
    return this.deleteImage(imageUrl, AVATAR_BUCKET);
  }

  /**
   * Pick image for exam answer (no cropping, allows full document photos)
   */
  async pickExamAnswerImage(source: 'camera' | 'gallery'): Promise<string | null> {
    try {
      if (source === 'camera') {
        const hasPermission = await this.requestCameraPermissions();
        if (!hasPermission) {
          console.log('⚠️ Camera permission denied');
          return null;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: false, // No cropping for exam answers
          quality: 0.9,
        });

        if (result.canceled) return null;
        return result.assets[0].uri;
      } else {
        const hasPermission = await this.requestMediaLibraryPermissions();
        if (!hasPermission) {
          console.log('⚠️ Media library permission denied');
          return null;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: false, // No cropping for exam answers
          quality: 0.9,
        });

        if (result.canceled) return null;
        return result.assets[0].uri;
      }
    } catch (error) {
      console.error('Error picking exam answer image:', error);
      return null;
    }
  }

  /**
   * Upload exam answer image
   * Path format: exam-answers/{attemptId}/{questionId}/{timestamp}.jpg
   */
  async uploadExamAnswerImage(
    uri: string,
    attemptId: string,
    questionId: string
  ): Promise<string | null> {
    try {
      console.log('📤 Uploading exam answer image...');

      // Compress image first
      const compressedUri = await this.compressImage(uri);

      // Generate unique filename
      const fileName = `${Date.now()}.jpg`;
      const filePath = `${attemptId}/${questionId}/${fileName}`;

      console.log('📁 Upload path:', filePath);

      // Create FormData for React Native
      const formData = new FormData();
      formData.append('file', {
        uri: compressedUri,
        type: 'image/jpeg',
        name: fileName,
      } as unknown as Blob);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(EXAM_ANSWERS_BUCKET)
        .upload(filePath, formData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('❌ Upload error:', error);
        throw error;
      }

      console.log('✅ Upload successful:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(EXAM_ANSWERS_BUCKET)
        .getPublicUrl(filePath);

      console.log('✅ Exam answer image uploaded successfully');
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading exam answer image:', error);
      return null;
    }
  }

  /**
   * Delete exam answer image
   */
  async deleteExamAnswerImage(imageUrl: string): Promise<boolean> {
    return this.deleteImage(imageUrl, EXAM_ANSWERS_BUCKET);
  }

  /**
   * Get image size in bytes
   */
  async getImageSize(uri: string): Promise<number> {
    try {
      // For React Native, we can't use blob, so we estimate from file info
      // This is a simplified version - actual size may vary
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      return arrayBuffer.byteLength;
    } catch (error) {
      console.error('Error getting image size:', error);
      return 0;
    }
  }

  /**
   * Validate image size (max 5MB)
   */
  async validateImageSize(uri: string, maxSizeMB: number = 5): Promise<boolean> {
    try {
      const sizeBytes = await this.getImageSize(uri);
      const sizeMB = sizeBytes / (1024 * 1024);
      return sizeMB <= maxSizeMB;
    } catch (error) {
      console.error('Error validating image size:', error);
      return false;
    }
  }
}

export const imageUploadService = new ImageUploadService();
