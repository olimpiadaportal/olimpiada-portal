'use client';

/**
 * Deep Link Picker Component
 * Allows admins to select and configure action URLs for notifications
 * Supports both internal deep links and external URLs
 */

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

// Deep Link Route Definitions (mirrored from mobile app)
const DEEP_LINK_ROUTES = {
  // Practice & Learning
  practice: {
    label: 'Practice Home',
    path: 'elmly://practice',
    description: 'Opens the practice/subjects list screen',
    requiresId: false,
    category: 'Learning',
  },
  subject: {
    label: 'Subject Detail',
    path: 'elmly://subject/{id}',
    description: 'Opens a specific subject with its questions',
    requiresId: true,
    idLabel: 'Subject',
    category: 'Learning',
  },
  // Exams
  exam: {
    label: 'Exams List',
    path: 'elmly://exam',
    description: 'Opens the mock exams list screen',
    requiresId: false,
    category: 'Exams',
  },
  'mock-exam': {
    label: 'Mock Exam Detail',
    path: 'elmly://mock-exam/{id}',
    description: 'Opens a specific mock exam detail page',
    requiresId: true,
    idLabel: 'Mock Exam',
    category: 'Exams',
  },
  // Teachers
  teacher: {
    label: 'Teacher Profile',
    path: 'elmly://teacher/{id}',
    description: 'Opens a specific teacher profile',
    requiresId: true,
    idLabel: 'Teacher',
    category: 'Teachers',
  },
  booking: {
    label: 'Booking Detail',
    path: 'elmly://booking/{id}',
    description: 'Opens a specific booking detail page',
    requiresId: true,
    idLabel: 'Booking',
    category: 'Teachers',
  },
  bookings: {
    label: 'My Bookings',
    path: 'elmly://bookings',
    description: 'Opens the bookings list screen',
    requiresId: false,
    category: 'Teachers',
  },
  // Navigation
  home: {
    label: 'Home',
    path: 'elmly://home',
    description: 'Opens the home/dashboard screen',
    requiresId: false,
    category: 'Navigation',
  },
  analytics: {
    label: 'Analytics',
    path: 'elmly://analytics',
    description: 'Opens the analytics/statistics screen',
    requiresId: false,
    category: 'Navigation',
  },
  leaderboard: {
    label: 'Leaderboard',
    path: 'elmly://leaderboard',
    description: 'Opens the leaderboard/rankings screen',
    requiresId: false,
    category: 'Navigation',
  },
  // User
  profile: {
    label: 'My Profile',
    path: 'elmly://profile',
    description: 'Opens the user profile screen',
    requiresId: false,
    category: 'User',
  },
  notifications: {
    label: 'Notifications',
    path: 'elmly://notifications',
    description: 'Opens the notification center',
    requiresId: false,
    category: 'User',
  },
  settings: {
    label: 'Settings',
    path: 'elmly://settings',
    description: 'Opens the settings screen',
    requiresId: false,
    category: 'User',
  },
  // Messaging
  chat: {
    label: 'Chat/Conversation',
    path: 'elmly://chat/{id}',
    description: 'Opens a specific chat conversation',
    requiresId: true,
    idLabel: 'Conversation',
    category: 'Messaging',
  },
} as const;

type RouteKey = keyof typeof DEEP_LINK_ROUTES;

interface DeepLinkPickerProps {
  value: string;
  onChange: (url: string) => void;
}

interface Subject {
  id: string;
  name_en: string;
  name_az: string;
}

interface MockExam {
  id: string;
  title: string;
}

interface Teacher {
  id: string;
  profiles: {
    full_name: string;
  } | null;
}

interface Booking {
  id: string;
  student_id: string;
  teacher_id: string;
  status: string;
  scheduled_date: string;
}

interface Conversation {
  id: string;
  student_id: string;
  teacher_id: string;
  created_at: string;
}

export function DeepLinkPicker({ value, onChange }: DeepLinkPickerProps) {
  const [mode, setMode] = useState<'picker' | 'manual' | 'help'>('picker');
  const [selectedRoute, setSelectedRoute] = useState<RouteKey | ''>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data for dropdowns
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  // Parse existing value on mount
  useEffect(() => {
    if (value) {
      // Check if it's a deep link
      if (value.startsWith('elmly://')) {
        const match = value.match(/elmly:\/\/([^/]+)(?:\/(.+))?/);
        if (match) {
          const route = match[1] as RouteKey;
          const id = match[2] || '';
          if (DEEP_LINK_ROUTES[route]) {
            setSelectedRoute(route);
            setSelectedId(id);
            setMode('picker');
            return;
          }
        }
      }
      // If not a recognized deep link, switch to manual mode
      setMode('manual');
    }
  }, []);

  // Load data when route changes
  useEffect(() => {
    if (selectedRoute && DEEP_LINK_ROUTES[selectedRoute]?.requiresId) {
      loadDataForRoute(selectedRoute);
    }
  }, [selectedRoute]);

  const loadDataForRoute = async (route: RouteKey) => {
    setLoading(true);
    const supabase = createClient();

    try {
      switch (route) {
        case 'subject':
          const { data: subjectsData } = await supabase
            .from('subjects')
            .select('id, name_en, name_az')
            .order('name_en');
          setSubjects(subjectsData || []);
          break;

        case 'mock-exam':
          const { data: examsData, error: examsError } = await supabase
            .from('mock_exams')
            .select('id, title')
            .order('created_at', { ascending: false });
          if (examsError) {
            console.error('Error loading mock exams:', examsError);
          }
          setMockExams(examsData || []);
          break;

        case 'teacher':
          const { data: teachersData } = await supabase
            .from('teachers')
            .select('id, profiles(full_name)')
            .eq('is_verified', true)
            .order('created_at', { ascending: false });
          // Map the data to match our Teacher interface
          setTeachers((teachersData || []).map((t: any) => ({
            id: t.id,
            profiles: t.profiles ? { full_name: t.profiles.full_name } : null
          })));
          break;

        case 'booking':
          const { data: bookingsData } = await supabase
            .from('bookings')
            .select('id, student_id, teacher_id, status, scheduled_date')
            .order('scheduled_date', { ascending: false })
            .limit(100);
          setBookings(bookingsData || []);
          break;

        case 'chat':
          const { data: conversationsData } = await supabase
            .from('conversations')
            .select('id, student_id, teacher_id, created_at')
            .order('created_at', { ascending: false })
            .limit(100);
          setConversations(conversationsData || []);
          break;
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate URL when selection changes
  useEffect(() => {
    if (mode === 'picker' && selectedRoute) {
      const route = DEEP_LINK_ROUTES[selectedRoute];
      if (route) {
        let url: string = route.path;
        if (route.requiresId && selectedId) {
          url = url.replace('{id}', selectedId);
        } else if (route.requiresId && !selectedId) {
          // Don't update if ID is required but not selected
          return;
        }
        onChange(url);
      }
    }
  }, [selectedRoute, selectedId, mode]);

  // Group routes by category
  const routesByCategory = Object.entries(DEEP_LINK_ROUTES).reduce((acc, [key, route]) => {
    const category = route.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key: key as RouteKey, ...route });
    return acc;
  }, {} as Record<string, Array<{ key: RouteKey } & typeof DEEP_LINK_ROUTES[RouteKey]>>);

  const renderIdSelector = () => {
    if (!selectedRoute || !DEEP_LINK_ROUTES[selectedRoute]?.requiresId) return null;

    const route = DEEP_LINK_ROUTES[selectedRoute];

    if (loading) {
      return (
        <div className="mt-2">
          <label className="text-sm text-gray-600">Loading {route.idLabel}s...</label>
        </div>
      );
    }

    // Filter function for search
    const filterBySearch = (items: any[], searchFields: string[]) => {
      if (!searchQuery.trim()) return items;
      const query = searchQuery.toLowerCase();
      return items.filter(item => 
        searchFields.some(field => {
          const value = field.split('.').reduce((obj, key) => obj?.[key], item);
          return value?.toString().toLowerCase().includes(query);
        })
      );
    };

    switch (selectedRoute) {
      case 'subject':
        const filteredSubjects = filterBySearch(subjects, ['name_en', 'name_az']);
        return (
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-gray-700">Search & Select Subject</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search subjects..."
              className="w-full p-2 border rounded-lg text-sm"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              size={Math.min(filteredSubjects.length + 1, 6)}
            >
              <option value="">-- Select a subject ({filteredSubjects.length} found) --</option>
              {filteredSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name_en} ({subject.name_az})
                </option>
              ))}
            </select>
          </div>
        );

      case 'mock-exam':
        const filteredExams = filterBySearch(mockExams, ['title']);
        return (
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-gray-700">Search & Select Mock Exam</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search exams..."
              className="w-full p-2 border rounded-lg text-sm"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              size={Math.min(filteredExams.length + 1, 6)}
            >
              <option value="">-- Select a mock exam ({filteredExams.length} found) --</option>
              {filteredExams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                </option>
              ))}
            </select>
          </div>
        );

      case 'teacher':
        const filteredTeachers = teachers.filter(t => {
          if (!searchQuery.trim()) return true;
          const name = t.profiles?.full_name || '';
          return name.toLowerCase().includes(searchQuery.toLowerCase());
        });
        return (
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-gray-700">Search & Select Teacher</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search teachers..."
              className="w-full p-2 border rounded-lg text-sm"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              size={Math.min(filteredTeachers.length + 1, 6)}
            >
              <option value="">-- Select a teacher ({filteredTeachers.length} found) --</option>
              {filteredTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.profiles?.full_name || 'Unknown Teacher'}
                </option>
              ))}
            </select>
          </div>
        );

      case 'booking':
        const filteredBookings = filterBySearch(bookings, ['id', 'status']);
        return (
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-gray-700">Search & Select Booking</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search bookings..."
              className="w-full p-2 border rounded-lg text-sm"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              size={Math.min(filteredBookings.length + 1, 6)}
            >
              <option value="">-- Select a booking ({filteredBookings.length} found) --</option>
              {filteredBookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  Booking {booking.id.substring(0, 8)}... - {booking.status} ({new Date(booking.scheduled_date).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        );

      case 'chat':
        const filteredConversations = filterBySearch(conversations, ['id']);
        return (
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-gray-700">Search & Select Conversation</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search conversations..."
              className="w-full p-2 border rounded-lg text-sm"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              size={Math.min(filteredConversations.length + 1, 6)}
            >
              <option value="">-- Select a conversation ({filteredConversations.length} found) --</option>
              {filteredConversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  Conversation {conversation.id.substring(0, 8)}... ({new Date(conversation.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        );

      default:
        return (
          <div className="mt-2">
            <label className="text-sm font-medium text-gray-700">Enter {route.idLabel} ID</label>
            <input
              type="text"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              placeholder={`Enter ${route.idLabel} ID`}
              className="mt-1 w-full p-2 border rounded-lg"
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setMode('picker')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            mode === 'picker'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🔗 Deep Link Picker
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            mode === 'manual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ✏️ Manual URL
        </button>
        <button
          type="button"
          onClick={() => setMode('help')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            mode === 'help'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ❓ Help & Routes
        </button>
      </div>

      {mode === 'picker' ? (
        <div className="space-y-3">
          {/* Route Selector */}
          <div>
            <label className="text-sm font-medium text-gray-700">Select Destination</label>
            <select
              value={selectedRoute}
              onChange={(e) => {
                setSelectedRoute(e.target.value as RouteKey);
                setSelectedId('');
                setSearchQuery('');
              }}
              className="mt-1 w-full p-2 border rounded-lg"
            >
              <option value="">-- Select a screen --</option>
              {Object.entries(routesByCategory).map(([category, routes]) => (
                <optgroup key={category} label={category}>
                  {routes.map((route) => (
                    <option key={route.key} value={route.key}>
                      {route.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Description */}
          {selectedRoute && (
            <p className="text-xs text-gray-500">
              {DEEP_LINK_ROUTES[selectedRoute].description}
            </p>
          )}

          {/* ID Selector (if required) */}
          {renderIdSelector()}

          {/* Preview */}
          {value && value.startsWith('elmly://') && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Generated Deep Link:</p>
              <code className="text-sm text-blue-600 break-all">{value}</code>
            </div>
          )}
        </div>
      ) : mode === 'manual' ? (
        <div>
          <label className="text-sm font-medium text-gray-700">Enter URL</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com or elmly://screen/id"
            className="mt-1 w-full p-2 border rounded-lg"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter a full URL (https://...) or a deep link (elmly://...)
          </p>
        </div>
      ) : (
        /* Help Mode - Documentation */
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">📱 Deep Linking Guide</h3>
            <p className="text-sm text-blue-700 mb-3">
              Deep links allow users to tap on a notification and be taken directly to a specific screen in the app.
            </p>
            
            <h4 className="font-medium text-blue-800 mt-3 mb-2">How to Use:</h4>
            <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
              <li>Select <strong>"Deep Link Picker"</strong> mode</li>
              <li>Choose a destination screen from the dropdown</li>
              <li>If required, search and select a specific item (exam, subject, teacher)</li>
              <li>The deep link URL is automatically generated</li>
            </ol>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="font-semibold text-gray-800 mb-3">🔗 Supported Deep Link Routes</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-gray-700">Route</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-700">Format</th>
                    <th className="text-left py-2 font-medium text-gray-700">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 pr-4 font-medium">Practice Home</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://practice</code></td>
                    <td className="py-2 text-gray-600">Opens subjects list</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Subject Detail</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://subject/{'{id}'}</code></td>
                    <td className="py-2 text-gray-600">Opens specific subject with questions</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Exams List</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://exam</code></td>
                    <td className="py-2 text-gray-600">Opens mock exams list</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Mock Exam Detail</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://mock-exam/{'{id}'}</code></td>
                    <td className="py-2 text-gray-600">Opens specific mock exam</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Teacher Profile</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://teacher/{'{id}'}</code></td>
                    <td className="py-2 text-gray-600">Opens teacher profile</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">My Profile</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://profile</code></td>
                    <td className="py-2 text-gray-600">Opens user profile</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">My Bookings</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://bookings</code></td>
                    <td className="py-2 text-gray-600">Opens bookings list</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Notifications</td>
                    <td className="py-2 pr-4"><code className="text-xs bg-gray-200 px-1 rounded">elmly://notifications</code></td>
                    <td className="py-2 text-gray-600">Opens notification center</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-semibold text-amber-800 mb-2">💡 Tips</h4>
            <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
              <li>Use the <strong>search box</strong> to quickly find exams, subjects, or teachers</li>
              <li>External URLs (https://) will open in the device's browser</li>
              <li>Deep links only work when the app is installed</li>
              <li>Test deep links before sending to all users</li>
            </ul>
          </div>
        </div>
      )}

      {/* Quick Help (shown in picker/manual modes) */}
      {mode !== 'help' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>💡 Tip:</strong> Deep links open specific screens in the app. 
            Click <strong>"Help & Routes"</strong> to see all available routes and how to use them.
          </p>
        </div>
      )}
    </div>
  );
}
