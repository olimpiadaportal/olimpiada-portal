import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, borderRadius } from '../constants/theme';
import { studentTeacherService, TeacherSearchResult } from '../services/studentTeacherService';
import { referenceDataService } from '../services/referenceDataService';

interface TeacherSearchModalProps {
  visible: boolean;
  subjectId: string;
  subjectName: string;
  onSelect: (teacherId: string) => void;
  onClose: () => void;
}

export const TeacherSearchModal: React.FC<TeacherSearchModalProps> = ({
  visible,
  subjectId,
  subjectName,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [teachers, setTeachers] = useState<TeacherSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [cities, setCities] = useState<Array<{ name: string; name_az: string }>>([]);

  useEffect(() => {
    loadCities();
  }, []);

  useEffect(() => {
    if (visible) {
      searchTeachers('');
    } else {
      setSearchQuery('');
      setTeachers([]);
    }
  }, [visible]);

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const getCityDisplayName = (englishName: string | null): string => {
    if (!englishName) return '';
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  const searchTeachers = async (query: string) => {
    try {
      setLoading(true);
      const results = await studentTeacherService.searchTeachers(query, subjectId, undefined, 20);
      setTeachers(results);
    } catch (error) {
      console.error('Error searching teachers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      searchTeachers(text);
    }, 500);

    setSearchTimeout(timeout);
  };

  const renderTeacherItem = ({ item }: { item: TeacherSearchResult }) => (
    <TouchableOpacity
      style={[styles.teacherItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onSelect(item.teacher_id)}
      activeOpacity={0.7}
    >
      <View style={styles.teacherIcon}>
        {item.teacher_avatar_url ? (
          <Image
            source={{ uri: item.teacher_avatar_url }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="person" size={24} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.teacherDetails}>
        <Text style={[styles.teacherName, { color: colors.text }]}>{item.teacher_name}</Text>
        <View style={styles.teacherMeta}>
          <Ionicons name="location" size={14} color={colors.textSecondary} />
          <Text style={[styles.teacherCity, { color: colors.textSecondary }]}>
            {getCityDisplayName(item.teacher_city)}
          </Text>
        </View>
        <View style={styles.teacherStats}>
          <View style={styles.statBadge}>
            <Ionicons name="book" size={12} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              {item.subject_count} {t('myTeachers.subjects')}
            </Text>
          </View>
          <View style={styles.statBadge}>
            <Ionicons name="people" size={12} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              {item.student_count} {t('myTeachers.students')}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('myTeachers.searchTeacher')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subjectName}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('myTeachers.searchPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearchChange('')}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('myTeachers.searching')}
            </Text>
          </View>
        ) : teachers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('myTeachers.noTeachersFound')}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('myTeachers.tryDifferentSearch')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={teachers}
            renderItem={renderTeacherItem}
            keyExtractor={(item) => item.teacher_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  searchContainer: {
    padding: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  listContent: {
    padding: spacing.md,
  },
  teacherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    gap: spacing.sm,
  },
  teacherIcon: {
    marginRight: spacing.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherDetails: {
    flex: 1,
  },
  teacherName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  teacherMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  teacherCity: {
    fontSize: 12,
  },
  teacherStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
