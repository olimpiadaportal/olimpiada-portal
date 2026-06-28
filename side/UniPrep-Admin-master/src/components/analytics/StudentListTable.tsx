import { useState, useEffect } from 'react';
import { DateRange } from '@/services/analyticsService';
import { supabase } from '@/lib/supabase';

interface StudentListTableProps {
  dateRange: DateRange;
  selectedSegment: string | null;
  onSegmentChange: (segment: string | null) => void;
}

interface StudentRow {
  id: string;
  name: string;
  city: string;
  targetGroup: string;
  questionsAttempted: number;
  accuracy: number;
  studyTime: number;
  currentStreak: number;
  lastActive: string;
  segment: string;
}

function deriveSegment(accuracy: number, streak: number, lastActive: string | null): string {
  if (!lastActive || new Date(lastActive) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) return 'inactive';
  if (accuracy > 80) return 'high_performer';
  if (streak >= 7)   return 'power_user';
  if (accuracy < 50) return 'struggling';
  return 'regular';
}

export function StudentListTable({ dateRange, selectedSegment, onSegmentChange }: StudentListTableProps) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'accuracy' | 'questions' | 'studyTime'>('accuracy');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { loadStudents(); }, [dateRange, selectedSegment]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('admin_get_student_list', {
        p_start_date: dateRange.startDate,
        p_end_date:   dateRange.endDate,
        p_limit:      200,
      });

      if (rpcError) throw rpcError;

      const rows: StudentRow[] = (data as any[] || []).map((s: any) => ({
        id:                 s.id,
        name:               s.name || 'Unknown',
        city:               s.city || 'Unknown',
        targetGroup:        s.targetGroup || '—',
        questionsAttempted: s.questionsAttempted ?? 0,
        accuracy:           s.accuracy ?? 0,
        studyTime:          s.studyTime ?? 0,
        currentStreak:      s.currentStreak ?? 0,
        lastActive:         s.lastActive || '',
        segment:            deriveSegment(s.accuracy ?? 0, s.currentStreak ?? 0, s.lastActive),
      }));

      setStudents(rows);
    } catch (err: any) {
      console.error('Load students error:', err);
      setError(err?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const filtered = students
    .filter(s => {
      if (selectedSegment && s.segment !== selectedSegment) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const map = { name: a.name, accuracy: a.accuracy, questions: a.questionsAttempted, studyTime: a.studyTime };
      const mapB = { name: b.name, accuracy: b.accuracy, questions: b.questionsAttempted, studyTime: b.studyTime };
      const av = map[sortBy]; const bv = mapB[sortBy];
      return sortOrder === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const getSegmentBadge = (segment: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      high_performer: { label: 'High Performer', color: 'bg-green-100 text-green-800' },
      power_user:     { label: 'Power User',     color: 'bg-blue-100 text-blue-800'   },
      struggling:     { label: 'Struggling',     color: 'bg-yellow-100 text-yellow-800' },
      at_risk:        { label: 'At Risk',        color: 'bg-red-100 text-red-800'     },
      inactive:       { label: 'Inactive',       color: 'bg-gray-100 text-gray-600'   },
      regular:        { label: 'Regular',        color: 'bg-gray-100 text-gray-600'   },
    };
    const b = badges[segment] || badges.regular;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.color}`}>{b.label}</span>;
  };

  const sortHeader = (key: typeof sortBy, label: string) => (
    <th
      className="text-right text-xs font-medium text-gray-600 uppercase py-3 cursor-pointer hover:text-gray-900"
      onClick={() => { setSortBy(key); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
    >
      {label} {sortBy === key ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Student List</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-64 text-sm"
          />
          <select
            value={selectedSegment || ''}
            onChange={(e) => onSegmentChange(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">All Segments</option>
            <option value="high_performer">High Performers</option>
            <option value="power_user">Power Users</option>
            <option value="struggling">Struggling</option>
            <option value="at_risk">At Risk</option>
            <option value="inactive">Inactive</option>
            <option value="regular">Regular</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="h-32 flex items-center justify-center text-red-600 text-sm">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th
                  className="text-left text-xs font-medium text-gray-600 uppercase py-3 cursor-pointer hover:text-gray-900"
                  onClick={() => { setSortBy('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                >
                  Student {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Location</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Segment</th>
                {sortHeader('questions', 'Questions')}
                {sortHeader('accuracy', 'Accuracy')}
                {sortHeader('studyTime', 'Study Time')}
                <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Streak</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500 text-sm">
                    {students.length === 0 ? 'No students found in the database.' : 'No students match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="text-sm font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-400">Group {s.targetGroup}</div>
                    </td>
                    <td className="py-3 text-sm text-gray-700">{s.city}</td>
                    <td className="py-3">{getSegmentBadge(s.segment)}</td>
                    <td className="py-3 text-sm text-right text-gray-900">{s.questionsAttempted}</td>
                    <td className="py-3 text-sm text-right">
                      <span className={`font-medium ${s.accuracy >= 70 ? 'text-green-600' : s.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {s.accuracy}%
                      </span>
                    </td>
                    <td className="py-3 text-sm text-right text-gray-700">{Math.round(s.studyTime)}m</td>
                    <td className="py-3 text-sm text-right">
                      <span className="font-medium text-orange-600">{s.currentStreak} 🔥</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        Showing {filtered.length} of {students.length} students
      </div>
    </div>
  );
}
