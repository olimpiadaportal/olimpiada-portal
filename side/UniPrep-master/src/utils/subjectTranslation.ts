/**
 * Subject name translations
 * Maps English subject names to translation keys
 */

export const SUBJECT_TRANSLATIONS: Record<string, string> = {
  // First Stage
  'Azerbaijani Language': 'subjects.azerbaijaniLanguage',
  'Russian Language': 'subjects.russianLanguage',
  'English Language': 'subjects.englishLanguage',
  'Foreign Language': 'subjects.foreignLanguage',
  'Mathematics (First Stage)': 'subjects.mathematicsFirstStage',
  
  // Second Stage
  'Mathematics': 'subjects.mathematics',
  'Physics': 'subjects.physics',
  'Chemistry': 'subjects.chemistry',
  'Biology': 'subjects.biology',
  'Geography': 'subjects.geography',
  'History': 'subjects.history',
  'Literature': 'subjects.literature',
  
  // Aliases
  'Azerbaijani': 'subjects.azerbaijaniLanguage',
  'Russian': 'subjects.russianLanguage',
  'English': 'subjects.englishLanguage',
};

/**
 * Get translation key for a subject name
 */
export const getSubjectTranslationKey = (subjectName: string): string => {
  return SUBJECT_TRANSLATIONS[subjectName] || subjectName;
};

/**
 * Translate subject name using i18next
 */
export const translateSubject = (subjectName: string, t: (key: string) => string): string => {
  const key = getSubjectTranslationKey(subjectName);
  // If key is the same as input, it means no translation found, return original
  if (key === subjectName) {
    return subjectName;
  }
  return t(key);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Translate known subject names inside already-generated text.
 * This protects cached AI insights that may still contain English subject names.
 */
export const translateSubjectNamesInText = (
  text: string | null | undefined,
  t: (key: string) => string
): string => {
  if (!text) return '';

  return Object.entries(SUBJECT_TRANSLATIONS)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((localizedText, [subjectName, translationKey]) => {
      const translatedName = t(translationKey);
      if (!translatedName || translatedName === translationKey || translatedName === subjectName) {
        return localizedText;
      }

      return localizedText.replace(new RegExp(escapeRegExp(subjectName), 'g'), translatedName);
    }, text);
};
