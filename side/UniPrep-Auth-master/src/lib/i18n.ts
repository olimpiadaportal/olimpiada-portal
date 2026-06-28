// Client-side i18n for the Elmly auth service
// No page refresh - just React state changes

export type Language = 'en' | 'az' | 'ru';

export const STORAGE_KEY = 'uniprep_auth_language';

// Get browser language
export const getBrowserLanguage = (): Language => {
  if (typeof window === 'undefined') return 'en';
  
  const browserLang = navigator.language.toLowerCase();
  
  if (browserLang.startsWith('az')) return 'az';
  if (browserLang.startsWith('ru')) return 'ru';
  return 'en';
};

// Get saved language or browser language
export const getSavedLanguage = (): Language => {
  if (typeof window === 'undefined') return 'en';
  
  const saved = localStorage.getItem(STORAGE_KEY) as Language;
  if (saved && ['en', 'az', 'ru'].includes(saved)) {
    return saved;
  }
  
  return getBrowserLanguage();
};

// Save language preference
export const saveLanguage = (lang: Language): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
};
