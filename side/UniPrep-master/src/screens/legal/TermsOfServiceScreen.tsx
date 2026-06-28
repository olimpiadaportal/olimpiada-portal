// Terms of Service Screen
// Stage 9 - Phase 5
// Dynamically fetches terms from system_settings with fallback to default content

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

interface TermsSection {
  title: string;
  content: string;
}

export const TermsOfServiceScreen = () => {
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();
  const { t } = useLanguage();
  const { appName, supportEmail } = useAppInfo();
  const [loading, setLoading] = useState(true);
  const [customTerms, setCustomTerms] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('January 29, 2026');

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      // Use maybeSingle() instead of single() to handle case where setting doesn't exist
      const { data, error } = await supabase
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', 'terms_of_service')
        .maybeSingle();

      console.log('📄 Terms fetch result:', { data, error });

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
        
        // Only set custom terms if the value is not empty
        // Check for empty string, empty quotes, or whitespace only
        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        if (trimmedContent !== '' && trimmedContent !== '""') {
          console.log('📄 Setting custom terms:', trimmedContent.substring(0, 100) + '...');
          setCustomTerms(trimmedContent);
          if (data.updated_at) {
            setLastUpdated(new Date(data.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }));
          }
        } else {
          console.log('📄 Terms content is empty, using defaults');
        }
      }
    } catch (error) {
      console.log('Using default terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const defaultSections: TermsSection[] = [
    {
      title: t('legal.terms.acceptance', '1. Acceptance of Terms'),
      content: t('legal.terms.acceptanceContent', `By accessing and using ${appName}, you accept and agree to be bound by the terms and provision of this agreement.`)
    },
    {
      title: t('legal.terms.useLicense', '2. Use License'),
      content: t('legal.terms.useLicenseContent', `Permission is granted to temporarily use ${appName} for personal, non-commercial use only. This is the grant of a license, not a transfer of title.`)
    },
    {
      title: t('legal.terms.userAccount', '3. User Account'),
      content: t('legal.terms.userAccountContent', 'You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.')
    },
    {
      title: t('legal.terms.prohibitedUses', '4. Prohibited Uses'),
      content: t('legal.terms.prohibitedUsesContent', `You may not use ${appName} for any illegal purpose or to violate any laws. You may not attempt to gain unauthorized access to any portion of the app.`)
    },
    {
      title: t('legal.terms.contentOwnership', '5. Content Ownership'),
      content: t('legal.terms.contentOwnershipContent', `All content provided through ${appName}, including questions, explanations, and study materials, is the property of ${appName} or its content suppliers and is protected by copyright laws.`)
    },
    {
      title: t('legal.terms.aiFeatures', '6. AI Features'),
      content: t('legal.terms.aiFeaturesContent', `The app uses artificial intelligence to provide personalized insights and explanations. While we strive for accuracy, AI-generated content is provided for educational purposes and should not be considered as professional advice.`)
    },
    {
      title: t('legal.terms.disclaimer', '7. Disclaimer'),
      content: t('legal.terms.disclaimerContent', `The materials on ${appName} are provided on an 'as is' basis. ${appName} makes no warranties, expressed or implied, and hereby disclaims all other warranties.`)
    },
    {
      title: t('legal.terms.limitations', '8. Limitations'),
      content: t('legal.terms.limitationsContent', `In no event shall ${appName} or its suppliers be liable for any damages arising out of the use or inability to use the materials on ${appName}.`)
    },
    {
      title: t('legal.terms.modifications', '9. Modifications'),
      content: t('legal.terms.modificationsContent', `${appName} may revise these terms of service at any time without notice. By using this app, you are agreeing to be bound by the current version of these terms.`)
    },
    {
      title: t('legal.terms.governingLaw', '10. Governing Law'),
      content: t('legal.terms.governingLawContent', 'These terms and conditions are governed by and construed in accordance with the laws of Azerbaijan.')
    },
    {
      title: t('legal.terms.contact', '11. Contact Information'),
      content: t('legal.terms.contactContent', `If you have any questions about these Terms of Service, please contact us at ${supportEmail}`)
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
          {t('legal.termsOfService')}
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

          {customTerms ? (
            <Text style={[styles.paragraph, { color: themeColors.textSecondary }]}>
              {customTerms}
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
