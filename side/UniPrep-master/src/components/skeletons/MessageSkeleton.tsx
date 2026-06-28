import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { spacing, borderRadius } from '../../constants/theme';

interface MessageSkeletonProps {
  isOwnMessage?: boolean;
}

export const MessageSkeleton: React.FC<MessageSkeletonProps> = ({ isOwnMessage = false }) => {
  return (
    <View style={[styles.container, isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
      {/* Message bubble */}
      <LoadingSkeleton 
        width={isOwnMessage ? 200 : 250} 
        height={60} 
        borderRadius={borderRadius.lg}
      />
      
      {/* Timestamp */}
      <LoadingSkeleton 
        width={50} 
        height={12} 
        style={styles.timestamp}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  timestamp: {
    marginTop: spacing.xs,
  },
});
