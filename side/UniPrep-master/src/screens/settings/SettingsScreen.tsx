import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { settingsService } from '../../services/settingsService';
import { leaderboardService } from '../../services/leaderboardService';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useWalkthrough } from '../../contexts/WalkthroughContext';
import { UserSettings, Theme, Language } from '../../types/settings';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { SelectionModal } from '../../components/SelectionModal';
import { useAlert } from '../../components/AlertProvider';
import { useAppInfo } from '../../hooks/useAppInfo';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { SectionHeader } from '../../components/ui';
import { FadeIn, Stagger } from '../../components/animated';
import { SkeletonLoader } from '../../components/animated/SkeletonLoader';

type IconName = keyof typeof Ionicons.glyphMap;

type SettingRowProps = {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
  disabled?: boolean;
  colors: any;
  styles: ReturnType<typeof createStyles>;
};

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  title,
  value,
  onPress,
  rightContent,
  disabled,
  colors,
  styles: themedStyles,
}) => (
  <TouchableOpacity
    accessibilityRole={onPress ? 'button' : undefined}
    activeOpacity={onPress ? 0.82 : 1}
    disabled={!onPress || disabled}
    onPress={onPress}
    style={[
      themedStyles.settingRow,
      { borderColor: colors.border },
      disabled && themedStyles.settingRowDisabled,
    ]}
  >
    <View style={themedStyles.settingLeft}>
      <View style={[themedStyles.settingIcon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text
        style={[
          themedStyles.settingTitle,
          { color: disabled ? colors.textTertiary : colors.text },
        ]}
        numberOfLines={2}
      >
        {title}
      </Text>
    </View>

    <View style={themedStyles.settingRight}>
      {rightContent ?? (
        <>
          {value ? (
            <Text
              style={[themedStyles.settingValue, { color: colors.textSecondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {value}
            </Text>
          ) : null}
          {onPress ? (
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          ) : null}
        </>
      )}
    </View>
  </TouchableOpacity>
);

const SettingsSkeleton: React.FC<{ styles: ReturnType<typeof createStyles> }> = ({ styles }) => (
  <View style={styles.skeletonWrap}>
    <View style={styles.skeletonHeader}>
      <SkeletonLoader width={44} height={44} borderRadius={22} />
      <SkeletonLoader width="38%" height={24} />
      <SkeletonLoader width={44} height={44} borderRadius={22} />
    </View>
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
  </View>
);

export const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { theme, setTheme, colors: themeColors, shadows } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { flags } = useFeatureFlags();
  const { isOnline } = useNetworkStatus();
  const { appName, appVersion } = useAppInfo();
  const {
    resetWalkthrough,
    startWalkthrough,
    isWalkthroughEnabled,
    checkWalkthroughEnabled,
  } = useWalkthrough();
  const { showSuccess, showError, showConfirm, showInfo } = useAlert();

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  useEffect(() => {
    checkWalkthroughEnabled();
  }, [checkWalkthroughEnabled]);

  const loadSettings = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userSettings = await settingsService.getSettings(user.id);
      setSettings(userSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [showError, t, user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = async (key: keyof UserSettings, value: any) => {
    if (!user || !settings) return;

    const previousSettings = settings;
    const updated = { ...settings, [key]: value };

    if (!isOnline) {
      if (key === 'language' || key === 'theme') {
        setSettings(updated);
        await settingsService.updateSettings({ [key]: value });
        return;
      }

      showInfo(t('offline.title'), t('offline.profileActionMessage'));
      return;
    }

    try {
      setSettings(updated);
      await settingsService.updateSettings({ [key]: value }, user.id);

      if (key === 'showInLeaderboard') {
        await leaderboardService.updateOptInStatus(user.id, value as boolean);
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      setSettings(previousSettings);
      showError(t('common.error'), t('errors.generic'));
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    updateSetting('theme', newTheme);
  };

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    updateSetting('language', newLanguage);
  };

  const handleResetWalkthrough = () => {
    showConfirm(
      t('settings.resetWalkthrough'),
      t('settings.resetWalkthroughConfirm'),
      async () => {
        await resetWalkthrough();
        showSuccess(t('common.success'), t('settings.walkthroughReset'));
      },
      undefined,
      t('common.confirm'),
      t('common.cancel')
    );
  };

  const leaderboardSwitch = settings ? (
    <Switch
      value={settings.showInLeaderboard}
      onValueChange={(value) => updateSetting('showInLeaderboard', value)}
      trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
      thumbColor={settings.showInLeaderboard ? themeColors.primary : themeColors.surface}
      disabled={!isOnline}
    />
  ) : null;

  const openOnlineOnlyScreen = (routeName: 'ChangePassword' | 'AccountManagement') => {
    if (!isOnline) {
      showInfo(t('offline.title'), t('offline.profileActionMessage'));
      return;
    }

    navigation.navigate(routeName as never);
  };

  if (loading || !settings) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <SettingsSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={[styles.iconButton, { borderColor: themeColors.border }]}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
          {t('settings.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn duration={280}>
          <View style={[styles.summaryCard, shadows.sm]}>
            <View style={[styles.summaryIcon, { backgroundColor: themeColors.primaryLight }]}>
              <Ionicons name="settings-outline" size={26} color={themeColors.primary} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle} numberOfLines={1}>
                {t('settings.title')}
              </Text>
              <Text style={styles.summarySubtitle} numberOfLines={2}>
                {appName} · {t(`languages.${language}`)}
              </Text>
            </View>
          </View>
        </FadeIn>

        <Stagger delay={55} initialDelay={80}>
          <View style={styles.section}>
            <SectionHeader title={t('settings.general')} icon="options-outline" />
            <View style={styles.card}>
              <SettingRow
                icon="language-outline"
                title={t('settings.language')}
                value={t(`languages.${language}`)}
                onPress={() => setShowLanguageModal(true)}
                colors={themeColors}
                styles={styles}
              />
              {flags.dark_mode ? (
                <SettingRow
                  icon="color-palette-outline"
                  title={t('settings.theme')}
                  value={t(`themes.${theme}`)}
                  onPress={() => setShowThemeModal(true)}
                  colors={themeColors}
                  styles={styles}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('settings.notifications')} icon="notifications-outline" />
            <View style={styles.card}>
              <SettingRow
                icon="notifications-outline"
                title={t('notifications.preferences')}
                onPress={() => navigation.navigate('NotificationPreferences' as never)}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>

          {user?.user_type === 'student' ? (
            <View style={styles.section}>
              <SectionHeader title={t('settings.privacy')} icon="shield-checkmark-outline" />
              <View style={styles.card}>
              <SettingRow
                icon="trophy-outline"
                title={t('settings.showInLeaderboard')}
                rightContent={leaderboardSwitch}
                disabled={!isOnline}
                colors={themeColors}
                styles={styles}
              />
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title={t('settings.account')} icon="person-circle-outline" />
            <View style={styles.card}>
              <SettingRow
                icon="lock-closed-outline"
                title={t('settings.changePassword')}
                onPress={() => openOnlineOnlyScreen('ChangePassword')}
                disabled={!isOnline}
                colors={themeColors}
                styles={styles}
              />
              <SettingRow
                icon="person-circle-outline"
                title={t('settings.accountManagement')}
                onPress={() => openOnlineOnlyScreen('AccountManagement')}
                disabled={!isOnline}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('settings.about')} icon="information-circle-outline" />
            <View style={styles.card}>
              <SettingRow
                icon="help-circle-outline"
                title={t('settings.helpSupport')}
                onPress={() => navigation.navigate('HelpSupport' as never)}
                colors={themeColors}
                styles={styles}
              />
              <SettingRow
                icon="information-circle-outline"
                title={t('about.title', { appName })}
                onPress={() => navigation.navigate('About' as never)}
                colors={themeColors}
                styles={styles}
              />
              {isWalkthroughEnabled ? (
                <>
                  <SettingRow
                    icon="play-circle-outline"
                    title={t('settings.showNow')}
                    onPress={startWalkthrough}
                    colors={themeColors}
                    styles={styles}
                  />
                  <SettingRow
                    icon="refresh-circle-outline"
                    title={t('settings.resetWalkthrough')}
                    onPress={handleResetWalkthrough}
                    colors={themeColors}
                    styles={styles}
                  />
                </>
              ) : null}
              <SettingRow
                icon="code-slash-outline"
                title={t('settings.version')}
                value={appVersion}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>
        </Stagger>
      </ScrollView>

      <SelectionModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        title={t('settings.language')}
        options={[
          { label: t('languages.az'), value: 'az', icon: 'language' },
          { label: t('languages.en'), value: 'en', icon: 'language' },
          { label: t('languages.ru'), value: 'ru', icon: 'language' },
        ]}
        selectedValue={language}
        onSelect={(value) => handleLanguageChange(value as Language)}
      />

      <SelectionModal
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        title={t('settings.theme')}
        options={[
          { label: t('themes.light'), value: 'light', icon: 'sunny' },
          { label: t('themes.dark'), value: 'dark', icon: 'moon' },
          { label: t('themes.system'), value: 'system', icon: 'phone-portrait' },
        ]}
        selectedValue={theme}
        onSelect={(value) => handleThemeChange(value as Theme)}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
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
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    height: 54,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 54,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  summarySubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  settingRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingRowDisabled: {
    opacity: 0.55,
  },
  settingLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    paddingRight: spacing.md,
  },
  settingIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  settingTitle: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
  settingRight: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    justifyContent: 'flex-end',
    minWidth: 40,
  },
  settingValue: {
    fontSize: typography.fontSizes.sm,
    marginRight: spacing.xs,
    maxWidth: 128,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  skeletonHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
});

export default SettingsScreen;
