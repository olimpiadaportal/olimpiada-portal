import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useWalkthrough } from '../../contexts/WalkthroughContext';

export interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  /** Optional nativeID for walkthrough targeting */
  nativeID?: string;
}

interface QuickActionsGridProps {
  actions?: QuickAction[];
  /** Optional nativeID for the container (walkthrough targeting) */
  nativeID?: string;
}

const defaultActions: QuickAction[] = [
  {
    id: 'practice',
    title: 'Start Practice',
    icon: 'school',
    color: '#3B82F6',
    onPress: () => {},
  },
  {
    id: 'exam',
    title: 'Take Exam',
    icon: 'document-text',
    color: '#8B5CF6',
    onPress: () => {},
  },
  {
    id: 'teachers',
    title: 'Find Teachers',
    icon: 'people',
    color: '#10B981',
    onPress: () => {},
  },
  {
    id: 'progress',
    title: 'View Progress',
    icon: 'stats-chart',
    color: '#F59E0B',
    onPress: () => {},
  },
];

// Individual action button with walkthrough registration
const ActionButton: React.FC<{
  action: QuickAction;
  colors: any;
  registerTarget: (id: string, ref: React.RefObject<any>) => void;
  unregisterTarget: (id: string) => void;
}> = ({ action, colors, registerTarget, unregisterTarget }) => {
  const buttonRef = useRef<View>(null);

  // Register on mount, unregister on unmount
  useEffect(() => {
    if (action.nativeID) {
      // Register immediately - the ref will be populated by React
      registerTarget(action.nativeID, buttonRef);
    }
    return () => {
      if (action.nativeID) {
        unregisterTarget(action.nativeID);
      }
    };
  }, [action.nativeID, registerTarget, unregisterTarget]);

  return (
    <View style={{ width: '48%' }}>
      <View
        ref={buttonRef}
        style={[
          styles.actionButton,
          { backgroundColor: action.color + '15' },
        ]}
        collapsable={false}
      >
        <TouchableOpacity
          style={styles.actionButtonInner}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: action.color + '20' }]}>
            <Ionicons name={action.icon} size={28} color={action.color} />
          </View>
          <Text style={[styles.actionTitle, { color: colors.text }]}>
            {action.title}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({ 
  actions = defaultActions,
  nativeID,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { registerTarget, unregisterTarget } = useWalkthrough();
  const containerRef = useRef<View>(null);

  // Register the container for walkthrough
  useEffect(() => {
    if (nativeID) {
      // Register immediately - the ref will be populated by React
      registerTarget(nativeID, containerRef);
    }
    return () => {
      if (nativeID) {
        unregisterTarget(nativeID);
      }
    };
  }, [nativeID, registerTarget, unregisterTarget]);

  return (
    <View 
      ref={containerRef}
      style={[styles.container, { backgroundColor: colors.card }]}
      collapsable={false}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {t('home.quickActionsTitle')}
      </Text>
      
      <View style={styles.grid}>
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            colors={colors}
            registerTarget={registerTarget}
            unregisterTarget={unregisterTarget}
          />
        ))}
      </View>
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '100%',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  actionButtonInner: {
    width: '100%',
    padding: spacing.md,
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
