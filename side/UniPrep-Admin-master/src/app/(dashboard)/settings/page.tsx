'use client';

import { useRouter } from 'next/navigation';
import { Settings, Sliders, Shield, DollarSign, Flag, History, Award, Smartphone } from 'lucide-react';

/**
 * Central Settings Hub
 * Stage 6 - Phase 2
 * 
 * Provides access to all system settings and configurations
 */

interface SettingCategory {
  id: string;
  title: string;
  description: string;
  icon: any;
  path: string;
  badge?: string;
  color: string;
}

export default function SettingsPage() {
  const router = useRouter();

  const categories: SettingCategory[] = [
    {
      id: 'system',
      title: 'System Settings',
      description: 'Configure application-wide settings, maintenance mode, and feature flags',
      icon: Settings,
      path: '/settings/system',
      color: 'blue',
    },
    {
      id: 'scoring',
      title: 'App Settings (Scoring)',
      description: 'Configure scoring system, ELO ratings, and competitive mode settings',
      icon: Award,
      path: '/settings/scoring',
      color: 'purple',
    },
    {
      id: 'app-versions',
      title: 'App Versions',
      description: 'Manage mobile app versions for iOS and Android update system',
      icon: Smartphone,
      path: '/settings/app-versions',
      color: 'green',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; icon: string; hover: string; badge: string }> = {
      blue: {
        bg: 'bg-blue-50',
        icon: 'text-blue-600',
        hover: 'hover:border-blue-300',
        badge: 'bg-blue-100 text-blue-700',
      },
      purple: {
        bg: 'bg-purple-50',
        icon: 'text-purple-600',
        hover: 'hover:border-purple-300',
        badge: 'bg-purple-100 text-purple-700',
      },
      green: {
        bg: 'bg-green-50',
        icon: 'text-green-600',
        hover: 'hover:border-green-300',
        badge: 'bg-green-100 text-green-700',
      },
      orange: {
        bg: 'bg-orange-50',
        icon: 'text-orange-600',
        hover: 'hover:border-orange-300',
        badge: 'bg-orange-100 text-orange-700',
      },
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage system configuration and preferences</p>
      </div>

      {/* Settings Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((category) => {
          const Icon = category.icon;
          const colors = getColorClasses(category.color);
          
          return (
            <button
              key={category.id}
              onClick={() => router.push(category.path)}
              className={`relative bg-white border-2 border-gray-200 rounded-lg p-6 text-left transition-all ${colors.hover} hover:shadow-lg group`}
            >
              {/* Badge */}
              {category.badge && (
                <span className={`absolute top-4 right-4 px-2 py-1 text-xs font-semibold rounded ${colors.badge}`}>
                  {category.badge}
                </span>
              )}

              {/* Icon */}
              <div className={`w-12 h-12 ${colors.bg} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-6 h-6 ${colors.icon}`} />
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {category.title}
              </h3>
              <p className="text-sm text-gray-600">
                {category.description}
              </p>

              {/* Arrow */}
              <div className="mt-4 flex items-center text-sm font-medium text-gray-500 group-hover:text-blue-600 transition-colors">
                Configure
                <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-blue-900">About Settings</h4>
            <p className="text-sm text-blue-700 mt-1">
              Settings are organized into categories for easy management. Changes to system settings are logged in the audit trail and can affect both the admin panel and mobile app.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Recent Changes</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-900">System Settings Updated</p>
              <p className="text-xs text-gray-500">Maintenance mode disabled</p>
            </div>
            <span className="text-xs text-gray-500">2 hours ago</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-900">Feature Flag Changed</p>
              <p className="text-xs text-gray-500">AI Insights enabled</p>
            </div>
            <span className="text-xs text-gray-500">1 day ago</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Security Policy Updated</p>
              <p className="text-xs text-gray-500">Password requirements changed</p>
            </div>
            <span className="text-xs text-gray-500">3 days ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}
