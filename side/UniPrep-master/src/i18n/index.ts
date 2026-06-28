// i18n Configuration
// Stage 9: Profile & Settings
// Multi-language support: Azerbaijani, English, Russian

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import az from './translations/az.json';
import en from './translations/en.json';
import ru from './translations/ru.json';

const resources = {
  az: { translation: az },
  en: { translation: en },
  ru: { translation: ru },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'az', // Default language
    fallbackLng: 'en',
    compatibilityJSON: 'v3',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
