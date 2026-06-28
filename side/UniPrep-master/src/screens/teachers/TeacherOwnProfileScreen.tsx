// Teacher's Own Profile Screen
// Allows teachers to view and edit their profile including pricing, experience, and available groups

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as EXFile, Directory, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { teacherService } from '../../services/teacherService';
import { imageUploadService } from '../../services/imageUploadService';
import { profileService } from '../../services/profileService';
import { Teacher, TeacherProfileUpdate, ExamGroup } from '../../types/teacher';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useAlert } from '../../components/AlertProvider';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { referenceDataService, City } from '../../services/referenceDataService';
import { SearchablePickerModal } from '../../components/common/SearchablePickerModal';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { FadeIn } from '../../components/animated';
import { AppPressable, ChoiceChip, MetricCard, SectionHeader } from '../../components/ui';

// Subject type from database (subjects table only has name_en and name_az)
interface SubjectOption {
  id: string;
  name_en: string;
  name_az: string;
}

const GROUPS: ExamGroup[] = ['I', 'II', 'III', 'IV', 'V'];

export const TeacherOwnProfileScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError, showAlert } = useAlert();
  const navigation = useNavigation<any>();
  const { enabled: isAvailabilityEnabled } = useFeatureFlag('teacher_availability');
  const currentLang = i18n.language;
  
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [downloadingCertIndex, setDownloadingCertIndex] = useState<number | null>(null);
  
  // Editable fields
  const [bio, setBio] = useState('');
  const [education, setEducation] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [city, setCity] = useState('');
  const [selectedSpecializations, setSelectedSpecializations] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<ExamGroup[]>([]);
  
  // Reference data
  const [cities, setCities] = useState<City[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const hasLoadedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const avatarUploadInFlightRef = useRef(false);
  const certificateUploadInFlightRef = useRef(false);

  // Helper to get locale-aware subject name
  // Note: subjects table only has name_en and name_az, so Russian falls back to name_az
  const getSubjectName = (subject: SubjectOption): string => {
    if (currentLang === 'az' || currentLang === 'ru') return subject.name_az;
    return subject.name_en;
  };

  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const syncFormFromTeacher = useCallback((teacherData: Teacher) => {
    setBio(teacherData.bio || '');
    setEducation(teacherData.education || '');
    setExperienceYears(teacherData.experience_years?.toString() || '0');
    setHourlyRate(teacherData.hourly_rate?.toString() || '');
    setMonthlyRate(teacherData.monthly_rate?.toString() || '');
    setCity(teacherData.city || '');
    setSelectedSpecializations(teacherData.specializations || []);
    setSelectedGroups(teacherData.available_groups || []);
  }, []);

  const loadTeacherProfile = useCallback(async (options: { showLoader?: boolean; syncForm?: boolean } = {}) => {
    if (!user) return;

    try {
      const shouldShowLoader = options.showLoader ?? !hasLoadedRef.current;
      if (shouldShowLoader) {
        setLoading(true);
      }

      const teacherData = await teacherService.getTeacherByUserId(user.id);
      
      if (teacherData) {
        setTeacher(teacherData);
        if (options.syncForm ?? !isEditing) {
          syncFormFromTeacher(teacherData);
        }
        hasLoadedRef.current = true;
      }
    } catch (error) {
      console.error('Error loading teacher profile:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [isEditing, showError, syncFormFromTeacher, t, user]);

  useEffect(() => {
    loadTeacherProfile({ showLoader: true, syncForm: true });
    loadCities();
    loadSubjects();
  }, [loadTeacherProfile, user]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasLoadedRef.current && !isEditing) {
        loadTeacherProfile({ showLoader: false, syncForm: true });
      }
    });
    return unsubscribe;
  }, [isEditing, loadTeacherProfile, navigation]);

  const loadSubjects = async () => {
    try {
      const subjectsData = await teacherService.getSubjectsForSpecialization();
      setSubjects(subjectsData);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const getCityDisplayName = (englishName: string): string => {
    const cityData = cities.find(c => c.name === englishName);
    return cityData?.name_az || englishName;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeacherProfile({ showLoader: false, syncForm: !isEditing });
    setRefreshing(false);
  };

  const toggleSpecialization = (subject: string) => {
    if (selectedSpecializations.includes(subject)) {
      setSelectedSpecializations(selectedSpecializations.filter(s => s !== subject));
    } else {
      setSelectedSpecializations([...selectedSpecializations, subject]);
    }
  };

  const toggleGroup = (group: ExamGroup) => {
    if (selectedGroups.includes(group)) {
      setSelectedGroups(selectedGroups.filter(g => g !== group));
    } else {
      setSelectedGroups([...selectedGroups, group]);
    }
  };

  const handlePickAvatar = () => {
    showAlert({
      title: t('profile.changePhoto', 'Change Photo'),
      message: '',
      type: 'info',
      buttons: [
        {
          text: t('profile.takePhoto', 'Take Photo'),
          onPress: handleTakePhoto,
        },
        {
          text: t('profile.chooseFromGallery', 'Choose from Gallery'),
          onPress: handleChooseFromGallery,
        },
      ],
    });
  };

  const handleTakePhoto = async () => {
    if (!user) return;
    try {
      const uri = await imageUploadService.pickImageFromCamera();
      if (uri) {
        await uploadAvatar(uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  };

  const handleChooseFromGallery = async () => {
    if (!user) return;
    try {
      const uri = await imageUploadService.pickImageFromGallery();
      if (uri) {
        await uploadAvatar(uri);
      }
    } catch (error) {
      console.error('Error choosing from gallery:', error);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user) return;
    if (avatarUploadInFlightRef.current) return;
    try {
      avatarUploadInFlightRef.current = true;
      setUploadingAvatar(true);
      const uploadedUrl = await imageUploadService.uploadProfilePicture(uri, user.id);
      if (uploadedUrl) {
        await profileService.updateProfilePicture(user.id, uploadedUrl);
        await loadTeacherProfile({ showLoader: false, syncForm: false });
        showSuccess(t('common.success'), t('profile.photoUpdated', 'Profile photo updated'));
      } else {
        showError(t('common.error'), t('errors.generic'));
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      avatarUploadInFlightRef.current = false;
      setUploadingAvatar(false);
    }
  };

  const handleUploadCertificate = async () => {
    if (!user || !teacher) return;
    if (certificateUploadInFlightRef.current) return;

    if (teacher.is_verified) {
      showAlert({
        title: t('teacherProfile.certificates.lockedTitle', 'Certificate Changes Locked'),
        message: t('teacherProfile.certificates.lockedWarning', 'Your certificates are locked after verification. Please contact support if you need to update your documents.'),
        type: 'warning',
        buttons: [{ text: t('common.ok', 'OK') }],
      });
      return;
    }
    
    try {
      certificateUploadInFlightRef.current = true;
      // Pick PDF document only (for security and consistency)
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      
      // Validate file type - PDFs only
      if (file.mimeType !== 'application/pdf') {
        showError(t('common.error'), t('teacherProfile.certificates.invalidType', 'Please upload a PDF file'));
        return;
      }

      // Validate file size (max 5MB)
      if (file.size && file.size > 5 * 1024 * 1024) {
        showError(t('common.error'), t('teacherProfile.certificates.fileTooLarge', 'File size must be less than 5MB'));
        return;
      }

      setUploadingCertificate(true);

      // Upload to Supabase storage (certificates bucket) using document upload (no compression)
      const uploadedUrl = await imageUploadService.uploadDocument(
        file.uri, 
        user.id, 
        'certificates',
        file.mimeType
      );
      
      if (uploadedUrl) {
        // Add to teacher's certificates array
        const currentCerts = teacher.certificates || [];
        const updatedCerts = [...currentCerts, uploadedUrl];
        
        const success = await teacherService.updateTeacherProfileByUserId(user.id, {
          certificates: updatedCerts,
          verification_status: teacher.is_verified ? 'verified' : 'pending',
          verification_rejection_reason: null,
        });

        if (success) {
          await loadTeacherProfile({ showLoader: false, syncForm: false });
          showSuccess(t('common.success'), t('teacherProfile.certificates.uploadSuccess', 'Certificate uploaded successfully'));
        } else {
          showError(t('common.error'), t('errors.generic'));
        }
      } else {
        showError(t('common.error'), t('errors.generic'));
      }
    } catch (error) {
      console.error('Error uploading certificate:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      certificateUploadInFlightRef.current = false;
      setUploadingCertificate(false);
    }
  };

  const handleDeleteCertificate = async (certUrl: string, index: number) => {
    if (!user || !teacher) return;

    // Industry best practice: Prevent verified teachers from deleting certificates
    // This protects the integrity of the verification system
    if (teacher.is_verified) {
      showAlert({
        title: t('teacherProfile.certificates.lockedTitle', 'Certificate Changes Locked'),
        message: t('teacherProfile.certificates.lockedWarning', 'Your certificates are locked after verification. Please contact support if you need to update your documents.'),
        type: 'warning',
        buttons: [{ text: t('common.ok', 'OK') }],
      });
      return;
    }

    showAlert({
      title: t('teacherProfile.certificates.deleteTitle', 'Delete Certificate'),
      message: t('teacherProfile.certificates.deleteConfirm', 'Are you sure you want to delete this certificate?'),
      type: 'warning',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from storage
              await imageUploadService.deleteImage(certUrl, 'certificates');
              
              // Remove from teacher's certificates array
              const updatedCerts = teacher.certificates?.filter((_, i) => i !== index) || [];
              
              const success = await teacherService.updateTeacherProfileByUserId(user.id, {
                certificates: updatedCerts,
                verification_status: updatedCerts.length > 0 ? 'pending' : 'not_submitted',
                verification_rejection_reason: null,
              } as any);

              if (success) {
                await loadTeacherProfile({ showLoader: false, syncForm: false });
                showSuccess(t('common.success'), t('teacherProfile.certificates.deleteSuccess', 'Certificate deleted'));
              }
            } catch (error) {
              console.error('Error deleting certificate:', error);
              showError(t('common.error'), t('errors.generic'));
            }
          },
        },
      ],
    });
  };

  /**
   * Opens a certificate PDF locally on the device without exposing the Supabase URL.
   * Downloads the file to local storage and opens it with the native PDF viewer.
   */
  const handleOpenCertificate = async (certUrl: string, index: number) => {
    if (downloadingCertIndex !== null) return;
    setDownloadingCertIndex(index);
    
    try {
      const signedUrl = await imageUploadService.createSignedDocumentUrl(
        certUrl,
        'certificates',
        300
      );
      if (!signedUrl) {
        showError(
          t('common.error'),
          t('teacherProfile.certificates.downloadFailed', 'Failed to download certificate')
        );
        return;
      }

      // Create Elmly directory in Documents if it doesn't exist
      const docsDir = new Directory(Paths.document, 'Elmly');
      if (!docsDir.exists) {
        docsDir.create();
      }

      // Generate a clean filename
      const safeFileName = `certificate_${index + 1}_${Date.now()}.pdf`;
      const destFile = new EXFile(docsDir, safeFileName);

      // Download if not already cached
      if (!destFile.exists) {
        await EXFile.downloadFileAsync(signedUrl, destFile, { idempotent: true });
      }

      if (!destFile.exists) {
        showError(t('common.error'), t('teacherProfile.certificates.downloadFailed', 'Failed to download certificate'));
        return;
      }

      const localUri = destFile.uri;
      const mimeType = 'application/pdf';

      if (Platform.OS === 'android') {
        // Android: Use content URI and intent launcher to open with native PDF viewer
        const contentUri = await getContentUriAsync(localUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: mimeType,
        });
      } else {
        // iOS: Use sharing to open in native viewer
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(localUri, {
            mimeType,
            UTI: 'com.adobe.pdf',
            dialogTitle: t('teacherProfile.certificates.certificate', 'Certificate') + ` ${index + 1}`,
          });
        }
      }
    } catch (error) {
      console.error('Error opening certificate:', error);
      showError(t('common.error'), t('teacherProfile.certificates.openFailed', 'Failed to open certificate'));
    } finally {
      setDownloadingCertIndex(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (saveInFlightRef.current) return;

    // Validation
    if (selectedSpecializations.length === 0) {
      showError(t('common.error'), t('teacherProfile.errors.selectSpecialization'));
      return;
    }

    if (selectedGroups.length === 0) {
      showError(t('common.error'), t('teacherProfile.errors.selectGroup'));
      return;
    }

    if (!experienceYears || parseInt(experienceYears) < 0) {
      showError(t('common.error'), t('teacherProfile.errors.invalidExperience'));
      return;
    }

    try {
      saveInFlightRef.current = true;
      setSaving(true);
      
      const updates: TeacherProfileUpdate = {
        bio: bio.trim() || undefined,
        education: education.trim() || undefined,
        city: city.trim() || undefined,
        specializations: selectedSpecializations,
        experience_years: parseInt(experienceYears),
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        monthly_rate: monthlyRate ? parseFloat(monthlyRate) : undefined,
        available_groups: selectedGroups,
      };

      const success = await teacherService.updateTeacherProfileByUserId(user.id, updates);

      if (success) {
        showSuccess(t('common.success'), t('teacherProfile.updateSuccess'));
        setIsEditing(false);
        await loadTeacherProfile({ showLoader: false, syncForm: true });
      } else {
        showError(t('common.error'), t('teacherProfile.updateFailed'));
      }
    } catch (error) {
      console.error('Update profile error:', error);
      showError(t('common.error'), t('teacherProfile.updateFailed'));
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    if (teacher) {
      syncFormFromTeacher(teacher);
    }
    setIsEditing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.skeletonContent}>
          <LoadingSkeleton width="100%" height={64} borderRadius={borderRadius.lg} />
          <LoadingSkeleton width="100%" height={238} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
          <LoadingSkeleton width="100%" height={132} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
          <LoadingSkeleton width="100%" height={190} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
          <LoadingSkeleton width="100%" height={220} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
        </View>
      </SafeAreaView>
    );
  }

  if (!teacher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.errorText}>{t('teacherProfile.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const teacherCertificates = Array.isArray(teacher.certificates) ? teacher.certificates : [];
  const verificationStatus = teacher.verification_status || (
    teacher.is_verified ? 'verified' : teacherCertificates.length > 0 ? 'pending' : 'not_submitted'
  );
  const needsVerificationAttention = !teacher.is_verified || verificationStatus !== 'verified';
  const hasPendingCertificates = teacherCertificates.length > 0 && verificationStatus === 'pending';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <AppPressable
          accessibilityLabel={t('common.back')}
          compact
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </AppPressable>
        <Text style={styles.headerTitle}>{t('teacherProfile.title')}</Text>
        {isEditing ? (
          <View style={styles.headerActions}>
            <AppPressable compact accessibilityLabel={t('common.cancel')} onPress={handleCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </AppPressable>
            <AppPressable compact accessibilityLabel={t('common.save')} onPress={handleSave} disabled={saving} style={styles.saveButton}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>{t('common.save')}</Text>
              )}
            </AppPressable>
          </View>
        ) : (
          <AppPressable compact accessibilityLabel={t('common.edit')} onPress={() => setIsEditing(true)} style={styles.editButton}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </AppPressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Verification status banner - show until admin approval makes the teacher marketplace-visible. */}
        {needsVerificationAttention && (
          <View style={styles.verificationBanner}>
            <View style={styles.verificationBannerIcon}>
              <Ionicons
                name={hasPendingCertificates ? 'time-outline' : 'shield-checkmark'}
                size={24}
                color="#F59E0B"
              />
            </View>
            <View style={styles.verificationBannerContent}>
              <Text style={styles.verificationBannerTitle}>
                {hasPendingCertificates
                  ? t('teacherProfile.verification.pendingTitle', 'Verification Pending')
                  : t('teacherProfile.verification.title', 'Complete Your Verification')}
              </Text>
              <Text style={styles.verificationBannerText}>
                {hasPendingCertificates
                  ? t('teacherProfile.verification.pendingDescription', 'Your certificate is waiting for admin approval. You will appear in student searches after verification.')
                  : t('teacherProfile.verification.description', 'Upload your certificates to get verified and appear in student searches.')}
              </Text>
            </View>
            <AppPressable
              accessibilityLabel={t('teacherProfile.certificates.upload')}
              style={styles.verificationBannerButton}
              onPress={handleUploadCertificate}
              disabled={uploadingCertificate}
            >
              {uploadingCertificate ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="cloud-upload" size={20} color="#fff" />
              )}
            </AppPressable>
          </View>
        )}

        {/* Profile Header */}
        <FadeIn duration={280}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {teacher.avatar_url ? (
              <Image source={{ uri: teacher.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={48} color={colors.textSecondary} />
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarUploadOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            <AppPressable
              accessibilityLabel={t('editProfile.changePhoto')}
              style={styles.cameraButton}
              onPress={handlePickAvatar}
            >
              <Ionicons name="camera" size={20} color="#fff" />
            </AppPressable>
          </View>
          <Text style={styles.teacherName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
            {teacher.full_name}
          </Text>
          <Text style={styles.teacherEmail} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {teacher.email}
          </Text>
          
          {/* Rating & Stats */}
          <View style={styles.profileMetricsGrid}>
            <MetricCard
              label={t('teacherProfile.currentStudents')}
              value={teacher.current_students ?? teacher.total_students ?? 0}
              helper={t('teacherProfile.totalStudentsHelper', { count: teacher.total_students || 0 })}
              icon="people-outline"
              accentColor={colors.success}
              style={styles.profileMetricCard}
            />
            <Text style={styles.profileMetricSummary} numberOfLines={2}>
              {teacher.rating?.toFixed(1) || '0.0'} {t('teacherProfile.rating').toLowerCase()} -{' '}
              {teacher.total_reviews || 0} {t('teacherProfile.reviews').toLowerCase()}
            </Text>
          </View>
        </View>
        </FadeIn>

        {/* Bio Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.bio')}
            icon="chatbox-ellipses-outline"
            style={styles.sectionHeading}
          />
          {isEditing ? (
            <>
              <TextInput
                style={styles.bioInput}
                placeholder={t('teacherProfile.bioPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={styles.charCount}>{bio.length}/500</Text>
            </>
          ) : (
            <Text style={styles.bioText}>{bio || t('teacherProfile.noBio')}</Text>
          )}
        </View>

        {/* City Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.city')}
            icon="location-outline"
            style={styles.sectionHeading}
          />
          {isEditing ? (
            <AppPressable
              accessibilityLabel={t('teacherProfile.city')}
              style={styles.pickerButton}
              onPress={() => setShowCityPicker(true)}
            >
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <Text style={[styles.pickerText, { color: city ? colors.text : colors.textSecondary }]}>
                {city ? getCityDisplayName(city) : t('teacherProfile.selectCity')}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </AppPressable>
          ) : (
            <Text style={styles.infoText}>{city ? getCityDisplayName(city) : t('teacherProfile.noCity')}</Text>
          )}
        </View>

        {/* Education Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.education')}
            icon="school-outline"
            style={styles.sectionHeading}
          />
          {isEditing ? (
            <TextInput
              style={styles.input}
              placeholder={t('teacherProfile.educationPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={education}
              onChangeText={setEducation}
            />
          ) : (
            <Text style={styles.infoText}>{education || t('teacherProfile.noEducation')}</Text>
          )}
        </View>

        {/* Experience Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.experience')}
            icon="ribbon-outline"
            style={styles.sectionHeading}
          />
          {isEditing ? (
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={experienceYears}
              onChangeText={setExperienceYears}
              keyboardType="numeric"
            />
          ) : (
            <Text style={styles.infoText}>
              {experienceYears} {t('teacherProfile.years')}
            </Text>
          )}
        </View>

        {/* Pricing Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.pricing')}
            icon="card-outline"
            style={styles.sectionHeading}
          />
          
          {isEditing ? (
            <>
              <Text style={styles.inputLabel}>{t('teacherProfile.hourlyRate')} (AZN)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>
                {t('teacherProfile.monthlyRate')} (AZN) - {t('common.optional')}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                value={monthlyRate}
                onChangeText={setMonthlyRate}
                keyboardType="decimal-pad"
              />
            </>
          ) : (
            <View style={styles.pricingDisplay}>
              <View style={styles.priceItem}>
                <Ionicons name="time-outline" size={20} color={colors.primary} />
                <Text style={styles.priceLabel}>{t('teacherProfile.hourlyRate')}:</Text>
                <Text style={styles.priceValue}>
                  {hourlyRate ? `${hourlyRate} AZN` : t('teacherProfile.notSet')}
                </Text>
              </View>
              <View style={styles.priceItem}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <Text style={styles.priceLabel}>{t('teacherProfile.monthlyRate')}:</Text>
                <Text style={styles.priceValue}>
                  {monthlyRate ? `${monthlyRate} AZN` : t('teacherProfile.notSet')}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Availability Section - Link to Availability Management */}
        {isAvailabilityEnabled && (
        <AppPressable
          accessibilityLabel={t('availability.manage')}
          style={styles.section}
          onPress={() => navigation.navigate('AvailabilityManagement')}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('availability.title', 'Availability')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.availabilityPreview}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            <View style={styles.availabilityPreviewContent}>
              <Text style={styles.availabilityPreviewTitle}>
                {t('availability.manageSchedule', 'Manage Your Schedule')}
              </Text>
              <Text style={styles.availabilityPreviewDescription}>
                {t('availability.setWorkingHours', 'Set your working hours and time off')}
              </Text>
            </View>
          </View>
        </AppPressable>
        )}

        {/* Specializations Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.specializations')}
            icon="library-outline"
            style={styles.sectionHeading}
          />
          <View style={styles.chipsContainer}>
            {subjects.map((subject) => (
              <ChoiceChip
                key={subject.id}
                label={getSubjectName(subject)}
                selected={selectedSpecializations.includes(subject.name_en)}
                style={!isEditing && !selectedSpecializations.includes(subject.name_en) ? styles.chipHidden : undefined}
                onPress={isEditing ? () => toggleSpecialization(subject.name_en) : undefined}
                disabled={!isEditing}
              />
            ))}
          </View>
          {!isEditing && selectedSpecializations.length === 0 && (
            <Text style={styles.emptyText}>{t('teacherProfile.noSpecializations')}</Text>
          )}
        </View>

        {/* Available Groups Section */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherProfile.availableGroups')}
            icon="people-circle-outline"
            style={styles.sectionHeading}
          />
          <View style={styles.groupsContainer}>
            {GROUPS.map(group => (
              <ChoiceChip
                key={group}
                label={`${t('teacherProfile.group')} ${group}`}
                selected={selectedGroups.includes(group)}
                style={!isEditing && !selectedGroups.includes(group) ? styles.chipHidden : undefined}
                onPress={isEditing ? () => toggleGroup(group) : undefined}
                disabled={!isEditing}
              />
            ))}
          </View>
          {!isEditing && selectedGroups.length === 0 && (
            <Text style={styles.emptyText}>{t('teacherProfile.noGroups')}</Text>
          )}
        </View>

        {/* Certificates Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('teacherProfile.certificates.title', 'Certificates')}</Text>
            <AppPressable
              accessibilityLabel={t('teacherProfile.certificates.upload', 'Upload')}
              compact
              style={styles.uploadButton}
              onPress={handleUploadCertificate}
              disabled={uploadingCertificate}
            >
              {uploadingCertificate ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={colors.primary} />
                  <Text style={styles.uploadButtonText}>{t('teacherProfile.certificates.upload', 'Upload')}</Text>
                </>
              )}
            </AppPressable>
          </View>
          
          {teacher.certificates && teacher.certificates.length > 0 ? (
            <View style={styles.certificatesGrid}>
              {teacher.certificates.map((certUrl, index) => (
                <View key={index} style={styles.certificateItem}>
                  <View style={styles.certificatePreviewWrap}>
                    <AppPressable
                      accessibilityLabel={`${t('teacherProfile.certificates.certificate', 'Certificate')} ${index + 1}`}
                      style={styles.certificatePreview}
                      onPress={() => handleOpenCertificate(certUrl, index)}
                      disabled={downloadingCertIndex !== null}
                    >
                      <View style={styles.pdfIcon}>
                        {downloadingCertIndex === index ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="document-text" size={32} color={colors.primary} />
                            <Text style={styles.pdfLabel}>PDF</Text>
                          </>
                        )}
                      </View>
                    </AppPressable>
                    <AppPressable
                      accessibilityLabel={t('common.delete')}
                      compact
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.deleteCertButton}
                      onPress={() => handleDeleteCertificate(certUrl, index)}
                    >
                      <View style={styles.deleteCertCircle}>
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </View>
                    </AppPressable>
                  </View>
                  <Text style={styles.certificateLabel} numberOfLines={1}>
                    {t('teacherProfile.certificates.certificate', 'Certificate')} {index + 1}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCertificates}>
              <Ionicons name="document-outline" size={48} color={colors.textTertiary || colors.textSecondary} />
              <Text style={styles.emptyCertificatesText}>
                {t('teacherProfile.certificates.empty', 'No certificates uploaded yet')}
              </Text>
              <Text style={styles.emptyCertificatesHint}>
                {t('teacherProfile.certificates.hint', 'Upload PDF certificates to get verified')}
              </Text>
              <Text style={styles.emptyCertificatesFormat}>
                {t('teacherProfile.certificates.format', 'PDF format only, max 5MB')}
              </Text>
            </View>
          )}
        </View>

        {/* Info Box */}
        {isEditing && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1E40AF" />
            <Text style={styles.infoBoxText}>
              {t('teacherProfile.infoMessage')}
            </Text>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* City Picker Modal */}
      <SearchablePickerModal
        visible={showCityPicker}
        title={t('teacherProfile.selectCity')}
        options={cities.map(c => ({
          value: c.name,
          label: c.name_az,
          subtitle: c.name,
        }))}
        selectedValue={city}
        onSelect={setCity}
        onClose={() => setShowCityPicker(false)}
        searchPlaceholder={t('common.search')}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: spacing.md,
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
    },
    skeletonContent: {
      padding: spacing.lg,
    },
    skeletonBlock: {
      marginTop: spacing.md,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      marginTop: spacing.md,
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      minHeight: 64,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.xs,
    },
    editButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      minWidth: 64,
      height: 40,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
    },
    saveButton: {
      backgroundColor: colors.primary,
      minWidth: 64,
      height: 40,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: {
      fontSize: typography.fontSizes.sm,
      color: '#fff',
      fontWeight: '600',
    },
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    profileHeader: {
      backgroundColor: colors.surface,
      padding: spacing.xl,
      alignItems: 'center',
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: borderRadius.lg,
    },
    avatarContainer: {
      marginBottom: spacing.md,
      position: 'relative',
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
    },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarUploadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraButton: {
      position: 'absolute',
      bottom: 0,
      right: -4,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    teacherName: {
      fontSize: typography.fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    teacherEmail: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    profileMetricsGrid: {
      alignSelf: 'stretch',
      gap: spacing.sm,
    },
    profileMetricCard: {
      minHeight: 104,
    },
    profileMetricSummary: {
      color: colors.textSecondary,
      fontSize: typography.fontSizes.sm,
      lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
      textAlign: 'center',
    },
    section: {
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginTop: spacing.md,
      marginHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
    },
    sectionTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.md,
    },
    sectionHeading: {
      marginBottom: spacing.md,
    },
    inputLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '500',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: typography.fontSizes.md,
      color: colors.text,
    },
    bioInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: typography.fontSizes.md,
      color: colors.text,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    charCount: {
      marginTop: spacing.xs,
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      textAlign: 'right',
    },
    bioText: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      lineHeight: 22,
    },
    infoText: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
    },
    emptyText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    pickerText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
    },
    pricingDisplay: {
      gap: spacing.md,
    },
    priceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    priceLabel: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
    },
    priceValue: {
      fontSize: typography.fontSizes.md,
      fontWeight: '600',
      color: colors.text,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chipHidden: {
      display: 'none',
    },
    groupsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    availabilityPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '10',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.md,
    },
    availabilityPreviewContent: {
      flex: 1,
    },
    availabilityPreviewTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: '600',
      color: colors.text,
    },
    availabilityPreviewDescription: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    infoBox: {
      flexDirection: 'row',
      backgroundColor: '#DBEAFE',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      margin: spacing.lg,
      gap: spacing.sm,
    },
    infoBoxText: {
      fontSize: typography.fontSizes.sm,
      color: '#1E40AF',
      flex: 1,
      lineHeight: 20,
    },
    // Verification Banner Styles
    verificationBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF3C7',
      padding: spacing.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: '#F59E0B',
    },
    verificationBannerIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#FDE68A',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
    },
    verificationBannerContent: {
      flex: 1,
    },
    verificationBannerTitle: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: '#92400E',
      marginBottom: 2,
    },
    verificationBannerText: {
      fontSize: typography.fontSizes.xs,
      color: '#B45309',
      lineHeight: 16,
    },
    verificationBannerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#F59E0B',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: spacing.sm,
    },
    // Certificates Section Styles
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    uploadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    uploadButtonText: {
      fontSize: typography.fontSizes.sm,
      color: colors.primary,
      fontWeight: '500',
    },
    certificatesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    certificateItem: {
      width: 100,
      alignItems: 'center',
    },
    certificatePreviewWrap: {
      width: 88,
      height: 88,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    certificateImage: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.md,
      backgroundColor: colors.background,
    },
    pdfIcon: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.md,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    pdfLabel: {
      fontSize: typography.fontSizes.xs,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 4,
    },
    certificateLabel: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    emptyCertificates: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
    },
    emptyCertificatesText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    emptyCertificatesHint: {
      fontSize: typography.fontSizes.xs,
      color: colors.textTertiary || colors.textSecondary,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    emptyCertificatesFormat: {
      fontSize: typography.fontSizes.xs,
      color: colors.textTertiary || colors.textSecondary,
      marginTop: spacing.xs,
      fontStyle: 'italic',
    },
    certificatePreview: {
      width: 80,
      height: 80,
    },
    deleteCertButton: {
      position: 'absolute',
      top: -8,
      right: -8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteCertCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.error,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default TeacherOwnProfileScreen;
