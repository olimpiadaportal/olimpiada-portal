import { supabase } from './supabase';
import i18n from '../i18n';

export interface StudyTip {
  tip: string;
  icon: string;
  category: 'motivation' | 'technique' | 'health' | 'time-management';
}

class MotivationService {
  /**
   * Get time-based greeting with user's name
   */
  getGreeting(userName: string): string {
    const hour = new Date().getHours();
    let timeGreeting = '';

    if (hour < 12) {
      timeGreeting = i18n.t('home.goodMorning');
    } else if (hour < 17) {
      timeGreeting = i18n.t('home.goodAfternoon');
    } else if (hour < 21) {
      timeGreeting = i18n.t('home.goodEvening');
    } else {
      timeGreeting = i18n.t('home.goodEvening'); // Use evening for night too
    }

    return `${timeGreeting}, ${userName}! 👋`;
  }

  /**
   * Get motivational subtitle based on user's progress
   */
  getMotivationalSubtitle(
    streak: number,
    accuracy: number,
    questionsAttempted: number
  ): string {
    // Prioritize streak achievements
    if (streak >= 30) {
      return i18n.t('home.motivation.streak30');
    }
    if (streak >= 14) {
      return i18n.t('home.motivation.streak14');
    }
    if (streak >= 7) {
      return i18n.t('home.motivation.streak7');
    }
    if (streak >= 3) {
      return i18n.t('home.motivation.streak3');
    }

    // Accuracy-based motivation
    if (accuracy >= 90) {
      return i18n.t('home.motivation.accuracy90');
    }
    if (accuracy >= 80) {
      return i18n.t('home.motivation.accuracy80');
    }
    if (accuracy >= 70) {
      return i18n.t('home.motivation.accuracy70');
    }

    // Questions attempted motivation
    if (questionsAttempted >= 1000) {
      return i18n.t('home.motivation.questions1000');
    }
    if (questionsAttempted >= 500) {
      return i18n.t('home.motivation.questions500');
    }
    if (questionsAttempted >= 100) {
      return i18n.t('home.motivation.questions100');
    }

    // Default encouraging message
    if (streak === 0 && questionsAttempted < 10) {
      return i18n.t('home.motivation.startJourney');
    }

    return i18n.t('home.motivation.everyStep');
  }

  /**
   * Get daily study tip from database
   */
  async getDailyTip(): Promise<StudyTip | null> {
    try {
      // Get all active tips
      const { data: tips, error } = await supabase
        .from('daily_study_tips')
        .select('*')
        .eq('is_active', true);

      if (error || !tips || tips.length === 0) {
        return this.getFallbackTip();
      }

      // Select a random tip
      const randomIndex = Math.floor(Math.random() * tips.length);
      const tip = tips[randomIndex];

      return {
        tip: tip.tip_text,
        icon: tip.icon || '💡',
        category: tip.category,
      };
    } catch (error) {
      console.error('Get daily tip error:', error);
      return this.getFallbackTip();
    }
  }

  /**
   * Get study tip that rotates every 1 hour
   * Uses a deterministic selection based on current hour
   */
  async getRotatingTip(): Promise<StudyTip> {
    try {
      // Get all active tips
      const { data: tips, error } = await supabase
        .from('daily_study_tips')
        .select('*')
        .eq('is_active', true)
        .order('id');

      if (error || !tips || tips.length === 0) {
        return this.getFallbackRotatingTip();
      }

      // Calculate which hour we're in (0-23 for each day)
      const now = new Date();
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      const hourWindow = now.getHours(); // 0-23
      
      // Create a deterministic index based on day and hour
      const tipIndex = (dayOfYear * 24 + hourWindow) % tips.length;
      const tip = tips[tipIndex];

      return {
        tip: tip.tip_text,
        icon: tip.icon || '💡',
        category: tip.category,
      };
    } catch (error) {
      console.error('Get rotating tip error:', error);
      return this.getFallbackRotatingTip();
    }
  }

  /**
   * Fallback rotating tip when database is unavailable
   * Uses same 1-hour rotation logic
   */
  private getFallbackRotatingTip(): StudyTip {
    const fallbackTips: StudyTip[] = [
      {
        tip: 'Take regular breaks to stay focused and avoid burnout.',
        icon: '🧘',
        category: 'health',
      },
      {
        tip: 'Practice active recall - test yourself instead of just reading.',
        icon: '🧠',
        category: 'technique',
      },
      {
        tip: 'Believe in yourself! Every expert was once a beginner.',
        icon: '💪',
        category: 'motivation',
      },
      {
        tip: 'Set specific goals for each study session.',
        icon: '🎯',
        category: 'time-management',
      },
      {
        tip: 'Review your mistakes - they are your best teachers.',
        icon: '📝',
        category: 'technique',
      },
      {
        tip: 'Stay hydrated and get enough sleep for optimal learning.',
        icon: '💧',
        category: 'health',
      },
      {
        tip: 'Break complex topics into smaller, manageable chunks.',
        icon: '🧩',
        category: 'technique',
      },
      {
        tip: 'Consistency beats intensity - study a little every day.',
        icon: '📅',
        category: 'time-management',
      },
    ];

    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const hourWindow = now.getHours(); // 0-23
    const tipIndex = (dayOfYear * 24 + hourWindow) % fallbackTips.length;

    return fallbackTips[tipIndex];
  }

  /**
   * Get tip for a specific category
   */
  async getTipByCategory(
    category: 'motivation' | 'technique' | 'health' | 'time-management'
  ): Promise<StudyTip | null> {
    try {
      const { data: tips, error } = await supabase
        .from('daily_study_tips')
        .select('*')
        .eq('is_active', true)
        .eq('category', category);

      if (error || !tips || tips.length === 0) {
        return this.getFallbackTip();
      }

      const randomIndex = Math.floor(Math.random() * tips.length);
      const tip = tips[randomIndex];

      return {
        tip: tip.tip_text,
        icon: tip.icon || '💡',
        category: tip.category,
      };
    } catch (error) {
      console.error('Get tip by category error:', error);
      return this.getFallbackTip();
    }
  }

  /**
   * Get personalized motivational message based on recent performance
   */
  async getPersonalizedMessage(
    studentId: string,
    recentAccuracy: number,
    trend: 'improving' | 'declining' | 'stable'
  ): Promise<string> {
    try {
      // Improving performance
      if (trend === 'improving') {
        if (recentAccuracy >= 80) {
          return "Fantastic improvement! You're really getting the hang of this! 🌟";
        }
        return "Great progress! Your scores are improving! Keep it up! 📈";
      }

      // Declining performance
      if (trend === 'declining') {
        if (recentAccuracy < 50) {
          return "Don't worry! Everyone has tough days. Take a break and come back stronger! 💪";
        }
        return "Keep going! Review the basics and you'll bounce back! 🔄";
      }

      // Stable performance
      if (recentAccuracy >= 80) {
        return "Consistent excellence! You're maintaining great performance! ⭐";
      }
      if (recentAccuracy >= 70) {
        return "Steady progress! You're on the right track! 🎯";
      }

      return "Stay focused! Consistency is key to success! 💫";
    } catch (error) {
      console.error('Get personalized message error:', error);
      return "You're doing great! Keep learning! 🌟";
    }
  }

  /**
   * Get encouragement based on time of day and study session
   */
  getSessionEncouragement(sessionNumber: number): string {
    const hour = new Date().getHours();

    // Morning sessions
    if (hour >= 6 && hour < 12) {
      if (sessionNumber === 1) {
        return "Great start to the day! Morning study sessions are the most effective! 🌅";
      }
      return "You're on a roll this morning! Keep the momentum! ☀️";
    }

    // Afternoon sessions
    if (hour >= 12 && hour < 17) {
      if (sessionNumber === 1) {
        return "Good afternoon! Let's make this session count! 💪";
      }
      return "Afternoon productivity! You're making great use of your time! 🌤️";
    }

    // Evening sessions
    if (hour >= 17 && hour < 21) {
      if (sessionNumber === 1) {
        return "Evening study time! Perfect for reviewing what you learned! 🌆";
      }
      return "Dedicated evening learner! Your commitment shows! 🌙";
    }

    // Night sessions
    if (sessionNumber === 1) {
      return "Night owl! Make sure to get enough rest after this! 🦉";
    }
    return "Late night dedication! Don't forget to sleep well! ⭐";
  }

  /**
   * Get milestone celebration message
   */
  getMilestoneMessage(milestone: {
    type: 'questions' | 'streak' | 'accuracy' | 'exams';
    value: number;
  }): string {
    switch (milestone.type) {
      case 'questions':
        if (milestone.value >= 1000) return "🎉 1000 QUESTIONS! You're a practice champion!";
        if (milestone.value >= 500) return "🎊 500 questions! Halfway to mastery!";
        if (milestone.value >= 100) return "🌟 100 questions! Great milestone!";
        if (milestone.value >= 50) return "⭐ 50 questions! You're building momentum!";
        return "🎯 Keep practicing! Every question counts!";

      case 'streak':
        if (milestone.value >= 30) return "🔥🔥🔥 30-DAY STREAK! Legendary dedication!";
        if (milestone.value >= 14) return "🔥🔥 2-WEEK STREAK! You're unstoppable!";
        if (milestone.value >= 7) return "🔥 WEEK STREAK! Amazing consistency!";
        if (milestone.value >= 3) return "💪 3-day streak! Keep it going!";
        return "🌟 Start your streak today!";

      case 'accuracy':
        if (milestone.value >= 90) return "🏆 90%+ ACCURACY! You're a master!";
        if (milestone.value >= 80) return "⭐ 80%+ ACCURACY! Excellent work!";
        if (milestone.value >= 70) return "✨ 70%+ ACCURACY! Great progress!";
        return "📈 Keep improving! You're getting better!";

      case 'exams':
        if (milestone.value >= 50) return "🎓 50 EXAMS! You're exam-ready!";
        if (milestone.value >= 20) return "📚 20 exams! Serious preparation!";
        if (milestone.value >= 10) return "📝 10 exams! Great practice!";
        return "🎯 Keep taking exams to improve!";

      default:
        return "🌟 Great achievement! Keep it up!";
    }
  }

  /**
   * Fallback tip when database is unavailable
   */
  private getFallbackTip(): StudyTip {
    const fallbackTips: StudyTip[] = [
      {
        tip: 'Take regular breaks to stay focused and avoid burnout.',
        icon: '🧘',
        category: 'health',
      },
      {
        tip: 'Practice active recall - test yourself instead of just reading.',
        icon: '🧠',
        category: 'technique',
      },
      {
        tip: 'Believe in yourself! Every expert was once a beginner.',
        icon: '💪',
        category: 'motivation',
      },
      {
        tip: 'Set specific goals for each study session.',
        icon: '🎯',
        category: 'time-management',
      },
    ];

    return fallbackTips[Math.floor(Math.random() * fallbackTips.length)];
  }
}

export const motivationService = new MotivationService();
