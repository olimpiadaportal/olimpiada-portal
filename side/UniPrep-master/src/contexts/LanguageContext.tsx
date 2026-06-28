// Language Context
// Stage 9: Profile & Settings
// Provides language switching functionality (az/en/ru)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Language } from '../types/settings';
import { settingsService } from '../services/settingsService';
import { useAuthStore } from '../store/authStore';
import i18n from '../i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, options?: any) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const { user } = useAuthStore();
  const [language, setLanguageState] = useState<Language>('az');

  // Load language from settings on mount
  useEffect(() => {
    loadLanguage();
  }, [user]);

  const loadLanguage = async () => {
    try {
      const settings = await settingsService.getSettings(user?.id);
      setLanguageState(settings.language);
      await i18nInstance.changeLanguage(settings.language);
    } catch (error) {
      console.error('Error loading language:', error);
    }
  };

  const setLanguage = (newLanguage: Language) => {
    // Update state immediately (synchronous)
    setLanguageState(newLanguage);
    
    // Change i18n language synchronously
    i18nInstance.changeLanguage(newLanguage);
    
    // Save to database in background (fire and forget)
    if (user?.id) {
      settingsService.updateSettings({ language: newLanguage }, user.id)
        .then(() => console.log('✅ Language saved:', newLanguage))
        .catch((error) => console.error('Error saving language:', error));
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
