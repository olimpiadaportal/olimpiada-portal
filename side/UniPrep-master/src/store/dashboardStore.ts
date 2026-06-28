import { create } from 'zustand';
import {
  SubjectProgress,
  MockExamResult,
  StudentStats,
  RecommendedTeacher,
} from '../services/studentService';

interface DashboardState {
  // Data
  subjectProgress: SubjectProgress[];
  mockExamHistory: MockExamResult[];
  studentStats: StudentStats | null;
  recommendedTeachers: RecommendedTeacher[];
  availableMockExams: any[];

  // Loading states
  isLoadingProgress: boolean;
  isLoadingStats: boolean;
  isLoadingTeachers: boolean;
  isLoadingExams: boolean;
  isRefreshing: boolean;

  // Actions
  setSubjectProgress: (progress: SubjectProgress[]) => void;
  setMockExamHistory: (history: MockExamResult[]) => void;
  setStudentStats: (stats: StudentStats) => void;
  setRecommendedTeachers: (teachers: RecommendedTeacher[]) => void;
  setAvailableMockExams: (exams: any[]) => void;
  setLoadingProgress: (loading: boolean) => void;
  setLoadingStats: (loading: boolean) => void;
  setLoadingTeachers: (loading: boolean) => void;
  setLoadingExams: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  clearDashboard: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Initial data
  subjectProgress: [],
  mockExamHistory: [],
  studentStats: null,
  recommendedTeachers: [],
  availableMockExams: [],

  // Initial loading states
  isLoadingProgress: false,
  isLoadingStats: false,
  isLoadingTeachers: false,
  isLoadingExams: false,
  isRefreshing: false,

  // Actions
  setSubjectProgress: (progress) => set({ subjectProgress: progress }),
  setMockExamHistory: (history) => set({ mockExamHistory: history }),
  setStudentStats: (stats) => set({ studentStats: stats }),
  setRecommendedTeachers: (teachers) => set({ recommendedTeachers: teachers }),
  setAvailableMockExams: (exams) => set({ availableMockExams: exams }),
  setLoadingProgress: (loading) => set({ isLoadingProgress: loading }),
  setLoadingStats: (loading) => set({ isLoadingStats: loading }),
  setLoadingTeachers: (loading) => set({ isLoadingTeachers: loading }),
  setLoadingExams: (loading) => set({ isLoadingExams: loading }),
  setRefreshing: (refreshing) => set({ isRefreshing: refreshing }),

  clearDashboard: () =>
    set({
      subjectProgress: [],
      mockExamHistory: [],
      studentStats: null,
      recommendedTeachers: [],
      availableMockExams: [],
      isLoadingProgress: false,
      isLoadingStats: false,
      isLoadingTeachers: false,
      isLoadingExams: false,
      isRefreshing: false,
    }),
}));
