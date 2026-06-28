import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, borderRadius } from '../constants/theme';
import { studentTeacherService, StudentTeacher } from '../services/studentTeacherService';
import { TeacherSearchModal } from './TeacherSearchModal';

interface MyTeachersSectionProps {
  studentId: string;
}

export const MyTeachersSection: React.FC<MyTeachersSectionProps> = ({ studentId }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [teachers, setTeachers] = useState<StudentTeacher[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [studentId]);

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
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTeacher = (subjectId: string, subjectName: string) => {
    setSelectedSubject({ id: subjectId, name: subjectName });
    setSearchModalVisible(true);
  };

  const handleTeacherSelected = async (teacherId: string) => {
    if (!selectedSubject) return;

    try {
      await studentTeacherService.assignTeacher(studentId, selectedSubject.id, teacherId);
      Alert.alert(t('myTeachers.success'), t('myTeachers.teacherAssigned'));
      loadData();
      setSearchModalVisible(false);
    } catch (error) {
      console.error('Error assigning teacher:', error);
      Alert.alert(t('common.error'), t('myTeachers.assignError'));
    }
  };

  const handleRemoveTeacher = (subjectId: string, subjectName: string) => {
    Alert.alert(
      t('myTeachers.confirmRemove'),
      t('myTeachers.confirmRemoveMessage', { subject: subjectName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('myTeachers.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await studentTeacherService.removeTeacher(studentId, subjectId);
              Alert.alert(t('myTeachers.success'), t('myTeachers.teacherRemoved'));
              loadData();
            } catch (error) {
              console.error('Error removing teacher:', error);
              Alert.alert(t('common.error'), t('myTeachers.removeError'));
            }
          },
        },
      ]
    );
  };

  const getTeacherForSubject = (subjectId: string) => {
    return teachers.find((t) => t.subject_id === subjectId);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Ionicons name="school" size={24} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>{t('myTeachers.title')}</Text>
        </View>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  if (subjects.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Ionicons name="school" size={24} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>{t('myTeachers.title')}</Text>
        </View>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('myTeachers.noSubjects')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Ionicons name="school" size={24} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>{t('myTeachers.title')}</Text>
        </View>

        {subjects.map((subject) => {
          const assignedTeacher = getTeacherForSubject(subject.id);
          return (
            <View key={subject.id} style={[styles.subjectCard, { borderColor: colors.border }]}>
              <Text style={[styles.subjectName, { color: colors.text }]}>{subject.name}</Text>

              {assignedTeacher ? (
                <View style={styles.teacherRow}>
                  <View style={styles.teacherInfo}>
                    <Ionicons name="person" size={16} color={colors.primary} />
                    <Text style={[styles.teacherName, { color: colors.text }]}>
                      {assignedTeacher.teacher_name}
                    </Text>
                    <Text style={[styles.teacherCity, { color: colors.textSecondary }]}>
                      ({assignedTeacher.teacher_city})
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveTeacher(subject.id, subject.name)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.assignButton, { backgroundColor: colors.primaryLight }]}
                  onPress={() => handleAssignTeacher(subject.id, subject.name)}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.assignButtonText, { color: colors.primary }]}>
                    {t('myTeachers.assignTeacher')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {selectedSubject && (
        <TeacherSearchModal
          visible={searchModalVisible}
          subjectId={selectedSubject.id}
          subjectName={selectedSubject.name}
          onSelect={handleTeacherSelected}
          onClose={() => setSearchModalVisible(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subjectCard: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '500',
  },
  teacherCity: {
    fontSize: 12,
  },
  removeButton: {
    padding: spacing.xs,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
  },
  assignButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
