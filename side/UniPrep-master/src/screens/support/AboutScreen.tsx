import React, { useCallback, useMemo } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { SectionHeader, StatusBadge } from '../../components/ui';
import { FadeIn, Stagger } from '../../components/animated';
import { useAppInfo } from '../../hooks/useAppInfo';

type IconName = keyof typeof Ionicons.glyphMap;

type ActionRowProps = {
  icon: IconName;
  title: string;
  onPress: () => void;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  accentColor?: string;
};

const openExternalUrl = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error('Error opening about link:', error);
  }
};

const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  title,
  onPress,
  colors,
  styles: themedStyles,
  accentColor,
}) => {
  const color = accentColor ?? colors.primary;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.86}
      onPress={onPress}
      style={[themedStyles.actionRow, { borderBottomColor: colors.border }]}
    >
      <View style={[themedStyles.actionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[themedStyles.actionTitle, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
};

export const AboutScreen = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { colors: themeColors, shadows } = useTheme();
  const { appName, appVersion, supportEmail, websiteUrl } = useAppInfo();

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const handleRateApp = useCallback(() => {
    openExternalUrl('https://play.google.com/store/apps/details?id=com.elmly.app');
  }, []);

  const handleShareApp = useCallback(async () => {
    try {
      await Share.share({
        message: t('about.shareMessage', { appName, websiteUrl }),
        title: appName,
      });
    } catch (error) {
      console.error('Error sharing app:', error);
    }
  }, [appName, t, websiteUrl]);

  const handleOpenWebsite = useCallback(() => {
    openExternalUrl(websiteUrl);
  }, [websiteUrl]);

  const handleSendEmail = useCallback(() => {
    openExternalUrl(`mailto:${supportEmail}`);
  }, [supportEmail]);

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
          {t('about.title', { appName })}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn duration={320}>
          <View style={[styles.productCard, shadows.sm]}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.appIconImage}
              resizeMode="contain"
            />
            <View style={styles.productCopy}>
              <Text style={styles.appName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                {appName}
              </Text>
              <Text style={styles.description}>
                {t('about.description')}
              </Text>
              <StatusBadge
                label={`${t('about.version')} ${appVersion}`}
                icon="information-circle-outline"
                variant="info"
                style={styles.versionBadge}
              />
            </View>
          </View>
        </FadeIn>

        <Stagger delay={70} initialDelay={90}>
          <View style={styles.section}>
            <SectionHeader
              title={t('about.productInfo')}
              subtitle={t('about.tagline')}
              icon="sparkles-outline"
            />
            <View style={[styles.card, shadows.sm]}>
              <ActionRow
                icon="star-outline"
                title={t('about.rateApp')}
                onPress={handleRateApp}
                colors={themeColors}
                styles={styles}
                accentColor={themeColors.warning}
              />
              <ActionRow
                icon="share-social-outline"
                title={t('about.shareApp')}
                onPress={handleShareApp}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('about.contact')}
              subtitle={t('about.contactSubtitle')}
              icon="at-outline"
            />
            <View style={[styles.card, shadows.sm]}>
              <ActionRow
                icon="globe-outline"
                title={t('about.website')}
                onPress={handleOpenWebsite}
                colors={themeColors}
                styles={styles}
              />
              <ActionRow
                icon="mail-outline"
                title={t('about.email')}
                onPress={handleSendEmail}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title={t('about.legal')}
              subtitle={t('about.legalSubtitle')}
              icon="shield-checkmark-outline"
            />
            <View style={[styles.card, shadows.sm]}>
              <ActionRow
                icon="shield-checkmark-outline"
                title={t('legal.privacyPolicy')}
                onPress={() => navigation.navigate('PrivacyPolicy' as never)}
                colors={themeColors}
                styles={styles}
              />
              <ActionRow
                icon="document-text-outline"
                title={t('legal.termsOfService')}
                onPress={() => navigation.navigate('TermsOfService' as never)}
                colors={themeColors}
                styles={styles}
              />
            </View>
          </View>
        </Stagger>

        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={2}>
            {t('about.madeWithLove')}
          </Text>
          <Text style={styles.footerText} numberOfLines={2}>
            © {new Date().getFullYear()} {appName}. {t('about.allRightsReserved')}
          </Text>
        </View>
      </ScrollView>
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
  productCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  appIconImage: {
    borderRadius: 18,
    height: 82,
    marginRight: spacing.md,
    width: 82,
  },
  productCopy: {
    alignItems: 'flex-start',
    flex: 1,
  },
  appName: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.xxl * typography.lineHeights.tight,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 4,
    flexShrink: 1,
  },
  versionBadge: {
    marginTop: spacing.sm,
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
  actionRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 38,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 38,
  },
  actionTitle: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    paddingRight: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.fontSizes.xs * typography.lineHeights.normal,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
});
