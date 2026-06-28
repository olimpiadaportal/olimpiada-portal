/**
 * FilePickerButton
 * Phase 4 — Messaging Enhancements: File Sharing
 *
 * Attachment button that opens an action sheet to pick:
 * - Image from gallery (expo-image-picker)
 * - PDF / document (expo-document-picker)
 */

import React, { useState } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../components/AlertProvider';
import { useTranslation } from 'react-i18next';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface FilePickerButtonProps {
  onFilePicked: (file: PickedFile) => void;
  disabled?: boolean;
}

export const FilePickerButton: React.FC<FilePickerButtonProps> = ({
  onFilePicked,
  disabled = false,
}) => {
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({
        title: t('messaging.chat.permissionRequired'),
        message: t('messaging.chat.permissionMessage'),
        type: 'warning',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const name = asset.fileName || `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      onFilePicked({ uri: asset.uri, name, mimeType });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      onFilePicked({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/pdf',
      });
    }
  };

  const handlePress = () => {
    if (disabled || picking) return;

    showAlert({
      title: t('messaging.chat.attachFile'),
      message: t('messaging.chat.chooseFileType'),
      type: 'info',
      buttons: [
        {
          text: t('messaging.chat.photoFromLibrary'),
          onPress: pickImage,
        },
        {
          text: t('messaging.chat.pdfDocument'),
          onPress: pickDocument,
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ],
    });
  };

  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled]}
      onPress={handlePress}
      disabled={disabled || picking}
      activeOpacity={0.7}
    >
      <Ionicons
        name="attach"
        size={24}
        color={disabled ? colors.textSecondary : colors.primary}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  disabled: {
    opacity: 0.4,
  },
});
