/**
 * Multi-Language Notification Translations
 * Supports: English, Azerbaijani, Russian
 * 
 * Industry Best Practice:
 * - Store translations in structured format
 * - Support user language preference
 * - Fallback to English if translation missing
 * - Use template variables for dynamic content
 */

export type SupportedLanguage = 'en' | 'az' | 'ru';

interface NotificationTranslation {
  title: string;
  body: string;
  emailSubject?: string;
}

interface NotificationTranslations {
  [key: string]: {
    en: NotificationTranslation;
    az: NotificationTranslation;
    ru: NotificationTranslation;
  };
}

/**
 * Notification translations by type
 * Template variables: {{teacherName}}, {{studentName}}, {{scheduledDate}}, {{minutesBefore}}, etc.
 */
export const notificationTranslations: NotificationTranslations = {
  // Booking Notifications
  booking_confirmed: {
    en: {
      title: 'Booking Confirmed',
      body: 'Your session with {{teacherName}} is confirmed for {{scheduledDate}}',
      emailSubject: '✅ Booking Confirmed - Elmly',
    },
    az: {
      title: 'Rezervasiya Təsdiqləndi',
      body: '{{teacherName}} ilə seansınız {{scheduledDate}} tarixinə təsdiqləndi',
      emailSubject: '✅ Rezervasiya Təsdiqləndi - Elmly',
    },
    ru: {
      title: 'Бронирование Подтверждено',
      body: 'Ваша сессия с {{teacherName}} подтверждена на {{scheduledDate}}',
      emailSubject: '✅ Бронирование Подтверждено - Elmly',
    },
  },

  booking_cancelled: {
    en: {
      title: 'Booking Cancelled',
      body: 'Your session with {{teacherName}} scheduled for {{scheduledDate}} has been cancelled',
      emailSubject: '❌ Booking Cancelled - Elmly',
    },
    az: {
      title: 'Rezervasiya Ləğv Edildi',
      body: '{{teacherName}} ilə {{scheduledDate}} tarixinə planlaşdırılmış seansınız ləğv edildi',
      emailSubject: '❌ Rezervasiya Ləğv Edildi - Elmly',
    },
    ru: {
      title: 'Бронирование Отменено',
      body: 'Ваша сессия с {{teacherName}}, запланированная на {{scheduledDate}}, была отменена',
      emailSubject: '❌ Бронирование Отменено - Elmly',
    },
  },

  booking_cancelled_by_student: {
    en: {
      title: 'Booking Cancelled by Student',
      body: '{{studentName}} has cancelled the session scheduled for {{scheduledDate}}',
      emailSubject: '❌ Booking Cancelled - Elmly',
    },
    az: {
      title: 'Tələbə Tərəfindən Ləğv Edildi',
      body: '{{studentName}} {{scheduledDate}} tarixinə planlaşdırılmış seansı ləğv etdi',
      emailSubject: '❌ Rezervasiya Ləğv Edildi - Elmly',
    },
    ru: {
      title: 'Отменено Студентом',
      body: '{{studentName}} отменил(а) сессию, запланированную на {{scheduledDate}}',
      emailSubject: '❌ Бронирование Отменено - Elmly',
    },
  },

  booking_cancelled_by_teacher: {
    en: {
      title: 'Booking Cancelled by Teacher',
      body: '{{teacherName}} has cancelled your session scheduled for {{scheduledDate}}',
      emailSubject: '❌ Booking Cancelled - Elmly',
    },
    az: {
      title: 'Müəllim Tərəfindən Ləğv Edildi',
      body: '{{teacherName}} {{scheduledDate}} tarixinə planlaşdırılmış seansınızı ləğv etdi',
      emailSubject: '❌ Rezervasiya Ləğv Edildi - Elmly',
    },
    ru: {
      title: 'Отменено Учителем',
      body: '{{teacherName}} отменил(а) вашу сессию, запланированную на {{scheduledDate}}',
      emailSubject: '❌ Бронирование Отменено - Elmly',
    },
  },

  booking_rejected: {
    en: {
      title: 'Booking Request Declined',
      body: '{{teacherName}} has declined your booking request for {{scheduledDate}}',
      emailSubject: '❌ Booking Request Declined - Elmly',
    },
    az: {
      title: 'Rezervasiya Sorğusu Rədd Edildi',
      body: '{{teacherName}} {{scheduledDate}} tarixinə rezervasiya sorğunuzu rədd etdi',
      emailSubject: '❌ Rezervasiya Sorğusu Rədd Edildi - Elmly',
    },
    ru: {
      title: 'Запрос на Бронирование Отклонен',
      body: '{{teacherName}} отклонил(а) ваш запрос на бронирование на {{scheduledDate}}',
      emailSubject: '❌ Запрос на Бронирование Отклонен - Elmly',
    },
  },

  booking_request: {
    en: {
      title: 'New Booking Request',
      body: '{{studentName}} has requested a session for {{scheduledDate}}',
      emailSubject: '📅 New Booking Request - Elmly',
    },
    az: {
      title: 'Yeni Rezervasiya Sorğusu',
      body: '{{studentName}} {{scheduledDate}} tarixinə seans sorğusu göndərdi',
      emailSubject: '📅 Yeni Rezervasiya Sorğusu - Elmly',
    },
    ru: {
      title: 'Новый Запрос на Бронирование',
      body: '{{studentName}} запросил(а) сессию на {{scheduledDate}}',
      emailSubject: '📅 Новый Запрос на Бронирование - Elmly',
    },
  },

  // New Booking Request (teacher notification when student books)
  new_booking_request: {
    en: {
      title: '📚 New Booking Request',
      body: '{{studentName}} has requested a {{subjectName}} session on {{scheduledDate}}',
      emailSubject: '📚 New Booking Request - Elmly',
    },
    az: {
      title: '📚 Yeni Rezervasiya Sorğusu',
      body: '{{studentName}} {{scheduledDate}} tarixinə {{subjectName}} seansı sorğusu göndərdi',
      emailSubject: '📚 Yeni Rezervasiya Sorğusu - Elmly',
    },
    ru: {
      title: '📚 Новый Запрос на Бронирование',
      body: '{{studentName}} запросил(а) сессию {{subjectName}} на {{scheduledDate}}',
      emailSubject: '📚 Новый Запрос на Бронирование - Elmly',
    },
  },

  // Payment Notifications (Phase 8B)
  booking_accepted_payment_required: {
    en: {
      title: '💳 Payment Required',
      body: '{{teacherName}} accepted your booking! Complete payment to confirm your session on {{scheduledDate}}.',
      emailSubject: '💳 Payment Required - Elmly',
    },
    az: {
      title: '💳 Ödəniş Tələb Olunur',
      body: '{{teacherName}} rezervasiyanızı qəbul etdi! {{scheduledDate}} tarixindəki seansınızı təsdiqləmək üçün ödənişi tamamlayın.',
      emailSubject: '💳 Ödəniş Tələb Olunur - Elmly',
    },
    ru: {
      title: '💳 Требуется Оплата',
      body: '{{teacherName}} принял(а) вашу заявку! Завершите оплату для подтверждения сессии на {{scheduledDate}}.',
      emailSubject: '💳 Требуется Оплата - Elmly',
    },
  },

  payment_succeeded: {
    en: {
      title: '✅ Payment Successful',
      body: 'Your payment was successful! Your session on {{scheduledDate}} is now confirmed.',
      emailSubject: '✅ Payment Successful - Elmly',
    },
    az: {
      title: '✅ Ödəniş Uğurlu',
      body: 'Ödənişiniz uğurla tamamlandı! {{scheduledDate}} tarixindəki seansınız təsdiqləndi.',
      emailSubject: '✅ Ödəniş Uğurlu - Elmly',
    },
    ru: {
      title: '✅ Оплата Успешна',
      body: 'Ваша оплата прошла успешно! Ваша сессия на {{scheduledDate}} подтверждена.',
      emailSubject: '✅ Оплата Успешна - Elmly',
    },
  },

  payment_received: {
    en: {
      title: '💰 Payment Received',
      body: 'Student has completed payment for your {{subjectName}} session on {{scheduledDate}}. Booking is now confirmed!',
      emailSubject: '💰 Payment Received - Elmly',
    },
    az: {
      title: '💰 Ödəniş Alındı',
      body: 'Tələbə {{scheduledDate}} tarixindəki {{subjectName}} seansı üçün ödənişi tamamladı. Rezervasiya təsdiqləndi!',
      emailSubject: '💰 Ödəniş Alındı - Elmly',
    },
    ru: {
      title: '💰 Оплата Получена',
      body: 'Студент завершил оплату за сессию {{subjectName}} на {{scheduledDate}}. Бронирование подтверждено!',
      emailSubject: '💰 Оплата Получена - Elmly',
    },
  },

  payment_failed: {
    en: {
      title: '❌ Payment Failed',
      body: 'Your payment for the session with {{teacherName}} could not be processed. Please try again.',
      emailSubject: '❌ Payment Failed - Elmly',
    },
    az: {
      title: '❌ Ödəniş Uğursuz',
      body: '{{teacherName}} ilə seans üçün ödənişiniz emal edilə bilmədi. Zəhmət olmasa yenidən cəhd edin.',
      emailSubject: '❌ Ödəniş Uğursuz - Elmly',
    },
    ru: {
      title: '❌ Ошибка Оплаты',
      body: 'Ваша оплата за сессию с {{teacherName}} не прошла. Пожалуйста, попробуйте снова.',
      emailSubject: '❌ Ошибка Оплаты - Elmly',
    },
  },

  refund_processed: {
    en: {
      title: '💸 Refund Processed',
      body: 'Your refund has been processed. It may take 5-10 business days to appear in your account.',
      emailSubject: '💸 Refund Processed - Elmly',
    },
    az: {
      title: '💸 Geri Ödəmə Emal Edildi',
      body: 'Geri ödəməniz emal edildi. Hesabınızda görünməsi 5-10 iş günü çəkə bilər.',
      emailSubject: '💸 Geri Ödəmə Emal Edildi - Elmly',
    },
    ru: {
      title: '💸 Возврат Обработан',
      body: 'Ваш возврат обработан. Средства могут появиться на счету в течение 5-10 рабочих дней.',
      emailSubject: '💸 Возврат Обработан - Elmly',
    },
  },

  // Cancellation Reasons
  cancellation_reason: {
    en: {
      title: 'Cancellation Reason',
      body: '{{reason}}',
    },
    az: {
      title: 'Ləğv Səbəbi',
      body: '{{reason}}',
    },
    ru: {
      title: 'Причина Отмены',
      body: '{{reason}}',
    },
  },

  session_reminder_1h: {
    en: {
      title: 'Session Starting Soon',
      body: 'Your session with {{teacherName}} starts in {{minutesBefore}} minutes!',
      emailSubject: '⏰ Session Reminder - Elmly',
    },
    az: {
      title: 'Seans Tezliklə Başlayır',
      body: '{{teacherName}} ilə seansınız {{minutesBefore}} dəqiqəyə başlayır!',
      emailSubject: '⏰ Seans Xatırlatması - Elmly',
    },
    ru: {
      title: 'Сессия Скоро Начнется',
      body: 'Ваша сессия с {{teacherName}} начнется через {{minutesBefore}} минут!',
      emailSubject: '⏰ Напоминание о Сессии - Elmly',
    },
  },

  session_reminder_15m: {
    en: {
      title: 'Session Starting Now',
      body: 'Your session with {{teacherName}} starts in {{minutesBefore}} minutes! Please be ready.',
      emailSubject: '⏰ Session Starting Soon - Elmly',
    },
    az: {
      title: 'Seans İndi Başlayır',
      body: '{{teacherName}} ilə seansınız {{minutesBefore}} dəqiqəyə başlayır! Hazır olun.',
      emailSubject: '⏰ Seans Tezliklə Başlayır - Elmly',
    },
    ru: {
      title: 'Сессия Начинается',
      body: 'Ваша сессия с {{teacherName}} начнется через {{minutesBefore}} минут! Будьте готовы.',
      emailSubject: '⏰ Сессия Скоро Начнется - Elmly',
    },
  },

  // Achievement Notifications
  achievement_unlocked: {
    en: {
      title: 'Achievement Unlocked!',
      body: 'Congratulations! You earned "{{achievementName}}" - {{points}} points',
      emailSubject: '🏆 New Achievement - Elmly',
    },
    az: {
      title: 'Nailiyyət Əldə Edildi!',
      body: 'Təbriklər! "{{achievementName}}" qazandınız - {{points}} xal',
      emailSubject: '🏆 Yeni Nailiyyət - Elmly',
    },
    ru: {
      title: 'Достижение Разблокировано!',
      body: 'Поздравляем! Вы получили "{{achievementName}}" - {{points}} баллов',
      emailSubject: '🏆 Новое Достижение - Elmly',
    },
  },

  // Exam Notifications
  exam_reminder: {
    en: {
      title: 'Exam Reminder',
      body: 'Your exam is in {{daysUntil}} days on {{examDate}}. Good luck!',
      emailSubject: '📚 Exam Reminder - Elmly',
    },
    az: {
      title: 'İmtahan Xatırlatması',
      body: 'İmtahanınız {{daysUntil}} gün sonra, {{examDate}} tarixində. Uğurlar!',
      emailSubject: '📚 İmtahan Xatırlatması - Elmly',
    },
    ru: {
      title: 'Напоминание об Экзамене',
      body: 'Ваш экзамен через {{daysUntil}} дней, {{examDate}}. Удачи!',
      emailSubject: '📚 Напоминание об Экзамене - Elmly',
    },
  },

  exam_reminder_24h: {
    en: {
      title: 'Exam Tomorrow',
      body: 'Your {{examTitle}} exam is scheduled for tomorrow',
      emailSubject: '📚 Exam Tomorrow - Elmly',
    },
    az: {
      title: 'Sabah İmtahan',
      body: '{{examTitle}} imtahanınız sabaha planlaşdırılıb',
      emailSubject: '📚 Sabah İmtahan - Elmly',
    },
    ru: {
      title: 'Экзамен Завтра',
      body: 'Ваш экзамен {{examTitle}} запланирован на завтра',
      emailSubject: '📚 Экзамен Завтра - Elmly',
    },
  },

  exam_reminder_1h: {
    en: {
      title: 'Exam Starting Soon!',
      body: 'Your {{examTitle}} exam starts in 1 hour',
      emailSubject: '📚 Exam Starting Soon - Elmly',
    },
    az: {
      title: 'İmtahan Tezliklə Başlayır!',
      body: '{{examTitle}} imtahanınız 1 saata başlayır',
      emailSubject: '📚 İmtahan Tezliklə Başlayır - Elmly',
    },
    ru: {
      title: 'Экзамен Скоро Начнется!',
      body: 'Ваш экзамен {{examTitle}} начнется через 1 час',
      emailSubject: '📚 Экзамен Скоро Начнется - Elmly',
    },
  },

  // Payment Notifications
  payment_confirmed: {
    en: {
      title: 'Payment Confirmed',
      body: 'Your payment of {{amount}} has been confirmed',
      emailSubject: '💳 Payment Confirmed - Elmly',
    },
    az: {
      title: 'Ödəniş Təsdiqləndi',
      body: '{{amount}} məbləğində ödənişiniz təsdiqləndi',
      emailSubject: '💳 Ödəniş Təsdiqləndi - Elmly',
    },
    ru: {
      title: 'Платеж Подтвержден',
      body: 'Ваш платеж на сумму {{amount}} подтвержден',
      emailSubject: '💳 Платеж Подтвержден - Elmly',
    },
  },

  // Booking Confirmed for Student (teacher accepts)
  booking_confirmed_student: {
    en: {
      title: 'Booking Confirmed',
      body: '{{teacherName}} has accepted your booking request for {{scheduledDate}}',
      emailSubject: '✅ Booking Confirmed - Elmly',
    },
    az: {
      title: 'Rezervasiya Təsdiqləndi',
      body: '{{teacherName}} {{scheduledDate}} tarixinə rezervasiya sorğunuzu qəbul etdi',
      emailSubject: '✅ Rezervasiya Təsdiqləndi - Elmly',
    },
    ru: {
      title: 'Бронирование Подтверждено',
      body: '{{teacherName}} принял(а) ваш запрос на бронирование на {{scheduledDate}}',
      emailSubject: '✅ Бронирование Подтверждено - Elmly',
    },
  },

  // Message Notifications
  new_message: {
    en: {
      title: 'New Message',
      body: 'You have a new message from {{senderName}}',
      emailSubject: '💬 New Message - Elmly',
    },
    az: {
      title: 'Yeni Mesaj',
      body: '{{senderName}} sizdən yeni mesaj göndərdi',
      emailSubject: '💬 Yeni Mesaj - Elmly',
    },
    ru: {
      title: 'Новое Сообщение',
      body: 'У вас новое сообщение от {{senderName}}',
      emailSubject: '💬 Новое Сообщение - Elmly',
    },
  },

  message_received: {
    en: {
      title: 'New Message from {{senderName}}',
      body: '{{messagePreview}}',
      emailSubject: '💬 New Message - Elmly',
    },
    az: {
      title: '{{senderName}}-dan Yeni Mesaj',
      body: '{{messagePreview}}',
      emailSubject: '💬 Yeni Mesaj - Elmly',
    },
    ru: {
      title: 'Новое Сообщение от {{senderName}}',
      body: '{{messagePreview}}',
      emailSubject: '💬 Новое Сообщение - Elmly',
    },
  },

  // Review Notifications
  review_received: {
    en: {
      title: 'New Review Received',
      body: '{{reviewerName}} left you a {{rating}}-star review',
      emailSubject: '⭐ New Review - Elmly',
    },
    az: {
      title: 'Yeni Rəy Alındı',
      body: '{{reviewerName}} sizə {{rating}} ulduzlu rəy yazdı',
      emailSubject: '⭐ Yeni Rəy - Elmly',
    },
    ru: {
      title: 'Получен Новый Отзыв',
      body: '{{reviewerName}} оставил(а) вам отзыв на {{rating}} звезд',
      emailSubject: '⭐ Новый Отзыв - Elmly',
    },
  },

  // Generic notification (fallback)
  generic: {
    en: {
      title: '{{title}}',
      body: '{{body}}',
      emailSubject: 'Notification - Elmly',
    },
    az: {
      title: '{{title}}',
      body: '{{body}}',
      emailSubject: 'Bildiriş - Elmly',
    },
    ru: {
      title: '{{title}}',
      body: '{{body}}',
      emailSubject: 'Уведомление - Elmly',
    },
  },
};

/**
 * Get translated notification content
 * @param notificationType - Type of notification (e.g., 'booking_confirmed')
 * @param language - User's preferred language
 * @param variables - Template variables to replace (e.g., {teacherName: 'John'})
 * @returns Translated notification with variables replaced
 */
export function getNotificationTranslation(
  notificationType: string,
  language: SupportedLanguage = 'en',
  variables: Record<string, string> = {}
): NotificationTranslation {
  // Get translation for this notification type
  const translations = notificationTranslations[notificationType] || notificationTranslations.generic;
  
  // Get translation for user's language, fallback to English
  let translation = translations[language] || translations.en;

  // Replace template variables
  let title = translation.title;
  let body = translation.body;
  let emailSubject = translation.emailSubject || translation.title;

  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    title = title.replace(new RegExp(placeholder, 'g'), value);
    body = body.replace(new RegExp(placeholder, 'g'), value);
    emailSubject = emailSubject.replace(new RegExp(placeholder, 'g'), value);
  });

  return {
    title,
    body,
    emailSubject,
  };
}

/**
 * Get user's preferred language from database
 * @param userId - User ID
 * @returns User's language preference or 'en' as default
 */
export async function getUserLanguage(userId: string): Promise<SupportedLanguage> {
  try {
    // This will be implemented in the service layer
    // For now, return English as default
    return 'en';
  } catch (error) {
    console.error('Error getting user language:', error);
    return 'en';
  }
}

/**
 * Cancellation Reasons Translations
 * Used in notification modal "Additional Info" section
 */
export const cancellationReasonTranslations: Record<string, { en: string; az: string; ru: string }> = {
  // Common cancellation reasons
  schedule_conflict: {
    en: 'Schedule conflict',
    az: 'Cədvəl uyğunsuzluğu',
    ru: 'Конфликт расписания',
  },
  emergency: {
    en: 'Emergency',
    az: 'Təcili hal',
    ru: 'Экстренная ситуация',
  },
  illness: {
    en: 'Illness',
    az: 'Xəstəlik',
    ru: 'Болезнь',
  },
  personal_reasons: {
    en: 'Personal reasons',
    az: 'Şəxsi səbəblər',
    ru: 'Личные причины',
  },
  found_another_teacher: {
    en: 'Found another teacher',
    az: 'Başqa müəllim tapdım',
    ru: 'Нашел другого учителя',
  },
  no_longer_needed: {
    en: 'No longer needed',
    az: 'Artıq lazım deyil',
    ru: 'Больше не нужно',
  },
  technical_issues: {
    en: 'Technical issues',
    az: 'Texniki problemlər',
    ru: 'Технические проблемы',
  },
  price_concerns: {
    en: 'Price concerns',
    az: 'Qiymət narahatlığı',
    ru: 'Вопросы по цене',
  },
  time_not_suitable: {
    en: 'Time not suitable',
    az: 'Vaxt uyğun deyil',
    ru: 'Время не подходит',
  },
  other: {
    en: 'Other',
    az: 'Digər',
    ru: 'Другое',
  },
  // Cancelled by values
  cancelled_by_student: {
    en: 'Cancelled by student',
    az: 'Tələbə tərəfindən ləğv edildi',
    ru: 'Отменено студентом',
  },
  cancelled_by_teacher: {
    en: 'Cancelled by teacher',
    az: 'Müəllim tərəfindən ləğv edildi',
    ru: 'Отменено учителем',
  },
  student: {
    en: 'Student',
    az: 'Tələbə',
    ru: 'Студент',
  },
  teacher: {
    en: 'Teacher',
    az: 'Müəllim',
    ru: 'Учитель',
  },
};

/**
 * Get translated cancellation reason
 */
export function getCancellationReasonTranslation(
  reasonKey: string,
  language: SupportedLanguage = 'en'
): string {
  const reason = cancellationReasonTranslations[reasonKey];
  if (!reason) {
    return reasonKey; // Return original if not found
  }
  return reason[language] || reason.en;
}

/**
 * UI Labels Translations
 * Used for notification modal labels
 */
export const uiLabelTranslations: Record<string, { en: string; az: string; ru: string }> = {
  additional_info: {
    en: 'Additional Info',
    az: 'Əlavə Məlumat',
    ru: 'Дополнительная Информация',
  },
  cancellation_reason: {
    en: 'Cancellation Reason',
    az: 'Ləğv Səbəbi',
    ru: 'Причина Отмены',
  },
  booking_details: {
    en: 'Booking Details',
    az: 'Rezervasiya Detalları',
    ru: 'Детали Бронирования',
  },
  scheduled_date: {
    en: 'Scheduled Date',
    az: 'Planlaşdırılmış Tarix',
    ru: 'Запланированная Дата',
  },
  scheduled_time: {
    en: 'Scheduled Time',
    az: 'Planlaşdırılmış Vaxt',
    ru: 'Запланированное Время',
  },
  teacher: {
    en: 'Teacher',
    az: 'Müəllim',
    ru: 'Учитель',
  },
  student: {
    en: 'Student',
    az: 'Tələbə',
    ru: 'Студент',
  },
  message_from: {
    en: 'Message from',
    az: 'Mesaj göndərən',
    ru: 'Сообщение от',
  },
};
