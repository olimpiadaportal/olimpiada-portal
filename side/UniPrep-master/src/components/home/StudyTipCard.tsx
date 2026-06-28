import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { motivationService, StudyTip } from '../../services/motivationService';

interface StudyTipCardProps {
  onRefresh?: () => void;
}

export const StudyTipCard: React.FC<StudyTipCardProps> = ({ onRefresh }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [tip, setTip] = useState<StudyTip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTip();
  }, []);

  const loadTip = async () => {
    setLoading(true);
    try {
      const dailyTip = await motivationService.getDailyTip();
      setTip(dailyTip);
    } catch (error) {
      console.error('Load tip error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadTip();
    onRefresh?.();
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'motivation':
        return '#F59E0B';
      case 'technique':
        return '#3B82F6';
      case 'health':
        return '#10B981';
      case 'time-management':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'motivation':
        return 'Motivation';
      case 'technique':
        return 'Study Technique';
      case 'health':
        return 'Health & Wellness';
      case 'time-management':
        return 'Time Management';
      default:
        return 'Tip';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!tip) {
    return null;
  }

  const categoryColor = getCategoryColor(tip.category);

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: categoryColor + '20' }]}>
            <Text style={styles.iconText}>{tip.icon}</Text>
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('home.components.studyTip.title')}
            </Text>
            <Text style={[styles.category, { color: categoryColor }]}>
              {getCategoryLabel(tip.category)}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity 
          onPress={handleRefresh}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.tipText, { color: colors.text }]}>
        {tip.tip}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loadingContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  category: {
    fontSize: 12,
    fontWeight: '500',
  },
  refreshButton: {
    padding: spacing.sm,
  },
  tipText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
