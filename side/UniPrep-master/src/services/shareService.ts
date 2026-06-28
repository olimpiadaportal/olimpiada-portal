import { Share, Platform } from 'react-native';
import { deepLinkService } from './deepLinkService';

interface ShareOptions {
  title?: string;
  message: string;
  url?: string;
}

class ShareService {
  async shareTeacher(teacherId: string, teacherName: string): Promise<boolean> {
    try {
      const deepLink = deepLinkService.generateLink('teacher', teacherId);

      const message = `Check out ${teacherName} on Elmly.\n\nConnect with this teacher and book your session today.\n\n${deepLink}`;

      const result = await Share.share({
        message,
        title: `${teacherName} - Elmly`,
        ...(Platform.OS === 'ios' && { url: deepLink }),
      });

      return result.action === Share.sharedAction;
    } catch (error) {
      console.error('Share teacher error:', error);
      return false;
    }
  }

  async shareExamResult(
    examTitle: string,
    score: number,
    totalQuestions: number,
    percentage: number
  ): Promise<boolean> {
    try {
      const message = `I scored ${score}/${totalQuestions} (${percentage}%) on "${examTitle}" in Elmly.\n\nJoin me and start preparing for your university entrance exams.`;

      const result = await Share.share({
        message,
        title: 'My Exam Result - Elmly',
      });

      return result.action === Share.sharedAction;
    } catch (error) {
      console.error('Share exam result error:', error);
      return false;
    }
  }

  async shareSubject(subjectId: string, subjectName: string): Promise<boolean> {
    try {
      const deepLink = deepLinkService.generateLink('subject', subjectId, {
        name: subjectName,
      });

      const message = `Practice ${subjectName} with me on Elmly.\n\nJoin students preparing for university entrance exams.\n\n${deepLink}`;

      const result = await Share.share({
        message,
        title: `${subjectName} - Elmly`,
        ...(Platform.OS === 'ios' && { url: deepLink }),
      });

      return result.action === Share.sharedAction;
    } catch (error) {
      console.error('Share subject error:', error);
      return false;
    }
  }

  async shareApp(referralCode?: string): Promise<boolean> {
    try {
      let message = 'Join me on Elmly for university entrance exam preparation.\n\nPractice questions\nConnect with teachers\nTrack your progress\nCompete with friends';

      if (referralCode) {
        message += `\n\nUse my referral code: ${referralCode}`;
      }

      message += '\n\nDownload now: elmly://';

      const result = await Share.share({
        message,
        title: 'Elmly - University Exam Prep',
      });

      return result.action === Share.sharedAction;
    } catch (error) {
      console.error('Share app error:', error);
      return false;
    }
  }

  async share(options: ShareOptions): Promise<boolean> {
    try {
      const result = await Share.share({
        message: options.message,
        title: options.title,
        ...(Platform.OS === 'ios' && options.url && { url: options.url }),
      });

      return result.action === Share.sharedAction;
    } catch (error) {
      console.error('Share error:', error);
      return false;
    }
  }
}

export const shareService = new ShareService();
