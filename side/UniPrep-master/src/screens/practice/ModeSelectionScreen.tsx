import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { ActionCard, ScreenShell, SectionHeader } from '../../components/ui';
import { FadeIn } from '../../components/animated';

export const ModeSelectionScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { flags } = useFeatureFlags();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const handleModeSelect = (mode: 'standard' | 'competitive') => {
    if (mode === 'standard') {
      navigation.navigate('SubjectsList' as never);
    } else {
      navigation.navigate('CompetitiveMode' as never);
    }
  };

  return (
    <ScreenShell contentStyle={styles.content}>
      <SectionHeader
        title={t('practice.title')}
        subtitle={t('practice.modeSelection.subtitle')}
        style={styles.header}
      />

      <View style={styles.modeList}>
        <FadeIn delay={100}>
          <ActionCard
            title={t('practice.modeSelection.standardMode')}
            description={t('practice.modeSelection.standardModeDesc')}
            icon="book-outline"
            accentColor="#6366F1"
            onPress={() => handleModeSelect('standard')}
          />
        </FadeIn>

        {flags.competitive_mode && (
          <FadeIn delay={180}>
            <ActionCard
              title={t('practice.modeSelection.competitiveMode')}
              description={t('practice.modeSelection.competitiveModeDesc')}
              icon="trophy-outline"
              accentColor="#F59E0B"
              onPress={() => handleModeSelect('competitive')}
            />
          </FadeIn>
        )}
      </View>
    </ScreenShell>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    content: {
      paddingTop: 20,
    },
    header: {
      marginBottom: 16,
    },
    modeList: {
      gap: 16,
    },
  });
