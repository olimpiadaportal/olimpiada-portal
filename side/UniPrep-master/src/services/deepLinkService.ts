import * as Linking from 'expo-linking';

export interface DeepLink {
  type: 'teacher' | 'exam' | 'mock-exam' | 'subject' | 'practice' | 'chat' | 'profile' | 'bookings' | 'notifications' | 'confirm-email' | 'reset-password' | 'unknown';
  id?: string;
  params?: Record<string, string>;
  // Auth-specific params
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
}

/**
 * Deep Link Route Definitions
 * Used by Admin Panel for Action URL selection
 */
export const DEEP_LINK_ROUTES = {
  // Practice & Learning
  practice: {
    label: 'Practice Home',
    path: 'elmly://practice',
    description: 'Opens the practice/subjects list screen',
    requiresId: false,
  },
  subject: {
    label: 'Subject Detail',
    path: 'elmly://subject/{id}',
    description: 'Opens a specific subject with its questions',
    requiresId: true,
    idLabel: 'Subject ID',
  },
  // Exams
  exam: {
    label: 'Exams List',
    path: 'elmly://exam',
    description: 'Opens the mock exams list screen',
    requiresId: false,
  },
  'mock-exam': {
    label: 'Mock Exam Detail',
    path: 'elmly://mock-exam/{id}',
    description: 'Opens a specific mock exam detail page',
    requiresId: true,
    idLabel: 'Mock Exam ID',
  },
  // Teachers
  teacher: {
    label: 'Teacher Profile',
    path: 'elmly://teacher/{id}',
    description: 'Opens a specific teacher profile',
    requiresId: true,
    idLabel: 'Teacher ID',
  },
  // Chat
  chat: {
    label: 'Chat Conversation',
    path: 'elmly://chat/{id}',
    description: 'Opens a specific chat conversation',
    requiresId: true,
    idLabel: 'Conversation ID',
  },
  // User
  profile: {
    label: 'My Profile',
    path: 'elmly://profile',
    description: 'Opens the user profile screen',
    requiresId: false,
  },
  bookings: {
    label: 'My Bookings',
    path: 'elmly://bookings',
    description: 'Opens the bookings list screen',
    requiresId: false,
  },
  notifications: {
    label: 'Notifications',
    path: 'elmly://notifications',
    description: 'Opens the notification center',
    requiresId: false,
  },
} as const;

export type DeepLinkRouteKey = keyof typeof DEEP_LINK_ROUTES;

// UUID v4 pattern — all entity IDs in the system are UUIDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize a string parameter from a deep link URL.
 * Strips HTML tags, javascript: URIs, and event handlers.
 */
const sanitizeParam = (value: string | undefined): string | undefined => {
  if (!value) return value;
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, 500); // Cap length
};

/**
 * Validate that a string is a valid UUID (used for entity IDs).
 */
const isValidUUID = (value: string | undefined): boolean => {
  if (!value) return false;
  return UUID_REGEX.test(value);
};

class DeepLinkService {
  /**
   * Parse a deep link URL
   * Supports: 
   * - elmly://teacher/123
   * - elmly://exam/456
   * - elmly://confirm-email?access_token=xxx&refresh_token=xxx
   * - elmly://reset-password?access_token=xxx&refresh_token=xxx
   */
  parseUrl(url: string): DeepLink | null {
    try {
      // Ignore Expo dev server URLs
      if (url.startsWith('exp://') || url.includes('localhost') || url.includes('192.168')) {
        return null;
      }

      console.log('🔗 Parsing deep link URL:', url);
      const parsed = Linking.parse(url);
      const { hostname, path, queryParams } = parsed;
      console.log('🔗 Parsed:', { hostname, path, queryParams });

      // Handle different URL formats
      // Format 1: elmly://teacher/123
      // Format 2: elmly://teacher?id=123
      // Format 3: elmly://confirm-email#access_token=xxx (Supabase hash format)
      // Format 4: elmly://reset-password#access_token=xxx (Supabase hash format)
      
      if (!hostname && !path) {
        return { type: 'unknown' };
      }

      // Extract type and id from path
      const pathParts = (path || '').split('/').filter(Boolean);
      const type = (hostname || pathParts[0]) as DeepLink['type'];
      const id = pathParts[1] || queryParams?.id as string;

      // Validate type
      const validTypes = ['teacher', 'exam', 'mock-exam', 'subject', 'practice', 'chat', 'profile', 'bookings', 'notifications', 'confirm-email', 'reset-password'];
      if (!validTypes.includes(type)) {
        console.warn('Invalid deep link type:', type);
        return { type: 'unknown' };
      }

      // Handle auth deep links with tokens
      if (type === 'confirm-email' || type === 'reset-password') {
        // Supabase sends tokens in hash fragment or query params
        const accessToken = sanitizeParam(queryParams?.access_token as string || this.extractHashParam(url, 'access_token'));
        const refreshToken = sanitizeParam(queryParams?.refresh_token as string || this.extractHashParam(url, 'refresh_token'));
        const tokenType = sanitizeParam(queryParams?.type as string || this.extractHashParam(url, 'type'));

        return {
          type,
          params: queryParams as Record<string, string>,
          accessToken,
          refreshToken,
          tokenType,
        };
      }

      // For entity deep links, validate that IDs are valid UUIDs
      const requiresId = ['teacher', 'exam', 'mock-exam', 'subject', 'chat', 'profile'].includes(type);
      if (requiresId && id && !isValidUUID(id)) {
        console.warn('Deep link ID is not a valid UUID:', id);
        return { type: 'unknown' };
      }

      return {
        type,
        id,
        params: queryParams as Record<string, string>,
      };
    } catch (error) {
      console.error('Deep link parse error:', error);
      return null;
    }
  }

  /**
   * Extract parameter from URL hash fragment
   * Supabase often sends tokens in hash: elmly://reset-password#access_token=xxx&refresh_token=xxx
   */
  private extractHashParam(url: string, param: string): string | undefined {
    try {
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return undefined;
      
      const hash = url.substring(hashIndex + 1);
      const params = new URLSearchParams(hash);
      return params.get(param) || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Generate a deep link URL
   */
  generateLink(type: DeepLink['type'], id: string, params?: Record<string, string>): string {
    let url = `elmly://${type}/${id}`;
    
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Get the initial URL (when app is opened via deep link)
   */
  async getInitialUrl(): Promise<string | null> {
    try {
      return await Linking.getInitialURL();
    } catch (error) {
      console.error('Get initial URL error:', error);
      return null;
    }
  }

  /**
   * Subscribe to deep link events (when app is already open)
   */
  addEventListener(callback: (url: string) => void): { remove: () => void } {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      callback(url);
    });

    return {
      remove: () => subscription.remove(),
    };
  }
}

export const deepLinkService = new DeepLinkService();
