/**
 * Subject Translation Utility
 * Translates subject names based on current locale
 * For Russian, falls back to Azerbaijani if Russian translation not available
 */

export interface Subject {
  name_en?: string;
  name_az?: string;
  name_ru?: string;
}

const SUBJECT_TEXT_TRANSLATIONS: Record<string, string> = {
  'Azerbaijani Language': 'subjects.azerbaijani',
  Azerbaijani: 'subjects.azerbaijani',
  'English Language': 'subjects.english',
  English: 'subjects.english',
  'Russian Language': 'subjects.russian',
  Russian: 'subjects.russian',
  'Mathematics (First Stage)': 'subjects.mathematics',
  Mathematics: 'subjects.mathematics',
  Physics: 'subjects.physics',
  Chemistry: 'subjects.chemistry',
  Biology: 'subjects.biology',
  Geography: 'subjects.geography',
  History: 'subjects.history',
  Literature: 'subjects.literature',
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Get translated subject name based on locale
 * @param subject - Subject object with translations
 * @param locale - Current locale ('en', 'az', 'ru')
 * @returns Translated subject name
 */
export function getTranslatedSubjectName(
  subject: Subject | null | undefined,
  locale: string
): string {
  if (!subject) return 'Unknown';

  switch (locale) {
    case 'az':
      return subject.name_az || subject.name_en || 'Unknown';
    case 'ru':
      // For Russian, use name_az as fallback since name_ru doesn't exist
      return subject.name_ru || subject.name_az || subject.name_en || 'Unknown';
    case 'en':
    default:
      return subject.name_en || subject.name_az || 'Unknown';
  }
}

export function translateSubjectNamesInText(
  text: string | null | undefined,
  locale: string,
  t: (key: string) => string
): string {
  if (!text) return '';
  if (locale === 'en') return text;

  return Object.entries(SUBJECT_TEXT_TRANSLATIONS)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((localizedText, [subjectName, translationKey]) => {
      const translatedName = t(translationKey);
      if (!translatedName || translatedName === translationKey || translatedName === subjectName) {
        return localizedText;
      }

      return localizedText.replace(new RegExp(escapeRegExp(subjectName), 'g'), translatedName);
    }, text);
}
