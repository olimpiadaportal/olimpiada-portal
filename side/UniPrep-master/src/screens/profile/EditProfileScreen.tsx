import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { profileService } from '../../services/profileService';
import { imageUploadService } from '../../services/imageUploadService';
import { referenceDataService, University, City, TargetGroup } from '../../services/referenceDataService';
import { useTheme } from '../../contexts/ThemeContext';
import { SearchablePickerModal } from '../../components/common/SearchablePickerModal';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { sanitizeInput } from '../../utils/validation';
import { useAlert } from '../../components/AlertProvider';
import { SectionHeader } from '../../components/ui';
import { SkeletonLoader } from '../../components/animated/SkeletonLoader';

type IconName = keyof typeof Ionicons.glyphMap;

type FieldProps = {
  icon: IconName;
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  onPress?: () => void;
  rightIcon?: IconName;
  colors: any;
  styles: ReturnType<typeof createStyles>;
};

const FormField: React.FC<FieldProps> = ({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType = 'default',
  multiline = false,
  onPress,
  rightIcon,
  colors,
  styles,
}) => {
  const content = (
    <View
      style={[
        styles.field,
        {
          backgroundColor: editable ? colors.card : colors.surface,
          borderColor: colors.border,
          opacity: editable ? 1 : 0.72,
        },
        multiline && styles.textAreaField,
      ]}
    >
      <View style={styles.fieldHeader}>
        <View style={[styles.fieldIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>

      {onPress ? (
        <View style={styles.pickerValueRow}>
          <Text
            style={[
              styles.pickerValue,
              { color: value ? colors.text : colors.placeholder },
            ]}
            numberOfLines={2}
          >
            {value || placeholder || label}
          </Text>
          <Ionicons name={rightIcon || 'chevron-down'} size={20} color={colors.textTertiary} />
        </View>
      ) : (
        <TextInput
          style={[
            styles.input,
            multiline && styles.textArea,
            { color: editable ? colors.text : colors.textSecondary },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || label}
          placeholderTextColor={colors.placeholder}
          editable={editable}
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.84} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
};

const EditProfileSkeleton: React.FC<{ styles: ReturnType<typeof createStyles> }> = ({ styles }) => (
  <View style={styles.skeletonContent}>
    <View style={styles.skeletonHeader}>
      <SkeletonLoader width={64} height={20} />
      <SkeletonLoader width={120} height={22} />
      <SkeletonLoader width={48} height={20} />
    </View>
    <View style={styles.skeletonAvatarCard}>
      <SkeletonLoader width={96} height={96} borderRadius={48} style={styles.skeletonAvatar} />
      <SkeletonLoader width={140} height={18} />
    </View>
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
  </View>
);

export const EditProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { colors: themeColors } = useTheme();
  const { showSuccess, showError, showAlert } = useAlert();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const savingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([]);
  const [loadingReferenceData, setLoadingReferenceData] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showUniversityPicker, setShowUniversityPicker] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [targetUniversity, setTargetUniversity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [newAvatarUri, setNewAvatarUri] = useState('');

  const language = i18n.language?.startsWith('ru')
    ? 'ru'
    : i18n.language?.startsWith('en')
      ? 'en'
      : 'az';

  const displayAvatarUri = newAvatarUri || avatarUrl;

  const getCityDisplayName = useCallback((englishName: string): string => {
    const cityData = cities.find(c => c.name === englishName);
    if (!cityData) return englishName;
    return language === 'ru' ? cityData.name_ru : language === 'en' ? cityData.name_en : cityData.name_az;
  }, [cities, language]);

  const cityOptions = useMemo(
    () => cities.map(cityItem => ({
      value: cityItem.name,
      label: language === 'ru'
        ? cityItem.name_ru
        : language === 'en'
          ? cityItem.name_en
          : cityItem.name_az,
      subtitle: cityItem.region,
    })),
    [cities, language]
  );

  const groupOptions = useMemo(
    () => targetGroups.map(group => ({
      value: language === 'ru' ? group.name_ru : language === 'en' ? group.name_en : group.name_az,
      label: language === 'ru' ? group.name_ru : language === 'en' ? group.name_en : group.name_az,
      subtitle: language === 'ru'
        ? group.description_ru
        : language === 'en'
          ? group.description_en
          : group.description_az,
    })),
    [language, targetGroups]
  );

  const universityOptions = useMemo(
    () => universities.map(university => ({
      value: language === 'ru'
        ? university.name_ru
        : language === 'en'
          ? university.name_en
          : university.name_az,
      label: language === 'ru'
        ? university.name_ru
        : language === 'en'
          ? university.name_en
          : university.name_az,
      subtitle: university.city,
    })),
    [language, universities]
  );

  const loadReferenceData = useCallback(async () => {
    try {
      setLoadingReferenceData(true);
      const [universitiesData, citiesData, groupsData] = await Promise.all([
        referenceDataService.getUniversities(),
        referenceDataService.getCities(),
        referenceDataService.getTargetGroups(),
      ]);
      setUniversities(universitiesData);
      setCities(citiesData);
      setTargetGroups(groupsData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    } finally {
      setLoadingReferenceData(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const profile = await profileService.getProfile(user.id);

      if (profile) {
        const profileData = profile as { full_name?: string; first_name?: string; last_name?: string };
        const fullName = profileData.full_name || '';
        const nameParts = fullName.trim().split(' ');

        setFirstName(profile.first_name || nameParts[0] || '');
        setLastName(profile.last_name || nameParts.slice(1).join(' ') || '');
        setEmail(user.email || profile.email || '');
        setPhone(profile.phone || '');
        setCity(profile.city || '');
        setTargetGroup(profile.target_group || '');
        setTargetUniversity(profile.target_university || '');
        setBio(profile.bio || '');
        setAvatarUrl(profile.avatar_url || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [showError, t, user]);

  useEffect(() => {
    loadProfile();
    loadReferenceData();
  }, [loadProfile, loadReferenceData]);

  const handleTakePhoto = async () => {
    try {
      const uri = await imageUploadService.pickImageFromCamera();
      if (uri) {
        setNewAvatarUri(uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const uri = await imageUploadService.pickImageFromGallery();
      if (uri) {
        setNewAvatarUri(uri);
      }
    } catch (error) {
      console.error('Error choosing from gallery:', error);
    }
  };

  const handlePickImage = () => {
    showAlert({
      title: t('profile.changePhoto'),
      message: '',
      type: 'info',
      buttons: [
        {
          text: t('profile.takePhoto'),
          onPress: handleTakePhoto,
        },
        {
          text: t('profile.chooseFromGallery'),
          onPress: handleChooseFromGallery,
        },
      ],
    });
  };

  const handleSave = async () => {
    if (!user || savingRef.current) return;

    if (!firstName.trim() || !lastName.trim()) {
      showError(t('common.error'), t('editProfile.nameRequired'));
      return;
    }

    savingRef.current = true;

    try {
      setSaving(true);
      let finalAvatarUrl = avatarUrl;

      if (newAvatarUri) {
        setUploadingImage(true);
        const uploadedUrl = await imageUploadService.uploadProfilePicture(newAvatarUri, user.id);
        if (uploadedUrl) {
          finalAvatarUrl = uploadedUrl;
          await profileService.updateProfilePicture(user.id, uploadedUrl);
        }
        setUploadingImage(false);
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const sanitizedPhone = sanitizeInput(phone.trim());
      const sanitizedBio = sanitizeInput(bio.trim());

      if (user.user_type === 'student') {
        const studentFieldsSaved = await profileService.updateStudentProfileFields({
          city: city.trim(),
          target_group: targetGroup.trim(),
          target_university: targetUniversity.trim(),
          graduation_year: undefined,
        });

        if (!studentFieldsSaved) {
          showError(t('common.error'), t('errors.generic'));
          return;
        }
      }

      const success = await profileService.updateProfile(
        user.id,
        {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: sanitizedPhone,
          ...(user.user_type === 'teacher' ? { city: city.trim() } : {}),
          ...(user.user_type === 'teacher' ? { bio: sanitizedBio } : { bio: sanitizedBio }),
          avatar_url: finalAvatarUrl,
        } as any,
        user.user_type
      );

      if (success) {
        showSuccess(t('common.success'), t('success.profileUpdated'), () => navigation.goBack());
      } else {
        showError(t('common.error'), t('errors.generic'));
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      setSaving(false);
      setUploadingImage(false);
      savingRef.current = false;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EditProfileSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.headerAction}
            disabled={saving}
          >
            <Text style={[styles.cancelButton, { color: themeColors.textSecondary }]}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {t('profile.editProfile')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleSave}
            disabled={saving}
            style={styles.headerAction}
          >
            {saving ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Text style={[styles.saveButton, { color: themeColors.primary }]}>
                {t('common.save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              {displayAvatarUri ? (
                <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={themeColors.primary} />
                </View>
              )}
              {uploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={handlePickImage}
              style={styles.changePhotoButton}
              disabled={saving}
            >
              <Ionicons name="camera-outline" size={18} color={themeColors.primary} />
              <Text style={styles.changePhotoText}>{t('profile.changePhoto')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('profile.personalInfo')}
              subtitle={t('profile.personalInfoSubtitle')}
              icon="person-outline"
            />
            <FormField
              icon="mail-outline"
              label={t('profile.email')}
              value={email}
              editable={false}
              colors={themeColors}
              styles={styles}
            />
            <FormField
              icon="person-outline"
              label={t('profile.firstName')}
              value={firstName}
              onChangeText={setFirstName}
              colors={themeColors}
              styles={styles}
            />
            <FormField
              icon="person-outline"
              label={t('profile.lastName')}
              value={lastName}
              onChangeText={setLastName}
              colors={themeColors}
              styles={styles}
            />
            <FormField
              icon="call-outline"
              label={t('profile.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              colors={themeColors}
              styles={styles}
            />
            <FormField
              icon="location-outline"
              label={t('profile.city')}
              value={city ? getCityDisplayName(city) : ''}
              placeholder={t('profile.city')}
              onPress={() => setShowCityPicker(true)}
              colors={themeColors}
              styles={styles}
            />
          </View>

          {user?.user_type === 'student' && (
            <View style={styles.section}>
              <SectionHeader
                title={t('profile.academicInfo')}
                subtitle={t('profile.academicInfoSubtitle')}
                icon="school-outline"
              />
              <FormField
                icon="albums-outline"
                label={t('profile.targetGroup')}
                value={targetGroup}
                placeholder={t('profile.targetGroup')}
                onPress={() => setShowGroupPicker(true)}
                colors={themeColors}
                styles={styles}
              />
              <FormField
                icon="business-outline"
                label={t('profile.targetUniversity')}
                value={targetUniversity}
                placeholder={t('profile.targetUniversity')}
                onPress={() => setShowUniversityPicker(true)}
                colors={themeColors}
                styles={styles}
              />
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader
              title={t('profile.bio')}
              subtitle={t('profile.bioSubtitle')}
              icon="document-text-outline"
            />
            <FormField
              icon="document-text-outline"
              label={t('profile.bio')}
              value={bio}
              onChangeText={setBio}
              multiline
              colors={themeColors}
              styles={styles}
            />
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.86}
            onPress={handleSave}
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <SearchablePickerModal
        visible={showCityPicker}
        title={t('editProfile.selectCity')}
        options={cityOptions}
        selectedValue={city}
        onSelect={setCity}
        onClose={() => setShowCityPicker(false)}
        searchPlaceholder={t('editProfile.searchCities')}
        loading={loadingReferenceData}
      />

      <SearchablePickerModal
        visible={showGroupPicker}
        title={t('editProfile.selectGroup')}
        options={groupOptions}
        selectedValue={targetGroup}
        onSelect={setTargetGroup}
        onClose={() => setShowGroupPicker(false)}
        searchPlaceholder={t('editProfile.searchGroups')}
        loading={loadingReferenceData}
      />

      <SearchablePickerModal
        visible={showUniversityPicker}
        title={t('editProfile.selectUniversity')}
        options={universityOptions}
        selectedValue={targetUniversity}
        onSelect={setTargetUniversity}
        onClose={() => setShowUniversityPicker(false)}
        searchPlaceholder={t('editProfile.searchUniversities')}
        loading={loadingReferenceData}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 68,
  },
  cancelButton: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0,
    textAlign: 'center',
  },
  saveButton: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  avatarContainer: {
    marginBottom: spacing.md,
    position: 'relative',
  },
  avatar: {
    borderRadius: 50,
    height: 100,
    width: 100,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  uploadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
    borderRadius: 50,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  changePhotoButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  changePhotoText: {
    color: colors.primary,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginLeft: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  field: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  textAreaField: {
    minHeight: 148,
  },
  fieldHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  fieldIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 34,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 34,
  },
  fieldLabel: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  input: {
    fontSize: typography.fontSizes.md,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    minHeight: 28,
    padding: 0,
  },
  textArea: {
    minHeight: 84,
  },
  pickerValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pickerValue: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    paddingRight: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginLeft: spacing.sm,
  },
  skeletonContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  skeletonHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  skeletonAvatarCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  skeletonAvatar: {
    marginBottom: spacing.md,
  },
});

export default EditProfileScreen;
