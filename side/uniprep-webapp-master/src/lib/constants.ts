export const APP_NAME = "Elmly"
export const APP_DESCRIPTION = "Master Azerbaijan University Entrance Exams"

export const BRAND_COLORS = {
  primary: "#1E3A8A", // Dark Blue
  accent: "#F59E0B", // Gold
  success: "#10B981", // Green
  error: "#EF4444", // Red
} as const

export const FEATURES = [
  {
    title: "Practice Questions",
    description: "Access thousands of questions organized by subject and topic. Practice at your own pace with instant feedback.",
    icon: "BookOpen",
  },
  {
    title: "Mock Exams",
    description: "Take realistic mock exams with proper scoring and coefficient calculations. Track your progress over time.",
    icon: "FileText",
  },
  {
    title: "AI Competitive Mode",
    description: "Get personalized AI-generated questions targeting your weak topics. Adaptive difficulty for optimal learning.",
    icon: "Zap",
  },
  {
    title: "Teacher Marketplace",
    description: "Find and book verified teachers for personalized tutoring. Read reviews and compare prices.",
    icon: "Users",
  },
  {
    title: "Analytics Dashboard",
    description: "Track your performance with detailed analytics. Visualize your progress and identify areas for improvement.",
    icon: "BarChart3",
  },
  {
    title: "Leaderboards",
    description: "Compete with peers on city and national leaderboards. ELO-based ranking system for fair competition.",
    icon: "Trophy",
  },
] as const

export const DOWNLOAD_LINKS = {
  appStore: "https://apps.apple.com/app/elmly",
  playStore: "https://play.google.com/store/apps/details?id=com.elmly",
} as const
