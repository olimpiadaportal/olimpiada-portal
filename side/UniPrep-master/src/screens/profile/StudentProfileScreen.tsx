import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { profileService } from '../../services/profileService';
import { useTheme } from '../../contexts/ThemeContext';
import { ProfileData } from '../../types/settings';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useAlert } from '../../components/AlertProvider';
import { ErrorState, SectionHeader, StatusBadge } from '../../components/ui';
import { FadeIn, Stagger } from '../../components/animated';
import { SkeletonLoader } from '../../components/animated/SkeletonLoader';

type IconName = keyof typeof Ionicons.glyphMap;

type InfoRowProps = {
  icon: IconName;
  label: string;
  value?: string | null;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  emptyLabel: string;
};

const InfoRow: React.FC<InfoRowProps> = ({
  icon,
  label,
  value,
  colors,
  styles: themedStyles,
  emptyLabel,
}) => {
  const hasValue = Boolean(value && value.trim().length > 0);

  return (
    <View style={[themedStyles.infoRow, { borderColor: colors.border }]}>
      <View style={themedStyles.infoLabelGroup}>
        <View style={[themedStyles.infoIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[themedStyles.infoLabel, { color: colors.textSecondary }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          themedStyles.infoValue,
          { color: hasValue ? colors.text : colors.textTertiary },
        ]}
        numberOfLines={2}
      >
        {hasValue ? value : emptyLabel}
      </Text>
    </View>
  );
};

const getCompletionPercentage = (profile: ProfileData | null) => {
  if (!profile) return 0;

  const fields = [
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.city,
    profile.bio,
    profile.target_group,
    profile.target_university,
  ];

  const completed = fields.filter(field => {
    if (field === null || field === undefined) return false;
    return String(field).trim().length > 0;
  }).length;

  return Math.round((completed / fields.length) * 100);
};

const StudentProfileSkeleton: React.FC<{ styles: ReturnType<typeof createStyles> }> = ({ styles }) => (
  <View style={styles.skeletonWrap}>
    <View style={styles.skeletonHeader}>
      <SkeletonLoader width={44} height={44} borderRadius={22} />
      <SkeletonLoader width={44} height={44} borderRadius={22} />
    </View>
    <View style={styles.skeletonIdentity}>
      <SkeletonLoader width={88} height={88} borderRadius={44} style={styles.skeletonAvatar} />
      <SkeletonLoader width="52%" height={22} style={styles.skeletonLine} />
      <SkeletonLoader width="68%" height={14} style={styles.skeletonLine} />
      <SkeletonLoader width="82%" height={8} borderRadius={4} style={styles.skeletonLine} />
    </View>
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
  </View>
);

export const StudentProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors: themeColors, shadows } = useTheme();
  const { showError } = useAlert();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const completionPercentage = useMemo(() => getCompletionPercentage(profile), [profile]);
  const displayName = useMemo(() => {
    const profileName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    return profileName || user?.full_name || t('profileTab.home.fallbackName');
  }, [profile, user, t]);

  const emptyLabel = t('profile.emptyField');
  const completionTitle = completionPercentage >= 100
    ? t('profile.profileCompleteFull')
    : t('profile.profileComplete', { percent: completionPercentage });

  const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;

    const silent = options?.silent ?? false;

    try {
      if (!silent) {
        setLoading(true);
      }

      const profileData = await profileService.getProfile(user.id);
      setProfile(profileData);

      if (!profileData && !silent) {
        showError(t('common.error'), t('errors.notFound'));
      }
    } catch (error) {
      console.error('Error loading student profile:', error);
      if (!silent) {
        showError(t('common.error'), t('errors.generic'));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [showError, t, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (profile) {
        loadProfile({ silent: true });
      }
    });

    return unsubscribe;
  }, [loadProfile, navigation, profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile({ silent: true });
    setRefreshing(false);
  };

  const handleEditProfile = () => {
    navigation.navigate('EditProfile' as never);
  };

  const handleSettings = () => {
    navigation.navigate('Settings' as never);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StudentProfileSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ErrorState
          title={t('errors.notFound')}
          message={t('errors.generic')}
          actionLabel={t('common.retry')}
          onAction={() => loadProfile()}
          style={styles.errorState}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColors.primary}
            colors={[themeColors.primary]}
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={[styles.iconButton, { borderColor: themeColors.border }]}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={styles.screenTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {t('profile.title')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleSettings}
            style={[styles.iconButton, { borderColor: themeColors.border }]}
          >
            <Ionicons name="settings-outline" size={22} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <FadeIn duration={320}>
          <View style={[styles.identityCard, shadows.sm]}>
            <View style={styles.avatarShell}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <Ionicons name="person" size={48} color={themeColors.primary} />
              )}
            </View>

            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={2}>
                {displayName}
              </Text>
              {profile.email ? (
                <Text style={styles.email} numberOfLines={1}>
                  {profile.email}
                </Text>
              ) : null}
              <View style={styles.badgeRow}>
                <StatusBadge label={t('profileTab.student')} icon="book-outline" variant="info" />
                <StatusBadge
                  label={`${completionPercentage}%`}
                  icon="checkmark-circle-outline"
                  variant={completionPercentage >= 100 ? 'success' : 'warning'}
                />
              </View>
            </View>
          </View>
        </FadeIn>

        <View style={[styles.completionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionTitle} numberOfLines={2}>
              {completionTitle}
            </Text>
            <Text style={styles.completionPercent}>{completionPercentage}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: themeColors.surfaceVariant }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${completionPercentage}%`,
                  backgroundColor: completionPercentage >= 100 ? themeColors.success : themeColors.primary,
                },
              ]}
            />
          </View>
          {completionPercentage < 100 ? (
            <Text style={styles.completionHint}>
              {t('profile.completeYourProfile')}
            </Text>
          ) : null}
        </View>

        <Stagger delay={60} initialDelay={90}>
          <View style={styles.section}>
            <SectionHeader
              title={t('profile.personalInfo')}
              subtitle={t('profile.personalInfoSubtitle')}
              icon="person-outline"
            />
            <View style={styles.card}>
              <InfoRow
                icon="call-outline"
                label={t('profile.phone')}
                value={profile.phone}
                colors={themeColors}
                styles={styles}
                emptyLabel={emptyLabel}
              />
              <InfoRow
                icon="location-outline"
                label={t('profile.city')}
                value={profile.city}
                colors={themeColors}
                styles={styles}
                emptyLabel={emptyLabel}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('profile.academicInfo')}
              subtitle={t('profile.academicInfoSubtitle')}
              icon="school-outline"
            />
            <View style={styles.card}>
              <InfoRow
                icon="albums-outline"
                label={t('profile.targetGroup')}
                value={profile.target_group}
                colors={themeColors}
                styles={styles}
                emptyLabel={emptyLabel}
              />
              <InfoRow
                icon="business-outline"
                label={t('profile.targetUniversity')}
                value={profile.target_university}
                colors={themeColors}
                styles={styles}
                emptyLabel={emptyLabel}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('profile.bio')}
              subtitle={t('profile.bioSubtitle')}
              icon="document-text-outline"
            />
            <View style={styles.card}>
              <Text
                style={[
                  styles.bioText,
                  { color: profile.bio ? themeColors.text : themeColors.textTertiary },
                ]}
              >
                {profile.bio || emptyLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.86}
            style={styles.editButton}
            onPress={handleEditProfile}
          >
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            <Text style={styles.editButtonText}>{t('profile.editProfile')}</Text>
          </TouchableOpacity>
        </Stagger>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  screenTitle: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0,
    textAlign: 'center',
  },
  identityCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  avatarShell: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 38,
    height: 76,
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
    width: 76,
  },
  avatar: {
    height: 76,
    width: 76,
  },
  identityCopy: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.xl * typography.lineHeights.tight,
  },
  email: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    marginTop: 2,
  },
  badgeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  completionCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  completionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  completionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    paddingRight: spacing.md,
  },
  completionPercent: {
    color: colors.primary,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  progressTrack: {
    borderRadius: borderRadius.full,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: borderRadius.full,
    height: '100%',
  },
  completionHint: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.sm,
  },
  section: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  infoLabelGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingRight: spacing.sm,
  },
  infoIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 38,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 38,
  },
  infoLabel: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    textAlign: 'right',
  },
  bioText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    paddingVertical: spacing.md,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginLeft: spacing.sm,
  },
  errorState: {
    flex: 1,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  skeletonIdentity: {
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
  skeletonLine: {
    marginTop: spacing.sm,
  },
});

export default StudentProfileScreen;
