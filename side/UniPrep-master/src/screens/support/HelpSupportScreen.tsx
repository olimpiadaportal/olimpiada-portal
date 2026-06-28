import React, { useCallback, useMemo, useState } from 'react';
import {
  Linking,
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
import { useTheme } from '../../contexts/ThemeContext';
import { SelectionModal } from '../../components/SelectionModal';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { SectionHeader, StatusBadge } from '../../components/ui';
import { EmptyState } from '../../components/EmptyState';
import { FadeIn, Stagger } from '../../components/animated';
import { useAppInfo } from '../../hooks/useAppInfo';

interface FAQItem {
  question: string;
  answer: string;
}

type ContactOption = {
  label: string;
  value: string;
  icon: string;
};

const openExternalUrl = async (url: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error('Error opening support link:', error);
  }
};

export const HelpSupportScreen = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { colors: themeColors, shadows } = useTheme();
  const { supportEmail, supportPhone } = useAppInfo();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [showFeatureModal, setShowFeatureModal] = useState(false);

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const faqItems = useMemo(
    () => (t('help.faqQuestions', { returnObjects: true }) as FAQItem[]) || [],
    [t]
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredFAQ = useMemo(() => {
    if (!normalizedQuery) return faqItems;

    return faqItems.filter((item) =>
      item.question.toLowerCase().includes(normalizedQuery) ||
      item.answer.toLowerCase().includes(normalizedQuery)
    );
  }, [faqItems, normalizedQuery]);

  const contactOptions = useMemo<ContactOption[]>(() => {
    const options: ContactOption[] = [
      { label: t('help.email'), value: 'email', icon: 'mail' },
    ];

    if (supportPhone && !supportPhone.includes('XX')) {
      options.push({ label: t('help.phone'), value: 'phone', icon: 'call' });
    }

    return options;
  }, [supportPhone, t]);

  const handleContactMethod = useCallback((method: string) => {
    if (method === 'email') {
      openExternalUrl(`mailto:${supportEmail}`);
    } else if (method === 'phone' && supportPhone && !supportPhone.includes('XX')) {
      openExternalUrl(`tel:${supportPhone}`);
    }
  }, [supportEmail, supportPhone]);

  const handleBugReport = useCallback((method: string) => {
    if (method === 'email') {
      openExternalUrl(`mailto:${supportEmail}?subject=${encodeURIComponent('Bug Report')}`);
    }
  }, [supportEmail]);

  const handleFeatureSubmit = useCallback((method: string) => {
    if (method === 'email') {
      openExternalUrl(`mailto:${supportEmail}?subject=${encodeURIComponent('Feature Request')}`);
    }
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
          {t('help.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <FadeIn duration={300}>
          <View style={[styles.heroCard, shadows.sm]}>
            <View style={[styles.heroIcon, { backgroundColor: themeColors.primaryLight }]}>
              <Ionicons name="help-buoy-outline" size={30} color={themeColors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {t('help.heroTitle')}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={3}>
                {t('help.heroSubtitle')}
              </Text>
              <StatusBadge
                label={supportEmail}
                icon="mail-outline"
                variant="info"
                style={styles.emailBadge}
              />
            </View>
          </View>
        </FadeIn>

        <View style={styles.searchWrap}>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color={themeColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('help.searchFAQ')}
              placeholderTextColor={themeColors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={t('help.faq')}
            subtitle={t('help.faqSubtitle')}
            icon="chatbubbles-outline"
          />

          {filteredFAQ.length > 0 ? (
            <Stagger delay={45} initialDelay={60}>
              {filteredFAQ.map((item, index) => {
                const expanded = expandedIndex === index;
                return (
                  <TouchableOpacity
                    key={`${item.question}-${index}`}
                    accessibilityRole="button"
                    activeOpacity={0.86}
                    style={[styles.faqItem, shadows.sm]}
                    onPress={() => setExpandedIndex(expanded ? null : index)}
                  >
                    <View style={styles.faqHeader}>
                      <Text style={styles.faqQuestion} numberOfLines={expanded ? 4 : 2}>
                        {item.question}
                      </Text>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={themeColors.textSecondary}
                      />
                    </View>
                    {expanded ? (
                      <Text style={styles.faqAnswer}>
                        {item.answer}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </Stagger>
          ) : (
            <EmptyState
              title={t('help.noResults')}
              description={t('help.noResultsDescription', { query: searchQuery })}
              icon="search-outline"
              style={styles.emptyState}
            />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={t('help.contactUs')}
            subtitle={t('help.contactSubtitle')}
            icon="mail-open-outline"
          />

          <Stagger delay={60} initialDelay={80}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.86}
              style={[styles.contactCard, shadows.sm]}
              onPress={() => setShowContactModal(true)}
            >
              <View style={[styles.contactIcon, { backgroundColor: themeColors.primaryLight }]}>
                <Ionicons name="mail-outline" size={22} color={themeColors.primary} />
              </View>
              <Text style={styles.contactText} numberOfLines={2}>
                {t('help.contactSupport')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={themeColors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.86}
              style={[styles.contactCard, shadows.sm]}
              onPress={() => setShowBugModal(true)}
            >
              <View style={[styles.contactIcon, { backgroundColor: themeColors.errorLight }]}>
                <Ionicons name="bug-outline" size={22} color={themeColors.error} />
              </View>
              <Text style={styles.contactText} numberOfLines={2}>
                {t('help.reportBug')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={themeColors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.86}
              style={[styles.contactCard, shadows.sm]}
              onPress={() => setShowFeatureModal(true)}
            >
              <View style={[styles.contactIcon, { backgroundColor: themeColors.warningLight }]}>
                <Ionicons name="bulb-outline" size={22} color={themeColors.warning} />
              </View>
              <Text style={styles.contactText} numberOfLines={2}>
                {t('help.featureRequest')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={themeColors.textTertiary} />
            </TouchableOpacity>
          </Stagger>
        </View>
      </ScrollView>

      <SelectionModal
        visible={showContactModal}
        onClose={() => setShowContactModal(false)}
        title={t('help.contactSupportTitle')}
        options={contactOptions}
        onSelect={handleContactMethod}
      />

      <SelectionModal
        visible={showBugModal}
        onClose={() => setShowBugModal(false)}
        title={t('help.reportBugTitle')}
        options={[{ label: t('help.sendEmail'), value: 'email', icon: 'mail' }]}
        onSelect={handleBugReport}
      />

      <SelectionModal
        visible={showFeatureModal}
        onClose={() => setShowFeatureModal(false)}
        title={t('help.featureRequestTitle')}
        options={[{ label: t('help.sendEmail'), value: 'email', icon: 'mail' }]}
        onSelect={handleFeatureSubmit}
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
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    height: 58,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 58,
  },
  heroCopy: {
    alignItems: 'flex-start',
    flex: 1,
  },
  heroTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.lg * typography.lineHeights.tight,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 4,
  },
  emailBadge: {
    marginTop: spacing.sm,
    maxWidth: '100%',
  },
  searchWrap: {
    marginBottom: spacing.lg,
  },
  searchContainer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.md,
    marginLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
  section: {
    marginBottom: spacing.lg,
  },
  faqItem: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  faqHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  faqQuestion: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
  faqAnswer: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.sm,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 0,
  },
  contactCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    minHeight: 68,
    padding: spacing.md,
  },
  contactIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 42,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 42,
  },
  contactText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
  },
});
