import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
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
import { accountService } from '../../services/accountService';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';
import { ErrorState, SectionHeader, StatusBadge } from '../../components/ui';
import { FadeIn, Stagger } from '../../components/animated';
import { SkeletonLoader } from '../../components/animated/SkeletonLoader';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineScreen } from '../../components/OfflineScreen';

type IconName = keyof typeof Ionicons.glyphMap;

type AccountStatus = {
  isVerified: boolean;
  createdAt: string;
  lastSignIn: string;
};

type StatusRowProps = {
  icon: IconName;
  label: string;
  value: string;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  accentColor?: string;
};

const StatusRow: React.FC<StatusRowProps> = ({
  icon,
  label,
  value,
  colors,
  styles: themedStyles,
  accentColor,
}) => (
  <View style={[themedStyles.statusRow, { borderBottomColor: colors.border }]}>
    <View style={themedStyles.statusLabelGroup}>
      <View style={[themedStyles.statusIcon, { backgroundColor: (accentColor ?? colors.primary) + '18' }]}>
        <Ionicons name={icon} size={18} color={accentColor ?? colors.primary} />
      </View>
      <Text style={[themedStyles.statusLabel, { color: colors.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
    <Text style={[themedStyles.statusValue, { color: accentColor ?? colors.text }]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const AccountManagementSkeleton: React.FC<{ styles: ReturnType<typeof createStyles> }> = ({ styles }) => (
  <View style={styles.skeletonWrap}>
    <View style={styles.skeletonHeader}>
      <SkeletonLoader width={44} height={44} borderRadius={22} />
      <SkeletonLoader width="42%" height={24} />
      <View style={styles.skeletonHeaderSpacer} />
    </View>
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
    <SkeletonLoader.Card />
  </View>
);

export const AccountManagementScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuthStore();
  const { colors: themeColors, shadows } = useTheme();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { isOnline } = useNetworkStatus();

  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const exportInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const deleteReady = deleteConfirmText.trim() === 'DELETE';

  const loadAccountStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;

    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setLoading(true);
      }

      const status = await accountService.getAccountStatus(user.id);
      setAccountStatus(status);
    } catch (error) {
      console.error('Error loading account status:', error);
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
    if (isOnline) {
      loadAccountStatus();
    } else {
      setLoading(false);
    }
  }, [isOnline, loadAccountStatus]);

  const onRefresh = useCallback(async () => {
    if (!isOnline) return;

    setRefreshing(true);
    await loadAccountStatus({ silent: true });
    setRefreshing(false);
  }, [isOnline, loadAccountStatus]);

  const handleExportData = useCallback(() => {
    if (!user || exportInFlightRef.current) return;

    showConfirm(
      t('account.exportDataTitle'),
      t('account.exportDataDescription'),
      async () => {
        if (exportInFlightRef.current) return;

        try {
          exportInFlightRef.current = true;
          setExporting(true);

          const data = await accountService.exportUserData(user.id);
          if (!data) {
            showError(t('common.error'), t('errors.generic'));
            return;
          }

          await Share.share({
            message: data,
            title: 'My Elmly Data',
          });
          showSuccess(t('common.success'), t('account.dataExported'));
        } catch (error) {
          console.error('Error exporting data:', error);
          showError(t('common.error'), t('errors.generic'));
        } finally {
          exportInFlightRef.current = false;
          setExporting(false);
        }
      },
      undefined,
      t('common.confirm'),
      t('common.cancel')
    );
  }, [showConfirm, showError, showSuccess, t, user]);

  const handleDeleteAccount = useCallback(() => {
    if (deleteInFlightRef.current) return;

    showConfirm(
      t('account.deleteAccountTitle'),
      t('account.deleteAccountWarning'),
      () => {
        setDeleteConfirmText('');
        setShowDeleteModal(true);
      },
      undefined,
      t('common.delete'),
      t('common.cancel')
    );
  }, [showConfirm, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteReady) {
      showError(t('common.error'), t('account.typeDeleteToConfirm'));
      return;
    }

    if (!user || deleteInFlightRef.current) return;

    try {
      deleteInFlightRef.current = true;
      setDeleting(true);

      const result = await accountService.deleteAccount(user.id);
      if (result.success) {
        setShowDeleteModal(false);
        showSuccess(
          t('common.success'),
          t('account.accountDeleted'),
          () => signOut()
        );
        return;
      }

      showError(t('common.error'), result.error || t('errors.generic'));
    } catch (error) {
      console.error('Error deleting account:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      deleteInFlightRef.current = false;
      setDeleting(false);
    }
  }, [deleteReady, showError, showSuccess, signOut, t, user]);

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setShowDeleteModal(false);
    setDeleteConfirmText('');
  }, [deleting]);

  if (!isOnline) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={[styles.iconButton, { borderColor: themeColors.border }]}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {t('settings.accountManagement')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <OfflineScreen
          title={t('offline.accountTitle')}
          message={t('offline.accountMessage')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="person-circle-outline"
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AccountManagementSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  if (!accountStatus) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={[styles.iconButton, { borderColor: themeColors.border }]}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('settings.accountManagement')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ErrorState
          title={t('common.error')}
          message={t('errors.generic')}
          actionLabel={t('common.retry')}
          onAction={() => loadAccountStatus()}
          style={styles.errorState}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={[styles.iconButton, { borderColor: themeColors.border }]}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
          {t('settings.accountManagement')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
        <FadeIn duration={300}>
          <View style={[styles.summaryCard, shadows.sm]}>
            <View style={[styles.summaryIcon, { backgroundColor: themeColors.primaryLight }]}>
              <Ionicons name="shield-checkmark-outline" size={28} color={themeColors.primary} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle} numberOfLines={2}>
                {t('account.accountStatus')}
              </Text>
              <StatusBadge
                label={accountStatus.isVerified ? t('account.verified') : t('account.notVerified')}
                icon={accountStatus.isVerified ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                variant={accountStatus.isVerified ? 'success' : 'warning'}
              />
            </View>
          </View>
        </FadeIn>

        <Stagger delay={70} initialDelay={80}>
          <View style={styles.section}>
            <SectionHeader
              title={t('account.accountStatus')}
              subtitle={t('account.memberSince')}
              icon="shield-outline"
            />
            <View style={styles.card}>
              <StatusRow
                icon={accountStatus.isVerified ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                label={t('account.verified')}
                value={accountStatus.isVerified ? t('account.verified') : t('account.notVerified')}
                accentColor={accountStatus.isVerified ? themeColors.success : themeColors.warning}
                colors={themeColors}
                styles={styles}
              />
              <StatusRow
                icon="calendar-outline"
                label={t('account.memberSince')}
                value={accountStatus.createdAt ? formatShortDate(accountStatus.createdAt, t('common.locale')) : '-'}
                colors={themeColors}
                styles={styles}
              />
              <StatusRow
                icon="time-outline"
                label={t('account.lastSignIn')}
                value={accountStatus.lastSignIn ? formatShortDate(accountStatus.lastSignIn, t('common.locale')) : '-'}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('account.dataManagement')}
              subtitle={t('account.dataManagementDescription')}
              icon="download-outline"
            />
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.86}
              disabled={exporting}
              onPress={handleExportData}
              style={[styles.primaryAction, exporting && styles.disabledAction]}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.primaryActionText}>
                {exporting ? t('common.loading') : t('settings.exportData')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('account.dangerZone')}
              subtitle={t('account.deleteAccountWarning')}
              icon="warning-outline"
            />
            <View style={[styles.dangerCard, { borderColor: themeColors.error }]}>
              <View style={styles.dangerHeader}>
                <View style={[styles.dangerIcon, { backgroundColor: themeColors.errorLight }]}>
                  <Ionicons name="trash-outline" size={22} color={themeColors.error} />
                </View>
                <View style={styles.dangerCopy}>
                  <Text style={[styles.dangerTitle, { color: themeColors.error }]}>
                    {t('account.deleteAccountTitle')}
                  </Text>
                  <Text style={styles.dangerDescription}>
                    {t('account.deleteAccountWarning')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.86}
                disabled={deleting}
                onPress={handleDeleteAccount}
                style={[styles.deleteButton, deleting && styles.disabledAction]}
              >
                <Text style={styles.deleteButtonText}>
                  {deleting ? t('common.loading') : t('settings.deleteAccount')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Stagger>
      </ScrollView>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, shadows.lg]}>
            <View style={[styles.modalIcon, { backgroundColor: themeColors.errorLight }]}>
              <Ionicons name="warning-outline" size={34} color={themeColors.error} />
            </View>
            <Text style={styles.modalTitle}>
              {t('account.deleteAccountConfirm')}
            </Text>
            <Text style={styles.modalMessage}>
              {t('account.typeDeleteToConfirm')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="DELETE"
              placeholderTextColor={themeColors.textTertiary}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={deleting}
                onPress={closeDeleteModal}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={[styles.modalButtonText, { color: themeColors.text }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={deleting || !deleteReady}
                onPress={handleDeleteConfirm}
                style={[
                  styles.modalButton,
                  styles.confirmDeleteButton,
                  (!deleteReady || deleting) && styles.disabledAction,
                ]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                    {t('common.delete')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    height: 56,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 56,
  },
  summaryCopy: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.xs,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.lg * typography.lineHeights.tight,
  },
  section: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  statusRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  statusLabelGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingRight: spacing.md,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 38,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 38,
  },
  statusLabel: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  statusValue: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    textAlign: 'right',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginLeft: spacing.sm,
  },
  dangerCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  dangerHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  dangerIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 42,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 42,
  },
  dangerCopy: {
    flex: 1,
  },
  dangerTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.tight,
  },
  dangerDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 4,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  disabledAction: {
    opacity: 0.55,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
  },
  modalIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 64,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.lg * typography.lineHeights.tight,
    textAlign: 'center',
  },
  modalMessage: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 0,
    marginTop: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    width: '100%',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  cancelButton: {
    backgroundColor: colors.surfaceVariant,
  },
  confirmDeleteButton: {
    backgroundColor: colors.error,
  },
  modalButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  skeletonHeaderSpacer: {
    width: 44,
  },
});
