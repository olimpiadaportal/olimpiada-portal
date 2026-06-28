import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export type PracticeMode = 'standard' | 'competitive';

interface ModeSelectorProps {
  selectedMode: PracticeMode;
  onModeChange: (mode: PracticeMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Standard Mode */}
      <TouchableOpacity
        style={[
          styles.modeButton,
          selectedMode === 'standard' && styles.modeButtonActive,
        ]}
        onPress={() => onModeChange('standard')}
        activeOpacity={0.7}
      >
        <View style={styles.modeIconContainer}>
          <Ionicons
            name="book-outline"
            size={28}
            color={selectedMode === 'standard' ? '#6366F1' : colors.textSecondary}
          />
        </View>
        <Text
          style={[
            styles.modeTitle,
            selectedMode === 'standard' && styles.modeTitleActive,
          ]}
        >
          Standard Mode
        </Text>
        <Text style={styles.modeDescription}>
          Practice with database questions
        </Text>
        {selectedMode === 'standard' && (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#6366F1" />
          </View>
        )}
      </TouchableOpacity>

      {/* Competitive Mode */}
      <TouchableOpacity
        style={[
          styles.modeButton,
          selectedMode === 'competitive' && styles.modeButtonActive,
        ]}
        onPress={() => onModeChange('competitive')}
        activeOpacity={0.7}
      >
        <View style={styles.modeIconContainer}>
          <Ionicons
            name="trophy-outline"
            size={28}
            color={selectedMode === 'competitive' ? '#6366F1' : colors.textSecondary}
          />
        </View>
        <Text
          style={[
            styles.modeTitle,
            selectedMode === 'competitive' && styles.modeTitleActive,
          ]}
        >
          Competitive Mode
        </Text>
        <Text style={styles.modeDescription}>
          AI-generated questions
        </Text>
        {selectedMode === 'competitive' && (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#6366F1" />
          </View>
        )}
        {/* Coming Soon Badge */}
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    modeButton: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      position: 'relative',
    },
    modeButtonActive: {
      borderColor: '#6366F1',
      backgroundColor: colors.isDark ? '#1E1B4B' : '#EEF2FF',
    },
    modeIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    modeTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    modeTitleActive: {
      color: '#6366F1',
    },
    modeDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    activeBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
    },
    comingSoonBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      backgroundColor: '#F59E0B',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    comingSoonText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
