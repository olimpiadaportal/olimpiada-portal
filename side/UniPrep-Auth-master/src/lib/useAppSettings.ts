// useAppSettings Hook for the Elmly auth service
// Fetches dynamic app name from system_settings table

'use client';

import { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface AppSettings {
  appName: string;
  loading: boolean;
}

const DEFAULT_APP_NAME = 'Elmly';

// Cache settings in memory
let cachedAppName: string | null = null;

export function useAppSettings(): AppSettings {
  const [appName, setAppName] = useState<string>(cachedAppName || DEFAULT_APP_NAME);
  const [loading, setLoading] = useState(!cachedAppName);

  useEffect(() => {
    const loadSettings = async () => {
      // Use cache if available
      if (cachedAppName) {
        setAppName(cachedAppName);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value')
          .eq('key', 'app_name')
          .single();

        if (error) {
          console.error('Error loading app settings:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Handle JSONB value
          let actualValue = data.value;
          if (typeof actualValue === 'object' && actualValue !== null) {
            actualValue = actualValue.value || DEFAULT_APP_NAME;
          }
          
          const newAppName = actualValue || DEFAULT_APP_NAME;
          cachedAppName = newAppName;
          setAppName(newAppName);
        }
      } catch (err) {
        console.error('Error loading app settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  return { appName, loading };
}
