/**
 * FileMessageBubble
 * Phase 4 — Messaging Enhancements: File Sharing
 *
 * Renders a chat bubble for file messages:
 * - Images: inline preview with tap-to-fullscreen
 * - PDFs / documents: file icon with name, size, and download button
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File as EXFile, Directory, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { chatFileService } from '../../services/chatFileService';
import { spacing, borderRadius, typography } from '../../constants/theme';

interface FileMessageBubbleProps {
  /** Either a signed URL (https://...) or a storage path (conversationId/...) */
  fileUrl: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'document';
  fileSizeBytes?: number;
  isOwnMessage: boolean;
  /** Timestamp string for display inside the bubble */
  createdAt: string;
  /** Whether the message has been read */
  readAt?: string | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Returns true if the value is a storage path (not a signed HTTPS URL) */
const isStoragePath = (url: string) => !url.startsWith('https://') && !url.startsWith('http://');

const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const FileMessageBubble: React.FC<FileMessageBubbleProps> = ({
  fileUrl,
  fileName,
  fileType,
  fileSizeBytes,
  isOwnMessage,
  createdAt,
  readAt,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>(fileUrl);

  useEffect(() => {
    setResolvedUrl(fileUrl);
    setImageLoading(true);
    setImageError(false);
    if (isStoragePath(fileUrl)) {
      chatFileService.getSignedUrl(fileUrl).then((signed) => {
        if (signed) setResolvedUrl(signed);
      });
    }
  }, [fileUrl]);

  const [downloading, setDownloading] = useState(false);
  const [isAlreadyDownloaded, setIsAlreadyDownloaded] = useState(false);

  /**
   * Resolves the MIME type for the file.
   */
  const getMimeType = (): string => {
    if (fileType === 'pdf') return 'application/pdf';
    if (fileType === 'image') return 'image/*';
    return 'application/octet-stream';
  };

  /**
   * Strips duplicate extensions, e.g. "file.pdf.pdf" → "file.pdf".
   */
  const sanitizeFileName = (name: string): string =>
    name.replace(/(\.[a-zA-Z0-9]+)\1+$/i, '$1');

  // Check on mount (and whenever fileName changes) if the file is already saved
  useEffect(() => {
    const safeFileName = sanitizeFileName(fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const destFile = new EXFile(new Directory(Paths.document, 'Elmly'), safeFileName);
    setIsAlreadyDownloaded(destFile.exists);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  /**
   * Downloads the file to the device's Documents directory (persists across
   * app restarts, visible in the phone's file explorer — same as WhatsApp).
   * On subsequent taps the cached copy is opened immediately without
   * re-downloading.
   * Opens the file directly in the device's native app (PDF viewer, etc.)
   * without showing the Supabase URL anywhere.
   */
  const handleOpenFile = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const url = resolvedUrl;
      if (!url) return;

      // Persist files to Documents (survives app restart, shows in file explorer)
      const docsDir = new Directory(Paths.document, 'Elmly');
      if (!docsDir.exists) {
        docsDir.create();
      }

      // Build a clean filename with no duplicate extension
      const safeFileName = sanitizeFileName(
        fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      );

      // Point to a specific File so we control the name (avoids auto-naming
      // from headers which causes double extensions like .pdf.pdf)
      const destFile = new EXFile(docsDir, safeFileName);

      // Only download if not already on device
      if (!destFile.exists) {
        await EXFile.downloadFileAsync(url, destFile, { idempotent: true });
      }

      if (!destFile.exists) {
        Alert.alert(t('messaging.chat.downloadFailed'), t('messaging.chat.downloadFailedDesc'));
        return;
      }

      // Mark as saved so the icon updates
      setIsAlreadyDownloaded(true);

      const localUri = destFile.uri;
      const mimeType = getMimeType();

      if (Platform.OS === 'android') {
        // Android 7+: file:// URIs cannot cross app boundaries (FileUriExposedException).
        // getContentUriAsync (legacy sub-path) uses FileProvider to produce a
        // content:// URI, then ACTION_VIEW fires the "Open with" picker — NOT
        // the share sheet — showing only apps that can VIEW the file type.
        const contentUri = await getContentUriAsync(localUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: mimeType,
        });
      } else {
        // iOS: expo-sharing shows the native "Open in..." sheet correctly.
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(localUri, {
            mimeType,
            UTI: fileType === 'pdf' ? 'com.adobe.pdf' : 'public.data',
            dialogTitle: fileName,
          });
        }
      }
    } catch (err) {
      console.error('[FileMessageBubble] Open file error:', err);
      Alert.alert(t('messaging.chat.downloadFailed'), t('messaging.chat.downloadFailedDesc'));
    } finally {
      setDownloading(false);
    }
  };

  const bubbleBg = isOwnMessage ? colors.primary : colors.card;
  const textColor = isOwnMessage ? '#FFFFFF' : colors.text;
  const subtextColor = isOwnMessage ? 'rgba(255,255,255,0.7)' : colors.textSecondary;
  const timeColor = isOwnMessage ? 'rgba(255,255,255,0.7)' : colors.textSecondary;

  // Shared footer (time + read receipt) rendered inside every bubble variant
  const footer = (
    <View style={[styles.footer, isOwnMessage ? styles.footerRight : styles.footerLeft]}>
      <Text style={[styles.footerTime, { color: timeColor }]}>{formatTime(createdAt)}</Text>
      {isOwnMessage && (
        <Ionicons
          name={readAt ? 'checkmark-done' : 'checkmark'}
          size={13}
          color={readAt ? (isOwnMessage ? 'rgba(255,255,255,0.9)' : colors.primary) : timeColor}
          style={{ marginLeft: 2 }}
        />
      )}
    </View>
  );

  if (fileType === 'image') {
    return (
      <>
        <TouchableOpacity
          onPress={() => !imageError && setImageModalVisible(true)}
          activeOpacity={0.9}
          style={[styles.imageContainer, { backgroundColor: bubbleBg }]}
        >
          {/* Loading spinner */}
          {imageLoading && !imageError && (
            <View style={[styles.imagePlaceholder, { backgroundColor: bubbleBg }]}>
              <ActivityIndicator size="small" color={textColor} />
            </View>
          )}
          {/* Error fallback */}
          {imageError ? (
            <View style={[styles.imageErrorBox, { backgroundColor: bubbleBg }]}>
              <Ionicons name="image-outline" size={36} color={subtextColor} />
              <Text style={[styles.imageErrorText, { color: subtextColor }]}>
                {fileName}
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: resolvedUrl }}
              style={styles.imagePreview}
              resizeMode="cover"
              onLoadEnd={() => setImageLoading(false)}
              onError={() => { setImageLoading(false); setImageError(true); }}
            />
          )}
          {/* Expand icon hint (top-right) */}
          {!imageError && !imageLoading && (
            <View style={styles.imageExpandHint}>
              <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
            </View>
          )}
          {/* Footer overlaid at bottom-right */}
          <View style={styles.imageFooterOverlay}>
            <Text style={styles.imageFooterTime}>{formatTime(createdAt)}</Text>
            {isOwnMessage && (
              <Ionicons
                name={readAt ? 'checkmark-done' : 'checkmark'}
                size={13}
                color={readAt ? '#FFFFFF' : 'rgba(255,255,255,0.7)'}
                style={{ marginLeft: 2 }}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Fullscreen modal */}
        <Modal
          visible={imageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setImageModalVisible(false)}
            >
              <Ionicons name="close-circle" size={36} color="#FFFFFF" />
            </TouchableOpacity>
            <Image
              source={{ uri: resolvedUrl }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      </>
    );
  }

  // PDF / document bubble
  const icon = fileType === 'pdf' ? 'document-text' : 'document-attach';
  const iconBg = isOwnMessage ? 'rgba(255,255,255,0.2)' : colors.primary + '18';
  const iconColor = isOwnMessage ? '#FFFFFF' : colors.primary;

  return (
    <TouchableOpacity
      style={[styles.fileBubble, { backgroundColor: bubbleBg }]}
      onPress={handleOpenFile}
      activeOpacity={0.8}
      disabled={downloading}
    >
      {/* Top row: icon + filename + download indicator */}
      <View style={styles.fileRow}>
        <View style={[styles.fileIconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon as any} size={26} color={iconColor} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: textColor }]} numberOfLines={2}>
            {fileName}
          </Text>
          {fileSizeBytes != null && (
            <Text style={[styles.fileSize, { color: subtextColor }]}>
              {chatFileService.formatSize(fileSizeBytes)}
            </Text>
          )}
        </View>
        {downloading
          ? <ActivityIndicator size="small" color={subtextColor} />
          : <Ionicons
              name={isAlreadyDownloaded ? 'checkmark-circle-outline' : 'download-outline'}
              size={18}
              color={isAlreadyDownloaded ? (isOwnMessage ? 'rgba(255,255,255,0.9)' : colors.primary) : subtextColor}
            />}
      </View>
      {/* Footer: time + read receipt */}
      {footer}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  /* ── Image bubble ── */
  imageContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    width: 220,
  },
  imagePlaceholder: {
    position: 'absolute',
    width: 220,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreview: {
    width: 220,
    height: 160,
  },
  imageErrorBox: {
    width: 220,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  imageErrorText: {
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  imageExpandHint: {
    position: 'absolute',
    top: 6,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    padding: 3,
  },
  imageFooterOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  imageFooterTime: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  /* ── Fullscreen modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  /* ── PDF / document bubble ── */
  fileBubble: {
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    maxWidth: 260,
    minWidth: 180,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  fileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
  fileSize: {
    fontSize: typography.fontSizes.xs,
    marginTop: 2,
  },
  /* ── Shared footer ── */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  footerRight: {
    justifyContent: 'flex-end',
  },
  footerLeft: {
    justifyContent: 'flex-start',
  },
  footerTime: {
    fontSize: 10,
  },
});
