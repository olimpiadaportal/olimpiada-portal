'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchItem {
  title: string;
  description: string;
  path: string;
  keywords: string[];
  icon: string; // emoji icon
  category: string;
}

const SEARCH_ITEMS: SearchItem[] = [
  // Dashboard
  { title: 'Dashboard', description: 'Overview of stats and activity', path: '/', keywords: ['home', 'overview', 'stats', 'summary'], icon: '📊', category: 'Main' },
  { title: 'My Profile', description: 'View and edit admin profile', path: '/profile', keywords: ['account', 'profile', 'name', 'role'], icon: '👤', category: 'Main' },

  // Users
  { title: 'Students', description: 'Manage student accounts and data', path: '/students', keywords: ['users', 'student', 'list', 'search', 'ban', 'block', 'accounts'], icon: '🎓', category: 'Users' },
  { title: 'Teachers', description: 'Manage teacher accounts and verification', path: '/teachers', keywords: ['teacher', 'tutor', 'verify', 'approve', 'list'], icon: '👩‍🏫', category: 'Users' },
  { title: 'Admins', description: 'Manage admin accounts and roles', path: '/admins', keywords: ['admin', 'super admin', 'moderator', 'role', 'permission'], icon: '🛡️', category: 'Users' },

  // Content
  { title: 'Questions', description: 'Manage, upload, and search questions', path: '/questions', keywords: ['mcq', 'question', 'upload', 'bulk', 'import', 'topic', 'subtopic', 'content'], icon: '❓', category: 'Content' },
  { title: 'Subjects', description: 'Manage subjects, topics, and subtopics', path: '/subjects', keywords: ['subject', 'topic', 'subtopic', 'category', 'math', 'language'], icon: '📚', category: 'Content' },
  { title: 'Study Tips', description: 'Manage daily study tips shown to students', path: '/study-tips', keywords: ['tips', 'advice', 'daily', 'study', 'motivation'], icon: '💡', category: 'Content' },

  // Exams
  { title: 'Exams', description: 'Create and manage mock exams', path: '/exams', keywords: ['mock exam', 'test', 'exam', 'create', 'publish', 'schedule'], icon: '📝', category: 'Exams' },
  { title: 'Exam Groups', description: 'Manage written/open exam question groups', path: '/exam-groups', keywords: ['exam group', 'written', 'essay', 'context', 'passage'], icon: '📋', category: 'Exams' },

  // Analytics
  { title: 'Analytics Overview', description: 'Platform analytics and key metrics', path: '/analytics', keywords: ['analytics', 'metrics', 'overview', 'stats', 'performance', 'data'], icon: '📈', category: 'Analytics' },
  { title: 'Student Analytics', description: 'Student performance and engagement data', path: '/analytics/students', keywords: ['student analytics', 'engagement', 'performance', 'activity', 'streak'], icon: '👥', category: 'Analytics' },
  { title: 'Content Analytics', description: 'Content quality and question stats', path: '/analytics/content', keywords: ['content analytics', 'quality', 'question stats', 'feedback preview'], icon: '📊', category: 'Analytics' },
  { title: 'System Analytics', description: 'System health and platform metrics', path: '/analytics/system', keywords: ['system', 'health', 'uptime', 'load', 'performance', 'server'], icon: '⚙️', category: 'Analytics' },
  { title: 'Question Feedback', description: 'Student-reported question issues', path: '/analytics/feedback', keywords: ['feedback', 'report', 'issue', 'wrong answer', 'unclear', 'complaint'], icon: '🚩', category: 'Analytics' },
  { title: 'Question Performance', description: 'Per-question accuracy and skip rates', path: '/analytics/question-performance', keywords: ['question performance', 'accuracy', 'skip rate', 'difficulty', 'engagement'], icon: '🎯', category: 'Analytics' },

  // Leaderboard
  { title: 'Leaderboard', description: 'Student rankings and ELO scores', path: '/leaderboard', keywords: ['leaderboard', 'ranking', 'score', 'elo', 'top students'], icon: '🏆', category: 'Leaderboard' },
  { title: 'Leaderboard Seasons', description: 'Manage competitive seasons', path: '/leaderboard/seasons', keywords: ['season', 'competition', 'period', 'cycle'], icon: '🗓️', category: 'Leaderboard' },
  { title: 'Leaderboard Analytics', description: 'Leaderboard performance stats', path: '/leaderboard/analytics', keywords: ['leaderboard analytics', 'season stats', 'winner'], icon: '📉', category: 'Leaderboard' },

  // Notifications
  { title: 'Notifications', description: 'View and manage all notifications', path: '/notifications', keywords: ['notification', 'push', 'message', 'alert', 'inbox'], icon: '🔔', category: 'Notifications' },
  { title: 'Compose Notification', description: 'Send notifications to users', path: '/notifications/compose', keywords: ['compose', 'send', 'push notification', 'broadcast', 'message'], icon: '✉️', category: 'Notifications' },
  { title: 'Notification Templates', description: 'Manage notification templates', path: '/notifications/templates', keywords: ['template', 'notification template', 'email template', 'format'], icon: '📄', category: 'Notifications' },
  { title: 'Notification Analytics', description: 'Notification delivery and open rates', path: '/notifications/analytics', keywords: ['notification analytics', 'delivery', 'open rate', 'click rate'], icon: '📊', category: 'Notifications' },

  // AI Management
  { title: 'AI Management', description: 'Overview of AI features and usage', path: '/ai-management', keywords: ['ai', 'artificial intelligence', 'model', 'deepseek', 'management'], icon: '🤖', category: 'AI' },
  { title: 'AI Prompts', description: 'Manage AI prompt configurations', path: '/ai-management/prompts', keywords: ['prompt', 'ai prompt', 'system prompt', 'instruction'], icon: '💬', category: 'AI' },
  { title: 'AI Costs', description: 'Track AI API usage costs', path: '/ai-management/costs', keywords: ['cost', 'billing', 'budget', 'spending', 'api cost'], icon: '💰', category: 'AI' },
  { title: 'AI Usage', description: 'Monitor AI request volume', path: '/ai-management/usage', keywords: ['usage', 'requests', 'calls', 'volume', 'rate limit'], icon: '📊', category: 'AI' },
  { title: 'AI Quality', description: 'Review AI response quality', path: '/ai-management/quality', keywords: ['quality', 'accuracy', 'review', 'ai quality'], icon: '⭐', category: 'AI' },

  // Reports
  { title: 'Reports', description: 'Generate platform reports', path: '/reports', keywords: ['report', 'export', 'download', 'csv', 'pdf', 'generate'], icon: '🗒️', category: 'Reports' },
  { title: 'Scheduled Reports', description: 'Manage automated report schedules', path: '/reports/scheduled', keywords: ['scheduled', 'automatic', 'recurring', 'report schedule'], icon: '⏰', category: 'Reports' },

  // Payments
  { title: 'Payments', description: 'View transactions and payment history', path: '/payments', keywords: ['payment', 'transaction', 'stripe', 'revenue', 'payout', 'wallet', 'money'], icon: '💳', category: 'Finance' },
  { title: 'Waitlist', description: 'Manage platform waitlist signups', path: '/waitlist', keywords: ['waitlist', 'signup', 'waiting list', 'invite', 'access'], icon: '📋', category: 'Finance' },

  // System
  { title: 'Audit Logs', description: 'View admin action audit trail', path: '/audit-logs', keywords: ['audit', 'log', 'history', 'action', 'trail', 'security log'], icon: '🔍', category: 'System' },
  { title: 'Settings', description: 'General platform settings', path: '/settings', keywords: ['settings', 'config', 'configuration', 'system settings', 'general'], icon: '⚙️', category: 'System' },
  { title: 'Scoring Settings', description: 'Configure ELO and scoring formulas', path: '/settings/scoring', keywords: ['scoring', 'elo', 'formula', 'points', 'ranking algorithm'], icon: '🎮', category: 'System' },
  { title: 'App Versions', description: 'Manage app version requirements', path: '/settings/app-versions', keywords: ['version', 'update', 'app version', 'release', 'minimum version'], icon: '📱', category: 'System' },
  { title: 'System Settings', description: 'Low-level system configuration', path: '/settings/system', keywords: ['system config', 'maintenance', 'feature flags', 'toggle'], icon: '🔧', category: 'System' },
];

function scoreMatch(item: SearchItem, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let score = 0;
  const titleLower = item.title.toLowerCase();
  const descLower = item.description.toLowerCase();

  // Exact title match → highest score
  if (titleLower === q) return 1000;
  // Title starts with query
  if (titleLower.startsWith(q)) score += 500;
  // Title contains query
  else if (titleLower.includes(q)) score += 300;
  // Description contains query
  if (descLower.includes(q)) score += 100;
  // Keyword exact match
  if (item.keywords.some(k => k === q)) score += 200;
  // Keyword starts with or contains query
  if (item.keywords.some(k => k.startsWith(q))) score += 150;
  else if (item.keywords.some(k => k.includes(q))) score += 80;

  return score;
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const results = query.trim()
    ? SEARCH_ITEMS
        .map(item => ({ item, score: scoreMatch(item, query) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.item)
    : [];

  // Group results by category for display
  const grouped = results.reduce<Record<string, SearchItem[]>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});

  // Flat list for keyboard navigation
  const flatResults = results;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = useCallback((path: string) => {
    router.push(path);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[activeIndex]) {
        navigate(flatResults[activeIndex].path);
      }
    }
  };

  return (
    <div className="relative hidden md:block">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search pages… (⌘K)"
          className="w-64 pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && flatResults.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 left-0 w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 max-h-[480px] overflow-y-auto"
        >
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                {category}
              </div>
              {items.map(item => {
                const globalIdx = flatResults.indexOf(item);
                const isActive = globalIdx === activeIndex;
                return (
                  <button
                    key={item.path}
                    onMouseEnter={() => setActiveIndex(globalIdx)}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xl leading-none shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{item.description}</p>
                    </div>
                    {isActive && (
                      <kbd className="ml-auto shrink-0 text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && query.trim() && flatResults.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 left-0 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
        >
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No pages found for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}
