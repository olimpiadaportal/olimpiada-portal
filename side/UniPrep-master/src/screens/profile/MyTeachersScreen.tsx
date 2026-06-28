import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { FadeIn } from '../../components/animated';
import { studentTeacherService, StudentTeacher } from '../../services/studentTeacherService';
import { TeacherSearchModal } from '../../components/TeacherSearchModal';
import { useAlert } from '../../components/AlertProvider';

interface MyTeachersScreenProps {
  route: {
    params: {
      studentId: string;
    };
  };
}

export const MyTeachersScreen: React.FC<MyTeachersScreenProps> = ({ route }) => {
  const { studentId } = route.params;
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<StudentTeacher[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string } | null>(null);
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [teachersData, subjectsData] = await Promise.all([
        studentTeacherService.getStudentTeachers(studentId),
        studentTeacherService.getStudentSubjects(studentId),
      ]);
      setTeachers(teachersData);
      setSubjects(subjectsData);
    } catch (error) {
      console.error('Error loading teachers:', error);
      showError(t('common.error'), t('myTeachers.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTeacher = (subject: { id: string; name: string }) => {
    setSelectedSubject(subject);
    setSearchModalVisible(true);
  };

  const handleTeacherSelected = async (teacherId: string) => {
    if (!selectedSubject) return;

    try {
      await studentTeacherService.assignTeacher(studentId, selectedSubject.id, teacherId);
      showSuccess(t('myTeachers.success'), t('myTeachers.teacherAssigned'));
      await loadData();
      setSearchModalVisible(false);
    } catch (error) {
      console.error('Error assigning teacher:', error);
      showError(t('common.error'), t('myTeachers.assignError'));
    }
  };

  const handleRemoveTeacher = (subjectId: string, subjectName: string) => {
    showConfirm(
      t('myTeachers.confirmRemove'),
      t('myTeachers.confirmRemoveMessage', { subject: subjectName }),
      async () => {
        try {
          await studentTeacherService.removeTeacher(studentId, subjectId);
          showSuccess(t('myTeachers.success'), t('myTeachers.teacherRemoved'));
          await loadData();
        } catch (error) {
          console.error('Error removing teacher:', error);
          showError(t('common.error'), t('myTeachers.removeError'));
        }
      },
      undefined,
      t('myTeachers.remove'),
      t('common.cancel')
    );
  };

  const getTeacherForSubject = (subjectId: string) => {
    return teachers.find((t) => t.subject_id === subjectId);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('myTeachers.title')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id}
        renderItem={({ item: subject, index }) => {
          const teacher = getTeacherForSubject(subject.id);
          return (
            <FadeIn delay={index * 80}>
            <View
              style={[styles.subjectCard, { backgroundColor: colors.surface }]}
            >
              <View style={styles.subjectHeader}>
                <View style={styles.subjectTitleRow}>
                  <Ionicons name="book" size={20} color={colors.primary} />
                  <Text style={[styles.subjectName, { color: colors.text }]}>
                    {subject.name}
                  </Text>
                </View>
              </View>

              {teacher ? (
                <View style={styles.teacherInfo}>
                  <View style={styles.teacherDetails}>
                    <Ionicons name="person" size={16} color={colors.textSecondary} />
                    <Text style={[styles.teacherName, { color: colors.text }]}>
                      {teacher.teacher_name}
                    </Text>
                  </View>
                  <View style={styles.teacherDetails}>
                    <Ionicons name="location" size={14} color={colors.textSecondary} />
                    <Text style={[styles.teacherCity, { color: colors.textSecondary }]}>
                      {teacher.teacher_city}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveTeacher(subject.id, subject.name)}
                    style={[styles.removeButton, { backgroundColor: colors.error + '20' }]}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.error} />
                    <Text style={[styles.removeButtonText, { color: colors.error }]}>
                      {t('myTeachers.remove')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => handleAssignTeacher(subject)}
                  style={[styles.assignButton, { borderColor: colors.primary }]}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={[styles.assignButtonText, { color: colors.primary }]}>
                    {t('myTeachers.assignTeacher')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            </FadeIn>
          );
        }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('myTeachers.noSubjects')}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Teacher Search Modal */}
      <TeacherSearchModal
        visible={searchModalVisible}
        subjectId={selectedSubject?.id || ''}
        subjectName={selectedSubject?.name || ''}
        onClose={() => setSearchModalVisible(false)}
        onSelect={handleTeacherSelected}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  subjectCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subjectHeader: {
    marginBottom: spacing.md,
  },
  subjectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
  },
  teacherInfo: {
    gap: spacing.xs,
  },
  teacherDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '500',
  },
  teacherCity: {
    fontSize: 13,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  assignButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
