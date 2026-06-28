// Date formatting utilities
// Handles locale-aware date formatting with proper capitalization

// Azerbaijani month names (short and long)
const AZ_MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
const AZ_MONTHS_LONG = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

// Azerbaijani weekday names (long)
const AZ_WEEKDAYS_LONG = ['Bazar', 'Bazar Ertəsi', 'Çərşənbə Axşamı', 'Çərşənbə', 'Cümə Axşamı', 'Cümə', 'Şənbə'];

// Russian month names (short and long)
const RU_MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const RU_MONTHS_LONG = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// Russian weekday names (long)
const RU_WEEKDAYS_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

/**
 * Gets month name based on locale
 */
const getMonthName = (monthIndex: number, locale: string, isShort: boolean): string => {
  if (locale.startsWith('az')) {
    return isShort ? AZ_MONTHS_SHORT[monthIndex] : AZ_MONTHS_LONG[monthIndex];
  }
  if (locale.startsWith('ru')) {
    return isShort ? RU_MONTHS_SHORT[monthIndex] : RU_MONTHS_LONG[monthIndex];
  }
  // Fallback to English
  const date = new Date(2000, monthIndex, 1);
  return date.toLocaleDateString('en-US', { month: isShort ? 'short' : 'long' });
};

/**
 * Gets weekday name based on locale
 */
const getWeekdayName = (dayIndex: number, locale: string): string => {
  if (locale.startsWith('az')) {
    return AZ_WEEKDAYS_LONG[dayIndex];
  }
  if (locale.startsWith('ru')) {
    return RU_WEEKDAYS_LONG[dayIndex];
  }
  // Fallback to English
  const date = new Date(2000, 0, 2 + dayIndex); // Jan 2, 2000 was a Sunday
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

/**
 * Formats a date with capitalized month/weekday names
 * Uses custom translations for Azerbaijani and Russian since React Native
 * doesn't properly support these locales in toLocaleDateString
 */
export const formatDateWithCapitalizedMonth = (
  date: Date | string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // For Azerbaijani and Russian, use custom formatting
  if (locale.startsWith('az') || locale.startsWith('ru')) {
    const day = dateObj.getDate();
    const monthIndex = dateObj.getMonth();
    const year = dateObj.getFullYear();
    const weekdayIndex = dateObj.getDay();
    
    const isShortMonth = options.month === 'short';
    const monthName = getMonthName(monthIndex, locale, isShortMonth);
    const weekdayName = options.weekday ? getWeekdayName(weekdayIndex, locale) : '';
    
    // Build the formatted string based on options
    let result = '';
    
    if (options.weekday) {
      result += weekdayName + ', ';
    }
    
    // Format: "day month year" for az/ru
    result += `${day} ${monthName}`;
    
    if (options.year) {
      result += ` ${year}`;
    }
    
    return result;
  }
  
  // For other locales, use native formatting
  const formatted = dateObj.toLocaleDateString(locale, options);
  return formatted;
};

/**
 * Formats a date for display in booking/reservation screens
 * Returns formatted date with capitalized month names
 */
export const formatBookingDate = (
  date: Date | string,
  locale: string,
  includeWeekday: boolean = true
): string => {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  
  if (includeWeekday) {
    options.weekday = 'long';
  }
  
  return formatDateWithCapitalizedMonth(date, locale, options);
};

/**
 * Formats a date with long month name for confirmation screens
 */
export const formatConfirmationDate = (
  date: Date | string,
  locale: string
): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  
  return formatDateWithCapitalizedMonth(date, locale, options);
};

/**
 * Simple date format (day month year) - no weekday
 * Use this as a drop-in replacement for toLocaleDateString
 */
export const formatSimpleDate = (
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  };
  
  return formatDateWithCapitalizedMonth(date, locale, defaultOptions);
};

/**
 * Short date format (day short-month year)
 */
export const formatShortDate = (
  date: Date | string,
  locale: string
): string => {
  return formatDateWithCapitalizedMonth(date, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
