// Translations for Elmly Auth pages
// Email confirmation and password reset

export const translations = {
  en: {
    // Common
    appName: 'Elmly',
    loading: 'Loading...',
    verifying: 'Verifying...',
    copyright: 'All rights reserved.',
    
    // Alert messages
    alerts: {
      requestNewEmail: 'Please go back to the app and request a new verification email.',
      requestNewReset: 'Please go back to the app and request a new password reset link.',
    },
    
    // Email Confirmation
    emailConfirm: {
      title: 'Verifying your email...',
      subtitle: 'Please wait while we confirm your email address.',
      successTitle: 'Email Verified!',
      successMessage: 'Your email has been successfully verified. You can now use all features of the app.',
      openApp: 'Open Elmly App',
      openAppHint: "If the app doesn't open automatically, please open it manually.",
      errorTitle: 'Verification Failed',
      errorMessage: "We couldn't verify your email address.",
      expiredTitle: 'Link Expired',
      expiredMessage: 'This verification link has expired. Please request a new one from the app.',
      requestNewLink: 'Request New Link',
    },
    
    // Password Reset
    passwordReset: {
      title: 'Reset Your Password',
      subtitle: 'Enter your new password below.',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      newPasswordPlaceholder: 'Enter new password',
      confirmPasswordPlaceholder: 'Confirm new password',
      resetButton: 'Reset Password',
      resetting: 'Resetting...',
      successTitle: 'Password Reset!',
      successMessage: 'Your password has been successfully reset. You can now log in with your new password.',
      errorTitle: 'Reset Failed',
      errorMessage: "We couldn't process your password reset.",
      expiredTitle: 'Link Expired',
      expiredMessage: 'This password reset link has expired. Please request a new one from the app.',
      requestNewLink: 'Request New Link',

      // Validation errors
      passwordMismatch: 'Passwords do not match',
      passwordTooShort: 'Password must be at least 8 characters',
      passwordRequirements: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },

    // Delete Account
    deleteAccount: {
      title: 'Delete Your Account',
      subtitle: 'This action is permanent and cannot be undone.',
      warningTitle: 'What will be permanently deleted:',
      warningItems: [
        'Your profile and account credentials',
        'All practice history and exam results',
        'Your bookings and session history',
        'All saved bookmarks and settings',
      ],
      stepLogin: 'Step 1: Verify your identity',
      email: 'Email',
      password: 'Password',
      emailPlaceholder: 'Enter your email',
      passwordPlaceholder: 'Enter your password',
      loginButton: 'Verify Identity',
      verifying: 'Verifying...',
      stepConfirm: 'Step 2: Confirm deletion',
      confirmInstruction: 'Type DELETE in the box below to confirm you want to permanently delete your account.',
      confirmPlaceholder: 'Type DELETE',
      deleteButton: 'Permanently Delete Account',
      deleting: 'Deleting...',
      successTitle: 'Account Deleted',
      successMessage: 'Your account and all associated data have been permanently deleted. We\'re sorry to see you go.',
      errorTitle: 'Deletion Failed',
      errorMessage: 'Something went wrong. Please try again or contact support.',
      wrongCredentials: 'Incorrect email or password. Please try again.',
      mustTypeDelete: 'Please type DELETE exactly to confirm.',
      tooManyAttempts: 'Too many failed attempts. Please wait {seconds} seconds.',
    },
  },

  az: {
    // Common
    appName: 'Elmly',
    loading: 'Yüklənir...',
    verifying: 'Yoxlanılır...',
    copyright: 'Bütün hüquqlar qorunur.',
    
    // Alert messages
    alerts: {
      requestNewEmail: 'Tətbiqə qayıdın və yeni təsdiqləmə e-poçtu tələb edin.',
      requestNewReset: 'Tətbiqə qayıdın və yeni şifrə sıfırlama linki tələb edin.',
    },
    
    // Email Confirmation
    emailConfirm: {
      title: 'E-poçtunuz yoxlanılır...',
      subtitle: 'E-poçt ünvanınızı təsdiq edərkən gözləyin.',
      successTitle: 'E-poçt Təsdiqləndi!',
      successMessage: 'E-poçtunuz uğurla təsdiqləndi. İndi tətbiqin bütün funksiyalarından istifadə edə bilərsiniz.',
      openApp: 'Elmly Tətbiqini Aç',
      openAppHint: 'Tətbiq avtomatik açılmazsa, onu əl ilə açın.',
      errorTitle: 'Təsdiqləmə Uğursuz Oldu',
      errorMessage: 'E-poçt ünvanınızı təsdiqləyə bilmədik.',
      expiredTitle: 'Linkin Vaxtı Bitib',
      expiredMessage: 'Bu təsdiqləmə linkinin vaxtı bitib. Tətbiqdən yeni link tələb edin.',
      requestNewLink: 'Yeni Link Tələb Et',
    },
    
    // Password Reset
    passwordReset: {
      title: 'Şifrəni Sıfırla',
      subtitle: 'Aşağıda yeni şifrənizi daxil edin.',
      newPassword: 'Yeni Şifrə',
      confirmPassword: 'Şifrəni Təsdiqlə',
      newPasswordPlaceholder: 'Yeni şifrəni daxil edin',
      confirmPasswordPlaceholder: 'Şifrəni təsdiqləyin',
      resetButton: 'Şifrəni Sıfırla',
      resetting: 'Sıfırlanır...',
      successTitle: 'Şifrə Sıfırlandı!',
      successMessage: 'Şifrəniz uğurla sıfırlandı. İndi yeni şifrənizlə daxil ola bilərsiniz.',
      errorTitle: 'Sıfırlama Uğursuz Oldu',
      errorMessage: 'Şifrə sıfırlamanı tamamlaya bilmədik.',
      expiredTitle: 'Linkin Vaxtı Bitib',
      expiredMessage: 'Bu şifrə sıfırlama linkinin vaxtı bitib. Tətbiqdən yeni link tələb edin.',
      requestNewLink: 'Yeni Link Tələb Et',
      
      // Validation errors
      passwordMismatch: 'Şifrələr uyğun gəlmir',
      passwordTooShort: 'Şifrə ən azı 8 simvoldan ibarət olmalıdır',
      passwordRequirements: 'Şifrə ən azı bir böyük hərf, bir kiçik hərf, bir rəqəm və bir xüsusi simvol ehtiva etməlidir',
    },

    // Delete Account
    deleteAccount: {
      title: 'Hesabı Sil',
      subtitle: 'Bu əməliyyat daimdir və geri qaytarıla bilməz.',
      warningTitle: 'Daimi olaraq silinəcəklər:',
      warningItems: [
        'Profiliniz və hesab məlumatlarınız',
        'Bütün məşq tarixi və imtahan nəticələri',
        'Bükölmələriniz və sessiya tarixçəniz',
        'Bütün yer işarələri və parametrlər',
      ],
      stepLogin: 'Addım 1: Kimliyinizi doğrulayın',
      email: 'E-poçt',
      password: 'Şifrə',
      emailPlaceholder: 'E-poçtunuzu daxil edin',
      passwordPlaceholder: 'Şifrənizi daxil edin',
      loginButton: 'Kimliyimi Doğrula',
      verifying: 'Yoxlanılır...',
      stepConfirm: 'Addım 2: Silinməni təsdiqlə',
      confirmInstruction: 'Hesabınızı daimi olaraq silmək istədiyinizi təsdiqləmək üçün aşağıdakı qutuya DELETE yazın.',
      confirmPlaceholder: 'DELETE yazın',
      deleteButton: 'Hesabı Daimi Olaraq Sil',
      deleting: 'Silinir...',
      successTitle: 'Hesab Silindi',
      successMessage: 'Hesabınız və bütün əlaqəli məlumatlar daimi olaraq silindi. Sizi itirdiyimizə görə üzülürük.',
      errorTitle: 'Silmə Uğursuz Oldu',
      errorMessage: 'Xəta baş verdi. Yenidən cəhd edin və ya dəstəklə əlaqə saxlayın.',
      wrongCredentials: 'Yanlış e-poçt və ya şifrə. Yenidən cəhd edin.',
      mustTypeDelete: 'Təsdiqləmək üçün tam olaraq DELETE yazın.',
      tooManyAttempts: 'Çox sayda uğursuz cəhd. {seconds} saniyə gözləyin.',
    },
  },

  ru: {
    // Common
    appName: 'Elmly',
    loading: 'Загрузка...',
    verifying: 'Проверка...',
    copyright: 'Все права защищены.',
    
    // Alert messages
    alerts: {
      requestNewEmail: 'Пожалуйста, вернитесь в приложение и запросите новое письмо с подтверждением.',
      requestNewReset: 'Пожалуйста, вернитесь в приложение и запросите новую ссылку для сброса пароля.',
    },
    
    // Email Confirmation
    emailConfirm: {
      title: 'Проверка вашей электронной почты...',
      subtitle: 'Пожалуйста, подождите, пока мы подтвердим ваш адрес электронной почты.',
      successTitle: 'Электронная почта подтверждена!',
      successMessage: 'Ваша электронная почта успешно подтверждена. Теперь вы можете использовать все функции приложения.',
      openApp: 'Открыть приложение Elmly',
      openAppHint: 'Если приложение не открывается автоматически, откройте его вручную.',
      errorTitle: 'Проверка не удалась',
      errorMessage: 'Не удалось подтвердить ваш адрес электронной почты.',
      expiredTitle: 'Ссылка истекла',
      expiredMessage: 'Срок действия этой ссылки для подтверждения истек. Пожалуйста, запросите новую из приложения.',
      requestNewLink: 'Запросить новую ссылку',
    },
    
    // Password Reset
    passwordReset: {
      title: 'Сброс пароля',
      subtitle: 'Введите новый пароль ниже.',
      newPassword: 'Новый пароль',
      confirmPassword: 'Подтвердите пароль',
      newPasswordPlaceholder: 'Введите новый пароль',
      confirmPasswordPlaceholder: 'Подтвердите пароль',
      resetButton: 'Сбросить пароль',
      resetting: 'Сброс...',
      successTitle: 'Пароль сброшен!',
      successMessage: 'Ваш пароль успешно сброшен. Теперь вы можете войти с новым паролем.',
      errorTitle: 'Сброс не удался',
      errorMessage: 'Не удалось обработать сброс пароля.',
      expiredTitle: 'Ссылка истекла',
      expiredMessage: 'Срок действия этой ссылки для сброса пароля истек. Пожалуйста, запросите новую из приложения.',
      requestNewLink: 'Запросить новую ссылку',
      
      // Validation errors
      passwordMismatch: 'Пароли не совпадают',
      passwordTooShort: 'Пароль должен содержать не менее 8 символов',
      passwordRequirements: 'Пароль должен содержать хотя бы одну заглавную букву, одну строчную букву, одну цифру и один специальный символ',
    },

    // Delete Account
    deleteAccount: {
      title: 'Удалить аккаунт',
      subtitle: 'Это действие необратимо.',
      warningTitle: 'Что будет удалено навсегда:',
      warningItems: [
        'Ваш профиль и учётные данные',
        'История практики и результаты экзаменов',
        'Бронирования и история сессий',
        'Все закладки и настройки',
      ],
      stepLogin: 'Шаг 1: Подтвердите личность',
      email: 'Email',
      password: 'Пароль',
      emailPlaceholder: 'Введите email',
      passwordPlaceholder: 'Введите пароль',
      loginButton: 'Подтвердить личность',
      verifying: 'Проверка...',
      stepConfirm: 'Шаг 2: Подтвердите удаление',
      confirmInstruction: 'Введите DELETE в поле ниже для подтверждения постоянного удаления аккаунта.',
      confirmPlaceholder: 'Введите DELETE',
      deleteButton: 'Удалить аккаунт навсегда',
      deleting: 'Удаление...',
      successTitle: 'Аккаунт удалён',
      successMessage: 'Ваш аккаунт и все связанные данные были безвозвратно удалены. Нам жаль вас терять.',
      errorTitle: 'Удаление не удалось',
      errorMessage: 'Что-то пошло не так. Попробуйте снова или обратитесь в поддержку.',
      wrongCredentials: 'Неверный email или пароль. Попробуйте снова.',
      mustTypeDelete: 'Введите DELETE точно для подтверждения.',
      tooManyAttempts: 'Слишком много неудачных попыток. Подождите {seconds} секунд.',
    },
  },
};

export type TranslationKey = keyof typeof translations.en;
