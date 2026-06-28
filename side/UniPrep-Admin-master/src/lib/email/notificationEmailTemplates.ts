/**
 * Email Templates for Notifications
 * Phase 3: Email & SMS Integration
 * 
 * Professional HTML email templates for different notification types
 */

interface BaseEmailData {
  userName: string;
}

interface BookingConfirmedData extends BaseEmailData {
  teacherName: string;
  scheduledDate: string;
  bookingId: string;
}

interface BookingCancelledData extends BaseEmailData {
  teacherName: string;
  scheduledDate: string;
}

interface SessionReminderData extends BaseEmailData {
  teacherName: string;
  scheduledDate: string;
  bookingId: string;
  minutesBefore: number;
}

interface AchievementData extends BaseEmailData {
  achievementName: string;
  achievementDescription: string;
  points: number;
}

interface ExamReminderData extends BaseEmailData {
  examDate: string;
  daysUntil: number;
}

interface GenericNotificationData extends BaseEmailData {
  title: string;
  body: string;
  actionUrl?: string;
  actionText?: string;
}

type EmailTemplateData = 
  | BookingConfirmedData
  | BookingCancelledData
  | SessionReminderData
  | AchievementData
  | ExamReminderData
  | GenericNotificationData;

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Base email template wrapper
 */
const baseTemplate = (content: string, userName: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elmly Notification</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #4F46E5;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #4F46E5;
      margin-bottom: 10px;
    }
    .content {
      margin-bottom: 30px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #1F2937;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: #4F46E5;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #4338CA;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      font-size: 12px;
      color: #6B7280;
    }
    .info-box {
      background-color: #F3F4F6;
      border-left: 4px solid #4F46E5;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .highlight {
      color: #4F46E5;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🎓 Elmly</div>
      <p style="margin: 0; color: #6B7280;">Your Exam Preparation Platform</p>
    </div>
    <div class="content">
      <div class="greeting">Salam, ${userName}!</div>
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Elmly. All rights reserved.</p>
      <p>This email was sent because you have notifications enabled for your account.</p>
      <p><a href="#" style="color: #4F46E5;">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Booking Confirmed Email
 */
export const bookingConfirmedEmail = (data: BookingConfirmedData): EmailTemplate => {
  const html = baseTemplate(`
    <p>Your tutoring session has been confirmed!</p>
    <div class="info-box">
      <p style="margin: 5px 0;"><strong>Teacher:</strong> ${data.teacherName}</p>
      <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${data.scheduledDate}</p>
    </div>
    <p>Please make sure to be ready at the scheduled time. Your teacher is looking forward to the session!</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/bookings/${data.bookingId}" class="button">View Booking Details</a>
    <p style="font-size: 14px; color: #6B7280; margin-top: 20px;">
      Need to reschedule? You can manage your bookings in the app.
    </p>
  `, data.userName);

  const text = `
Salam, ${data.userName}!

Your tutoring session has been confirmed!

Teacher: ${data.teacherName}
Date & Time: ${data.scheduledDate}

Please make sure to be ready at the scheduled time. Your teacher is looking forward to the session!

View booking details: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/bookings/${data.bookingId}

Need to reschedule? You can manage your bookings in the app.

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: '✅ Booking Confirmed - Elmly',
    html,
    text,
  };
};

/**
 * Booking Cancelled Email
 */
export const bookingCancelledEmail = (data: BookingCancelledData): EmailTemplate => {
  const html = baseTemplate(`
    <p>Your tutoring session has been cancelled.</p>
    <div class="info-box">
      <p style="margin: 5px 0;"><strong>Teacher:</strong> ${data.teacherName}</p>
      <p style="margin: 5px 0;"><strong>Was scheduled for:</strong> ${data.scheduledDate}</p>
    </div>
    <p>We're sorry this session couldn't take place. You can book a new session anytime through the app.</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/teachers" class="button">Find a Teacher</a>
  `, data.userName);

  const text = `
Salam, ${data.userName}!

Your tutoring session has been cancelled.

Teacher: ${data.teacherName}
Was scheduled for: ${data.scheduledDate}

We're sorry this session couldn't take place. You can book a new session anytime through the app.

Find a teacher: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/teachers

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: '❌ Booking Cancelled - Elmly',
    html,
    text,
  };
};

/**
 * Session Reminder Email
 */
export const sessionReminderEmail = (data: SessionReminderData): EmailTemplate => {
  const html = baseTemplate(`
    <p><strong>Reminder:</strong> Your tutoring session starts in ${data.minutesBefore} minutes!</p>
    <div class="info-box">
      <p style="margin: 5px 0;"><strong>Teacher:</strong> ${data.teacherName}</p>
      <p style="margin: 5px 0;"><strong>Time:</strong> ${data.scheduledDate}</p>
    </div>
    <p>Please make sure you're ready and have all necessary materials prepared.</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/bookings/${data.bookingId}" class="button">Join Session</a>
  `, data.userName);

  const text = `
Salam, ${data.userName}!

Reminder: Your tutoring session starts in ${data.minutesBefore} minutes!

Teacher: ${data.teacherName}
Time: ${data.scheduledDate}

Please make sure you're ready and have all necessary materials prepared.

Join session: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/bookings/${data.bookingId}

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: `⏰ Session Starting in ${data.minutesBefore} Minutes - Elmly`,
    html,
    text,
  };
};

/**
 * Achievement Unlocked Email
 */
export const achievementUnlockedEmail = (data: AchievementData): EmailTemplate => {
  const html = baseTemplate(`
    <p style="font-size: 20px; text-align: center; margin: 20px 0;">🎉 Congratulations!</p>
    <p>You've unlocked a new achievement!</p>
    <div class="info-box" style="text-align: center;">
      <p style="font-size: 18px; font-weight: bold; margin: 10px 0; color: #4F46E5;">${data.achievementName}</p>
      <p style="margin: 10px 0;">${data.achievementDescription}</p>
      <p style="font-size: 16px; font-weight: 600; margin: 10px 0;">+${data.points} points</p>
    </div>
    <p>Keep up the great work! Continue learning to unlock more achievements.</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/profile/achievements" class="button">View All Achievements</a>
  `, data.userName);

  const text = `
Salam, ${data.userName}!

🎉 Congratulations! You've unlocked a new achievement!

${data.achievementName}
${data.achievementDescription}
+${data.points} points

Keep up the great work! Continue learning to unlock more achievements.

View all achievements: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/profile/achievements

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: '🎉 New Achievement Unlocked - Elmly',
    html,
    text,
  };
};

/**
 * Exam Reminder Email
 */
export const examReminderEmail = (data: ExamReminderData): EmailTemplate => {
  const html = baseTemplate(`
    <p><strong>Important Reminder:</strong> Your university entrance exam is approaching!</p>
    <div class="info-box">
      <p style="margin: 5px 0;"><strong>Exam Date:</strong> ${data.examDate}</p>
      <p style="margin: 5px 0; font-size: 18px; color: #DC2626;"><strong>${data.daysUntil} days remaining</strong></p>
    </div>
    <p>Make sure you're prepared! Here are some tips:</p>
    <ul style="margin: 15px 0; padding-left: 20px;">
      <li>Review your weak topics</li>
      <li>Practice with mock exams</li>
      <li>Get enough rest</li>
      <li>Stay confident!</li>
    </ul>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/practice" class="button">Start Practicing</a>
  `, data.userName);

  const text = `
Salam, ${data.userName}!

Important Reminder: Your university entrance exam is approaching!

Exam Date: ${data.examDate}
${data.daysUntil} days remaining

Make sure you're prepared! Here are some tips:
- Review your weak topics
- Practice with mock exams
- Get enough rest
- Stay confident!

Start practicing: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.elmly.app'}/practice

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: `⏰ Exam Reminder: ${data.daysUntil} Days Left - Elmly`,
    html,
    text,
  };
};

/**
 * Generic Notification Email
 */
export const genericNotificationEmail = (data: GenericNotificationData): EmailTemplate => {
  const html = baseTemplate(`
    <p style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">${data.title}</p>
    <p>${data.body}</p>
    ${data.actionUrl && data.actionText ? `
      <a href="${data.actionUrl}" class="button">${data.actionText}</a>
    ` : ''}
  `, data.userName);

  const text = `
Salam, ${data.userName}!

${data.title}

${data.body}

${data.actionUrl && data.actionText ? `${data.actionText}: ${data.actionUrl}` : ''}

---
© ${new Date().getFullYear()} Elmly. All rights reserved.
  `.trim();

  return {
    subject: `${data.title} - Elmly`,
    html,
    text,
  };
};

/**
 * Get email template by notification type
 */
export const getEmailTemplate = (
  notificationType: string,
  data: EmailTemplateData
): EmailTemplate => {
  switch (notificationType) {
    case 'booking_confirmed':
      return bookingConfirmedEmail(data as BookingConfirmedData);
    case 'booking_cancelled':
      return bookingCancelledEmail(data as BookingCancelledData);
    case 'session_reminder_1h':
      return sessionReminderEmail({ ...data, minutesBefore: 60 } as SessionReminderData);
    case 'achievement_unlocked':
      return achievementUnlockedEmail(data as AchievementData);
    case 'exam_reminder':
      return examReminderEmail(data as ExamReminderData);
    default:
      return genericNotificationEmail(data as GenericNotificationData);
  }
};
