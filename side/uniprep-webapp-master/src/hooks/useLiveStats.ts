'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface LiveStats {
  activeStudents: number;
  verifiedTeachers: number;
  practiceQuestions: number;
  loading: boolean;
}

const FALLBACK: LiveStats = {
  activeStudents: 10000,
  verifiedTeachers: 500,
  practiceQuestions: 50000,
  loading: false,
};

/**
 * Fetches real-time platform stats from the database.
 * Falls back to static values if the query fails.
 */
export function useLiveStats(): LiveStats {
  const [stats, setStats] = useState<LiveStats>({ ...FALLBACK, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const supabase = createClient();

        const [studentsRes, teachersRes, questionsRes] = await Promise.all([
          supabase.from('students').select('id', { count: 'exact', head: true }),
          supabase
            .from('teachers')
            .select('id', { count: 'exact', head: true })
            .eq('is_verified', true),
          supabase.from('questions').select('id', { count: 'exact', head: true }),
        ]);

        if (cancelled) return;

        setStats({
          activeStudents: studentsRes.count ?? FALLBACK.activeStudents,
          verifiedTeachers: teachersRes.count ?? FALLBACK.verifiedTeachers,
          practiceQuestions: questionsRes.count ?? FALLBACK.practiceQuestions,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setStats({ ...FALLBACK, loading: false });
        }
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  return stats;
}
