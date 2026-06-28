'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { AppLogo } from '@/components/common/AppLogo';

const APP_NAME = 'Elmly';
import type { AdminRole } from '@/middleware/roleGuard';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  allowedRoles: AdminRole[]; // Roles that can access this page
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: '📊', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Analytics', href: '/analytics', icon: '📈', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Reports', href: '/reports', icon: '📑', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Waitlist', href: '/waitlist', icon: '📧', allowedRoles: ['super_admin', 'admin'] }, // Pre-launch waitlist management
  { name: 'Students', href: '/students', icon: '👥', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Teachers', href: '/teachers', icon: '👨‍🏫', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Leaderboard', href: '/leaderboard', icon: '🏆', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Questions', href: '/questions', icon: '📄', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Subjects', href: '/subjects', icon: '📚', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Exams', href: '/exams', icon: '📝', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Exam Groups', href: '/exam-groups', icon: '🎯', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Study Tips', href: '/study-tips', icon: '💡', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Notifications', href: '/notifications', icon: '📣', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'AI Management', href: '/ai-management', icon: '🤖', allowedRoles: ['super_admin', 'admin', 'moderator'] },
  { name: 'Payments', href: '/payments', icon: '💳', allowedRoles: ['super_admin', 'admin'] },
  { name: 'Audit Logs', href: '/audit-logs', icon: '📋', allowedRoles: ['super_admin'] }, // Super admin only - sensitive security data
  { name: 'Admins', href: '/admins', icon: '👔', allowedRoles: ['super_admin'] }, // Only super admins
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { role, loading } = usePermissions();

  // Filter navigation items based on user role
  const visibleNavItems = navItems.filter(item => {
    if (!role) return false;
    return item.allowedRoles.includes(role);
  });

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-gray-900 text-white rounded-lg flex items-center justify-center"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-gray-900 text-white transition-all duration-300 z-40 flex flex-col
          ${collapsed ? 'w-20' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
      {/* Logo & Brand */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <div>
              <h1 className="font-bold text-lg">{APP_NAME}</h1>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto">
            <AppLogo size="sm" />
          </div>
        )}
      </div>

      {/* Collapse Toggle - Hidden on mobile */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-gray-800 rounded-full items-center justify-center hover:bg-gray-700 transition-colors border border-gray-700"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="text-xs">{collapsed ? '→' : '←'}</span>
      </button>

      {/* Navigation - scrollable */}
      <nav className="mt-6 px-3 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                    ${isActive 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? item.name : undefined}
                >
                  <span className="text-xl">{item.icon}</span>
                  {!collapsed && (
                    <span className="font-medium">{item.name}</span>
                  )}
                  {!collapsed && isActive && (
                    <span className="ml-auto w-2 h-2 bg-white rounded-full"></span>
                  )}
                </Link>
              </li>
            );
            })}
          </ul>
        )}
      </nav>

    </aside>
    </>
  );
}
