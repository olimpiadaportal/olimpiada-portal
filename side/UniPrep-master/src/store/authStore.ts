import { create } from 'zustand';
import { User } from '../types';

// Score data interface for students
interface StudentScoreData {
  eloRating: number;
  monthlyScore: number;
  activityMultiplier: number;
  bonusPoints: number;
  currentStreak: number;
  bestStreak: number;
}

// Streak milestone data — set after a streak-updating activity so
// completion screens can show a contextual celebration overlay.
export interface StreakMilestone {
  newStreak: number;
  prevStreak: number;
  isNewRecord: boolean;
  status: 'active' | 'at_risk' | 'lost';
  message: string;
  celebrationType: 'celebrate' | 'lost';
}

interface AuthState {
  user: User | null;
  session: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Student-specific data (pre-fetched for Profile tab)
  studentId: string | null;
  scoreData: StudentScoreData | null;

  // Live streak — updated immediately after any activity so HomeScreen
  // and completion screens react without waiting for a full data refresh.
  liveStreak: number;
  // Pending milestone shown on the next completion screen, then cleared.
  streakMilestone: StreakMilestone | null;

  // Onboarding state (Phase 2)
  // Tri-state: null = not yet fetched from DB, true = completed, false = not completed
  // Using null as the "unknown" state eliminates the need for a separate flag
  onboardingCompleted: boolean | null;
  
  // Logout guard: prevents onAuthStateChange handler from firing
  // during an explicit logout, avoiding cascading state updates
  // that cause "Maximum update depth exceeded" errors.
  isSigningOut: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: any | null) => void;
  setLoading: (loading: boolean) => void;
  setStudentData: (studentId: string | null, scoreData: StudentScoreData | null) => void;
  setLiveStreak: (streak: number) => void;
  setStreakMilestone: (milestone: StreakMilestone | null) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setSigningOut: (signingOut: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  studentId: null,
  scoreData: null,
  liveStreak: 0,
  streakMilestone: null,
  onboardingCompleted: null, // null = not yet fetched, true = done, false = not done
  isSigningOut: false,
  
  setUser: (user) => set((state) => ({ 
    user, 
    isAuthenticated: !!user,
    isLoading: false,
    // Reset isSigningOut when user logs in (it stays true after logout)
    isSigningOut: user ? false : state.isSigningOut,
  })),
  
  setSession: (session) => set({ session }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setStudentData: (studentId, scoreData) => set((state) => ({
    studentId,
    scoreData,
    // Seed liveStreak from the initial fetch so HomeScreen starts with a real value
    liveStreak: scoreData ? (scoreData.currentStreak ?? 0) : state.liveStreak,
  })),
  setLiveStreak: (streak) => set({ liveStreak: streak }),
  setStreakMilestone: (milestone) => set({ streakMilestone: milestone }),
  
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  
  setSigningOut: (signingOut) => set({ isSigningOut: signingOut }),
  
  // Single atomic state clear — one Zustand notification, one React re-render
  // CRITICAL: Keep isSigningOut TRUE during logout to prevent MainTabs from
  // changing its tab structure (teacher tabs → student tabs) which causes
  // cascading re-renders and "Maximum update depth exceeded" error.
  // The flag stays true until the next successful login.
  signOut: () => set({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    studentId: null,
    scoreData: null,
    liveStreak: 0,
    streakMilestone: null,
    onboardingCompleted: null, // Reset to null (unknown) - will be fetched from DB on next login
    isSigningOut: true, // Keep true to preserve tab structure during logout transition
  }),
}));
