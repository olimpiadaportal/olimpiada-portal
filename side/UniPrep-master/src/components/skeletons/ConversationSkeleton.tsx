import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../constants/theme';

export const ConversationSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Avatar */}
      <LoadingSkeleton 
        width={56} 
        height={56} 
        borderRadius={28}
        style={styles.avatar}
      />
      
      <View style={styles.content}>
        {/* Name */}
        <LoadingSkeleton 
          width="60%" 
          height={18} 
          style={styles.name}
        />
        
        {/* Last message */}
        <LoadingSkeleton 
          width="80%" 
          height={14} 
          style={styles.message}
        />
      </View>
      
      {/* Time and badge */}
      <View style={styles.rightSection}>
        <LoadingSkeleton width={40} height={12} style={styles.time} />
        <LoadingSkeleton width={20} height={20} borderRadius={10} style={styles.badge} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  avatar: {
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    marginBottom: spacing.xs,
  },
  message: {
    marginTop: spacing.xs,
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 56,
    paddingVertical: spacing.xs,
  },
  time: {
    marginBottom: spacing.xs,
  },
  badge: {
    marginTop: spacing.xs,
  },
});
