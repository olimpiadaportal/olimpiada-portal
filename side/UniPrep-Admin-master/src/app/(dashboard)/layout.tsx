'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SessionSecurityProvider } from '@/components/security/SessionSecurityProvider';

const APP_NAME = 'Elmly';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <SessionSecurityProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar - Now responsive for all screens */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="lg:ml-64 min-h-screen flex flex-col">
          {/* Header */}
          <Header onMenuClick={() => setMobileNavOpen(true)} />

          {/* Page Content */}
          <main className="flex-1 p-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-gray-200 py-4 px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                © {new Date().getFullYear()} {APP_NAME} Admin Panel. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <a href="https://www.elmly.app/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">Privacy</a>
                <a href="https://www.elmly.app/terms" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">Terms</a>
                <a href="https://www.elmly.app/help" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">Support</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </SessionSecurityProvider>
  );
}
