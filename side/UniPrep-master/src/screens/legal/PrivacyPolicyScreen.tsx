// Privacy Policy Screen
// Stage 9 - Phase 5
// Dynamically fetches privacy policy from system_settings with fallback to default content

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { typography, spacing } from '../../constants/theme';
import { useAppInfo } from '../../hooks/useAppInfo';
import { supabase } from '../../services/supabase';

interface PrivacySection {
  title: string;
  content: string;
}

export const PrivacyPolicyScreen = () => {
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();
  const { t } = useLanguage();
  const { appName, supportEmail } = useAppInfo();
  const [loading, setLoading] = useState(true);
  const [customPrivacy, setCustomPrivacy] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('January 29, 2026');

  useEffect(() => {
    fetchPrivacy();
  }, []);

  const fetchPrivacy = async () => {
    try {
      // Use maybeSingle() instead of single() to handle case where setting doesn't exist
      const { data, error } = await supabase
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', 'privacy_policy')
        .maybeSingle();

      console.log('📄 Privacy fetch result:', { data, error });

      if (!error && data?.value !== undefined && data?.value !== null) {
        // The value is stored as JSONB
        // Supabase returns JSONB values already parsed
        // But string values in JSONB are stored with quotes, so we need to handle both cases
        let content = data.value;
        
        // If it's a string, check if it's a JSON-encoded string (has surrounding quotes)
        if (typeof content === 'string') {
          // Try to parse if it looks like a JSON string
          if (content.startsWith('"') && content.endsWith('"')) {
            try {
              content = JSON.parse(content);
            } catch (e) {
              // If parsing fails, just remove the quotes
              content = content.slice(1, -1);
            }
          }
          // Also handle escaped newlines
          content = content.replace(/\\n/g, '\n');
        }
        
        // Only set custom privacy if the value is not empty
        // Check for empty string, empty quotes, or whitespace only
        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        if (trimmedContent !== '' && trimmedContent !== '""') {
          console.log('📄 Setting custom privacy:', trimmedContent.substring(0, 100) + '...');
          setCustomPrivacy(trimmedContent);
          if (data.updated_at) {
            setLastUpdated(new Date(data.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }));
          }
        } else {
          console.log('📄 Privacy content is empty, using defaults');
        }
      }
    } catch (error) {
      console.log('Using default privacy policy:', error);
    } finally {
      setLoading(false);
    }
  };

  const defaultSections: PrivacySection[] = [
    {
      title: t('legal.privacy.infoCollect', '1. Information We Collect'),
      content: t('legal.privacy.infoCollectContent', 'We collect information you provide directly to us, including your name, email address, phone number, and academic information when you create an account.')
    },
    {
      title: t('legal.privacy.howWeUse', '2. How We Use Your Information'),
      content: t('legal.privacy.howWeUseContent', 'We use the information we collect to provide, maintain, and improve our services, including to personalize your learning experience and track your progress.')
    },
    {
      title: t('legal.privacy.infoSharing', '3. Information Sharing'),
      content: t('legal.privacy.infoSharingContent', 'We do not share your personal information with third parties except as described in this policy. We may share anonymized data for analytics purposes.')
    },
    {
      title: t('legal.privacy.dataSecurity', '4. Data Security'),
      content: t('legal.privacy.dataSecurityContent', 'We take reasonable measures to protect your information from unauthorized access, use, or disclosure. However, no internet transmission is completely secure.')
    },
    {
      title: t('legal.privacy.aiFeatures', '5. AI Features'),
      content: t('legal.privacy.aiFeaturesContent', `${appName} uses artificial intelligence to provide personalized insights, explanations, and study recommendations. Your study data may be processed by AI systems to improve your learning experience. AI-generated content is for educational purposes only.`)
    },
    {
      title: t('legal.privacy.yourRights', '6. Your Rights'),
      content: t('legal.privacy.yourRightsContent', 'You have the right to access, update, or delete your personal information at any time. You can also export your data or delete your account from the app settings.')
    },
    {
      title: t('legal.privacy.cookies', '7. Cookies and Tracking'),
      content: t('legal.privacy.cookiesContent', 'We use cookies and similar tracking technologies to track activity on our service and hold certain information to improve user experience.')
    },
    {
      title: t('legal.privacy.children', "8. Children's Privacy"),
      content: t('legal.privacy.childrenContent', 'Our service is intended for users aged 13 and above. We do not knowingly collect information from children under 13.')
    },
    {
      title: t('legal.privacy.changes', '9. Changes to This Policy'),
      content: t('legal.privacy.changesContent', 'We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.')
    },
    {
      title: t('legal.privacy.contact', '10. Contact Us'),
      content: t('legal.privacy.contactContent', `If you have any questions about this Privacy Policy, please contact us at ${supportEmail}`)
    }
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>
          {t('legal.privacyPolicy')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
          <Text style={[styles.lastUpdated, { color: themeColors.textSecondary }]}>
            {t('legal.lastUpdated')}: {lastUpdated}
          </Text>

          {customPrivacy ? (
            <Text style={[styles.paragraph, { color: themeColors.textSecondary }]}>
              {customPrivacy}
            </Text>
          ) : (
            defaultSections.map((section, index) => (
              <View key={index}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  {section.title}
                </Text>
                <Text style={[styles.paragraph, { color: themeColors.textSecondary }]}>
                  {section.content}
                </Text>
              </View>
            ))
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  lastUpdated: {
    fontSize: typography.fontSizes.xs,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontSize: typography.fontSizes.sm,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
});
