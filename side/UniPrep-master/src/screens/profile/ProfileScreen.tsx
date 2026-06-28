import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { usePracticeStore } from '../../store/practiceStore';
import { useExamStore } from '../../store/examStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useMessagingStore } from '../../store/messagingStore';
import { authService } from '../../services/authService';
import { leaderboardService } from '../../services/leaderboardService';
import { settingsService } from '../../services/settingsService';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { systemSettingsService } from '../../services/systemSettingsService';
import { useAlert } from '../../components/AlertProvider';
import { FadeIn, Stagger } from '../../components/animated';
import { AppPressable, SectionHeader, StatusBadge } from '../../components/ui';
import { getInstalledAppVersion } from '../../hooks/useAppInfo';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { offlineSyncService } from '../../services/offlineSyncService';
import { offlineService } from '../../services/offlineService';

type IconName = keyof typeof Ionicons.glyphMap;

type MenuItemProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  badgeVariant?: 'warning';
  onPress: () => void;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  danger?: boolean;
  disabled?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  title,
  subtitle,
  badgeLabel,
  badgeVariant,
  onPress,
  colors,
  styles: themedStyles,
  danger = false,
  disabled = false,
}) => {
  const accent = disabled ? colors.textTertiary : (danger ? colors.error : colors.primary);

  return (
    <AppPressable
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[themedStyles.menuItem, disabled && themedStyles.menuItemDisabled, { borderColor: colors.border }]}
    >
      <View style={[themedStyles.menuIcon, { backgroundColor: accent + '16' }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={themedStyles.menuCopy}>
        <Text
          style={[themedStyles.menuTitle, { color: disabled ? colors.textTertiary : (danger ? colors.error : colors.text) }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[themedStyles.menuSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
        {badgeLabel ? (
          <View style={[
            themedStyles.menuBadge,
            badgeVariant === 'warning' && themedStyles.menuBadgeWarning,
          ]}>
            <Ionicons
              name="alert-circle-outline"
              size={13}
              color={colors.warning}
            />
            <Text style={[
              themedStyles.menuBadgeText,
              badgeVariant === 'warning' && themedStyles.menuBadgeWarningText,
            ]} numberOfLines={1}>
              {badgeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </AppPressable>
  );
};

export const ProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, signOut, studentId: cachedStudentId } = useAuthStore();
  const clearPracticeSession = usePracticeStore(state => state.clearSession);
  const clearExamSession = useExamStore(state => state.clearSession);
  const clearDashboard = useDashboardStore(state => state.clearDashboard);
  const cleanupMessaging = useMessagingStore(state => state.cleanup);
  const { colors: themeColors } = useTheme();
  const { showSuccess, showError, showConfirm, showInfo } = useAlert();
  const navigation = useNavigation<any>();
  const { isOnline } = useNetworkStatus();
  const [showInLeaderboard, setShowInLeaderboard] = useState(true);
  const [appName, setAppName] = useState('Elmly');
  const [appVersion, setAppVersion] = useState(getInstalledAppVersion());
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [localStudentId, setLocalStudentId] = useState<string | null>(null);
  const [teacherNeedsVerification, setTeacherNeedsVerification] = useState(false);

  const studentId = cachedStudentId || localStudentId;
  const stylesForTheme = useMemo(() => createStyles(themeColors), [themeColors]);
  const isStudent = user?.user_type === 'student';
  const isTeacher = user?.user_type === 'teacher';
  const displayName = user?.full_name || t('profileTab.home.fallbackName');
  const displayEmail = (user as any)?.email || '';

  const loadPrivacySetting = useCallback(async () => {
    try {
      if (!user) return;
      const isOptedIn = await leaderboardService.isOptedIn(user.id);
      setShowInLeaderboard(isOptedIn);
    } catch (error) {
      console.error('Error loading privacy setting:', error);
    }
  }, [user]);

  const loadStudentId = useCallback(async () => {
    try {
      if (!user || user.user_type !== 'student') return;
      if (cachedStudentId || localStudentId) return;

      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentData) {
        setLocalStudentId(studentData.id);
      }
    } catch (error) {
      console.error('Error loading student id:', error);
    }
  }, [user, cachedStudentId, localStudentId]);

  const loadTeacherVerificationStatus = useCallback(async () => {
    try {
      if (!user || user.user_type !== 'teacher') {
        setTeacherNeedsVerification(false);
        return;
      }

      const { data: teacherData, error } = await supabase
        .from('teachers')
        .select('certificates, is_verified, verification_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      const certificates = Array.isArray(teacherData?.certificates)
        ? teacherData.certificates
        : [];
      const verificationStatus = teacherData?.verification_status || (
        teacherData?.is_verified ? 'verified' : certificates.length > 0 ? 'pending' : 'not_submitted'
      );
      setTeacherNeedsVerification(
        certificates.length === 0 ||
        !teacherData?.is_verified ||
        verificationStatus !== 'verified'
      );
    } catch (error) {
      console.error('Error loading teacher verification status:', error);
      setTeacherNeedsVerification(false);
    }
  }, [user]);

  const loadAppInfo = useCallback(async () => {
    try {
      const settings = await systemSettingsService.getSettings();
      if (!settings) return;

      const cleanAppName = typeof settings.app_name === 'string'
        ? settings.app_name.replace(/^"|"$/g, '')
        : 'Elmly';

      setAppName(cleanAppName);
      setAppVersion(getInstalledAppVersion());
    } catch (error) {
      console.error('Error loading app info:', error);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    try {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        useAuthStore.getState().setUser(data);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadPrivacySetting();
    loadStudentId();
    loadTeacherVerificationStatus();
    loadAppInfo();
  }, [user, loadPrivacySetting, loadStudentId, loadTeacherVerificationStatus, loadAppInfo]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!user) return undefined;

      const task = InteractionManager.runAfterInteractions(async () => {
        loadPrivacySetting();
        loadStudentId();
        loadTeacherVerificationStatus();
        await refreshUserProfile();
      });

      return () => task.cancel();
    });

    return unsubscribe;
  }, [navigation, user, loadPrivacySetting, loadStudentId, loadTeacherVerificationStatus, refreshUserProfile]);

  const handlePrivacyToggle = async (value: boolean) => {
    try {
      if (!user) return;
      if (!isOnline) {
        showInfo(t('offline.title'), t('offline.profileActionMessage'));
        return;
      }

      setLoadingPrivacy(true);

      await leaderboardService.updateOptInStatus(user.id, value);

      const currentSettings = await settingsService.getSettings();
      await settingsService.updateSettings({ ...currentSettings, showInLeaderboard: value });

      setShowInLeaderboard(value);

      showSuccess(
        t('profileTab.privacySettings.privacyUpdated', 'Privacy Updated'),
        value
          ? t('profileTab.privacySettings.addedToLeaderboard', 'You will now appear on the leaderboard')
          : t('profileTab.privacySettings.removedFromLeaderboard', 'You have been removed from the leaderboard')
      );
    } catch (error) {
      console.error('Error updating privacy setting:', error);
      showError(t('common.error'), t('profileTab.privacySettings.updateError'));
    } finally {
      setLoadingPrivacy(false);
    }
  };

  const handleLogout = () => {
    const confirmLogout = () => showConfirm(
      t('profileTab.logout'),
      t('profileTab.logoutConfirm'),
      async () => {
        try {
          useAuthStore.getState().setSigningOut(true);
          cleanupMessaging();
          clearPracticeSession();
          clearExamSession();
          clearDashboard();
          await authService.signOut();
          signOut();
        } catch (error: any) {
          useAuthStore.getState().setSigningOut(false);

          if (!error?.message?.includes('session') && error?.name !== 'AuthSessionMissingError') {
            console.error('Logout error:', error);
            showError(t('common.error'), t('profileTab.logoutError'));
          } else {
            signOut();
          }
        }
      },
      undefined,
      t('profileTab.logout'),
      t('common.cancel')
    );

    if (!isOnline) {
      Promise.all([
        offlineSyncService.getPendingSessionCount(),
        offlineService.getUnsyncedCount(),
      ]).then(([pendingCount, legacyAnswerCount]) => {
        const pendingTotal = pendingCount + legacyAnswerCount;
        if (pendingTotal > 0) {
          showConfirm(
            t('profileTab.logout'),
            t('offline.logoutPendingWarning', { count: pendingTotal }),
            confirmLogout,
            undefined,
            t('profileTab.logout'),
            t('common.cancel')
          );
          return;
        }

        confirmLogout();
      });
      return;
    }

    confirmLogout();
  };

  const navigateToProfile = () => {
    if (!isOnline) {
      showInfo(t('offline.title'), t('offline.profileActionMessage'));
      return;
    }
    navigation.navigate(isTeacher ? 'TeacherOwnProfile' as never : 'StudentProfile' as never);
  };

  const guardOnline = (action: () => void) => {
    if (!isOnline) {
      showInfo(t('offline.title'), t('offline.profileActionMessage'));
      return;
    }
    action();
  };

  return (
    <SafeAreaView style={stylesForTheme.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={stylesForTheme.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={stylesForTheme.header}>
          <Text style={stylesForTheme.headerTitle}>{t('profile.title')}</Text>
          <Text style={stylesForTheme.headerSubtitle}>{t('profileTab.home.subtitle')}</Text>
        </View>

        <FadeIn duration={360}>
          <View style={stylesForTheme.identityCard}>
            <View style={stylesForTheme.avatarShell}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={stylesForTheme.avatar} />
              ) : (
                <Ionicons name="person" size={42} color={themeColors.primary} />
              )}
            </View>

            <View style={stylesForTheme.identityCopy}>
              <Text style={stylesForTheme.userName} numberOfLines={2}>
                {displayName}
              </Text>
              {displayEmail ? (
                <Text style={stylesForTheme.userEmail} numberOfLines={1}>
                  {displayEmail}
                </Text>
              ) : null}
              <View style={stylesForTheme.identityBadges}>
                <StatusBadge
                  label={isTeacher ? t('profileTab.teacher') : t('profileTab.student')}
                  icon={isTeacher ? 'school-outline' : 'book-outline'}
                  variant={isTeacher ? 'accent' : 'info'}
                />
                {showInLeaderboard && isStudent ? (
                  <StatusBadge
                    label={t('profileTab.home.leaderboardVisible')}
                    icon="trophy-outline"
                    variant="success"
                  />
                ) : null}
              </View>
            </View>
          </View>
        </FadeIn>

        <Stagger delay={55} initialDelay={130}>
          {!isOnline ? (
            <View style={stylesForTheme.offlineNotice}>
              <Ionicons name="cloud-offline-outline" size={20} color={themeColors.warning} />
              <View style={stylesForTheme.offlineNoticeCopy}>
                <Text style={stylesForTheme.offlineNoticeTitle}>{t('offline.profileTitle')}</Text>
                <Text style={stylesForTheme.offlineNoticeText}>{t('offline.profileMessage')}</Text>
              </View>
            </View>
          ) : null}

          <View style={stylesForTheme.sectionBlock}>
            <SectionHeader
              title={t('profileTab.home.accountActions')}
              subtitle={t('profileTab.home.accountActionsSubtitle')}
              icon="person-circle-outline"
            />
            <MenuItem
              icon="person-outline"
              title={isTeacher ? t('profileTab.viewProfile') : t('profileTab.editProfile')}
              badgeLabel={isTeacher && teacherNeedsVerification ? t('profileTab.home.verificationNeeded') : undefined}
              badgeVariant={isTeacher && teacherNeedsVerification ? 'warning' : undefined}
              onPress={navigateToProfile}
              colors={themeColors}
              styles={stylesForTheme}
              disabled={!isOnline}
            />
            <MenuItem
              icon="settings-outline"
              title={t('profileTab.settings')}
              onPress={() => navigation.navigate('Settings' as never)}
              colors={themeColors}
              styles={stylesForTheme}
            />
          </View>

          {isStudent ? (
            <View style={stylesForTheme.sectionBlock}>
              <SectionHeader
                title={t('profileTab.home.learningSupport')}
                subtitle={t('profileTab.home.learningSupportSubtitle')}
                icon="people-outline"
              />

              {studentId ? (
                <MenuItem
                  icon="school-outline"
                  title={t('myTeachers.setTeachers')}
                  onPress={() => guardOnline(() => navigation.navigate('MyTeachers', { studentId }))}
                  colors={themeColors}
                  styles={stylesForTheme}
                  disabled={!isOnline}
                />
              ) : null}

              <MenuItem
                icon="calendar-outline"
                title={t('profileTab.myBookings.title')}
                onPress={() => guardOnline(() => navigation.navigate('MyBookings' as never))}
                colors={themeColors}
                styles={stylesForTheme}
                disabled={!isOnline}
              />
              <MenuItem
                icon="repeat-outline"
                title={t('teacherSubscriptions.studentTitle')}
                onPress={() => guardOnline(() => navigation.navigate('MySubscriptions' as never))}
                colors={themeColors}
                styles={stylesForTheme}
                disabled={!isOnline}
              />
            </View>
          ) : null}

          {isStudent ? (
            <View style={stylesForTheme.sectionBlock}>
              <SectionHeader
                title={t('profileTab.home.privacy')}
                subtitle={t('profileTab.home.privacySubtitle')}
                icon="shield-checkmark-outline"
              />
              <View style={stylesForTheme.privacyRow}>
                <View style={stylesForTheme.privacyCopy}>
                  <Text style={stylesForTheme.privacyTitle}>
                    {t('profileTab.privacySettings.showInLeaderboard')}
                  </Text>
                </View>
                <Switch
                  value={showInLeaderboard}
                  onValueChange={handlePrivacyToggle}
                  disabled={loadingPrivacy || !isOnline}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          ) : null}

          <View style={stylesForTheme.sectionBlock}>
            <SectionHeader
              title={t('profileTab.home.appSupport')}
              subtitle={t('profileTab.home.appSupportSubtitle')}
              icon="help-buoy-outline"
            />
            <MenuItem
              icon="help-circle-outline"
              title={t('profileTab.helpSupport')}
              onPress={() => navigation.navigate('HelpSupport' as never)}
              colors={themeColors}
              styles={stylesForTheme}
            />
            <MenuItem
              icon="information-circle-outline"
              title={t('profileTab.about')}
              onPress={() => navigation.navigate('About' as never)}
              colors={themeColors}
              styles={stylesForTheme}
            />
          </View>

          <View style={stylesForTheme.sectionBlock}>
            <SectionHeader
              title={t('profileTab.home.dangerZone')}
              subtitle={t('profileTab.home.dangerZoneSubtitle')}
              icon="warning-outline"
            />
            <MenuItem
              icon="log-out-outline"
              title={t('profileTab.logout')}
              onPress={handleLogout}
              colors={themeColors}
              styles={stylesForTheme}
              danger
            />
          </View>
        </Stagger>

        <View style={stylesForTheme.versionBlock}>
          <Text style={stylesForTheme.appNameText}>{appName}</Text>
          <Text style={stylesForTheme.versionText}>v{appVersion}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    marginTop: spacing.xs,
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
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
    width: 72,
  },
  avatar: {
    height: 72,
    width: 72,
  },
  identityCopy: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.xl * typography.lineHeights.tight,
  },
  userEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    marginTop: 2,
  },
  identityBadges: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionBlock: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  menuItem: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  menuItemDisabled: {
    opacity: 0.58,
  },
  menuIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 42,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 42,
  },
  menuCopy: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  menuTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  menuSubtitle: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 2,
  },
  menuBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  menuBadgeWarning: {
    backgroundColor: colors.warning + '14',
  },
  menuBadgeText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  menuBadgeWarningText: {
    color: colors.warning,
  },
  privacyRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 78,
    paddingTop: spacing.md,
  },
  offlineNotice: {
    alignItems: 'center',
    backgroundColor: colors.warning + '12',
    borderColor: colors.warning + '44',
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  offlineNoticeCopy: {
    flex: 1,
  },
  offlineNoticeTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  offlineNoticeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 2,
  },
  privacyCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  privacyTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  privacyDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.xs,
  },
  versionBlock: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  appNameText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  versionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    marginTop: 4,
  },
});

export default ProfileScreen;
