import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { referenceDataService, City } from '../services/referenceDataService';
import { colors as staticColors, typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface CityPickerProps {
  label: string;
  value: string;
  onChange: (city: string) => void;
  error?: string;
  required?: boolean;
}

export const CityPicker: React.FC<CityPickerProps> = ({
  label,
  value,
  onChange,
  error,
  required = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    try {
      setLoading(true);
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCities = cities.filter(city => 
    city.name_az.toLowerCase().includes(searchQuery.toLowerCase()) ||
    city.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const majorCities = cities.filter(city => 
    ['Bakı', 'Gəncə', 'Sumqayıt', 'Mingəçevir', 'Lənkəran'].includes(city.name_az)
  );

  const handleSelect = (cityName: string) => {
    // Save English name to database for consistent matching
    onChange(cityName);
    setModalVisible(false);
    setSearchQuery('');
  };

  // Get display name (Azerbaijani) from English name
  const getDisplayName = (englishName: string): string => {
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>

      <TouchableOpacity
        style={[styles.picker, error && styles.pickerError]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.pickerText, !value && styles.placeholder]}>
          {value ? getDisplayName(value) : t('auth.signUp.cityPlaceholder')}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('cityPicker.title')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={20}
                color={colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder={t('cityPicker.searchPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>

            {searchQuery === '' && !loading && (
              <View style={styles.majorCitiesContainer}>
                <Text style={styles.sectionTitle}>{t('cityPicker.majorCities')}</Text>
                <View style={styles.majorCitiesGrid}>
                  {majorCities.map(city => (
                    <TouchableOpacity
                      key={city.id}
                      style={[
                        styles.majorCityChip,
                        value === city.name && styles.majorCityChipSelected,
                      ]}
                      onPress={() => handleSelect(city.name)}
                    >
                      <Text
                        style={[
                          styles.majorCityText,
                          value === city.name && styles.majorCityTextSelected,
                        ]}
                      >
                        {city.name_az}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionTitle}>{t('cityPicker.allCities')}</Text>
              </View>
            )}

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>{t('cityPicker.loading')}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCities}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.cityItem,
                    value === item.name && styles.cityItemSelected,
                  ]}
                  onPress={() => handleSelect(item.name)}
                >
                  <Text
                    style={[
                      styles.cityItemText,
                      value === item.name && styles.cityItemTextSelected,
                    ]}
                  >
                    {item.name_az}
                  </Text>
                  {value === item.name && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{t('cityPicker.noResults')}</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.disabled,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pickerError: {
    borderColor: colors.error,
  },
  pickerText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    flex: 1,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typography.fontSizes.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '600',
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  majorCitiesContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  majorCitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  majorCityChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  majorCityChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  majorCityText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: '500',
  },
  majorCityTextSelected: {
    color: '#FFFFFF',
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cityItemSelected: {
    backgroundColor: colors.surface,
  },
  cityItemText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  cityItemTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
